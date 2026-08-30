"use strict";

/**
 * Pure-Node hostname discovery helpers.
 *
 * These do NOT depend on CLI tools (dig, avahi-resolve, nmblookup, ...), which
 * are usually missing inside the Electron app bundle and the Docker image.
 * They speak the wire protocols directly over UDP:
 *   - mDNS  (multicast DNS, udp/5353)   -> Apple, printers, NAS, IoT, Linux
 *   - NetBIOS node status (udp/137)     -> Windows, Samba, printers, NAS
 *   - unicast DNS PTR to the router     -> DHCP client names on most routers
 */

const dgram = require("node:dgram");
const os = require("node:os");

/* ------------------------------------------------------------------ */
/* Minimal DNS message encoding/decoding                               */
/* ------------------------------------------------------------------ */

function encodeName(name) {
  const parts = name.split(".").filter(Boolean);
  const buffers = parts.map((part) => {
    const label = Buffer.from(part, "utf8").subarray(0, 63);
    return Buffer.concat([Buffer.from([label.length]), label]);
  });
  return Buffer.concat([...buffers, Buffer.from([0])]);
}

function buildPtrQuery(name, id, unicastResponse) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0000, 2); // standard query, no recursion flag needed
  header.writeUInt16BE(1, 4); // qdcount
  const qname = encodeName(name);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(12, 0); // QTYPE = PTR
  tail.writeUInt16BE(unicastResponse ? 0x8001 : 0x0001, 2); // QCLASS IN (+ QU bit)
  return Buffer.concat([header, qname, tail]);
}

function readName(buffer, offset, depth = 0) {
  const labels = [];
  let position = offset;
  let jumped = false;
  let end = offset;

  while (position < buffer.length && depth < 10) {
    const length = buffer[position];
    if (length === 0) {
      position += 1;
      if (!jumped) end = position;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      if (position + 1 >= buffer.length) return null;
      const pointer = ((length & 0x3f) << 8) | buffer[position + 1];
      if (!jumped) end = position + 2;
      jumped = true;
      const nested = readName(buffer, pointer, depth + 1);
      if (nested && nested.name) labels.push(nested.name);
      break;
    }
    position += 1;
    if (position + length > buffer.length) return null;
    labels.push(buffer.subarray(position, position + length).toString("utf8"));
    position += length;
    if (!jumped) end = position;
  }

  return { name: labels.join("."), end };
}

/** Extract the first PTR answer name from a DNS/mDNS response. */
function parsePtrAnswer(buffer) {
  if (buffer.length < 12) return null;
  const qdcount = buffer.readUInt16BE(4);
  const ancount = buffer.readUInt16BE(6);
  if (!ancount) return null;

  let offset = 12;
  for (let i = 0; i < qdcount; i++) {
    const parsed = readName(buffer, offset);
    if (!parsed) return null;
    offset = parsed.end + 4;
  }

  for (let i = 0; i < ancount; i++) {
    const parsed = readName(buffer, offset);
    if (!parsed) return null;
    offset = parsed.end;
    if (offset + 10 > buffer.length) return null;
    const type = buffer.readUInt16BE(offset);
    const rdlength = buffer.readUInt16BE(offset + 8);
    offset += 10;
    if (type === 12) {
      const target = readName(buffer, offset);
      if (target && target.name) return target.name;
    }
    offset += rdlength;
  }
  return null;
}

function reverseName(ip) {
  return `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
}

/* ------------------------------------------------------------------ */
/* mDNS reverse lookup                                                 */
/* ------------------------------------------------------------------ */

function mdnsReverse(ip, timeout = 900) {
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket && socket.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);

    try {
      socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    } catch {
      return finish(null);
    }

    socket.on("error", () => finish(null));
    socket.on("message", (msg) => {
      const name = parsePtrAnswer(msg);
      if (name) finish(name);
    });

    socket.bind(0, () => {
      try {
        socket.setMulticastTTL(255);
      } catch {
        /* ignore */
      }
      const query = buildPtrQuery(reverseName(ip), 0, true);
      // Ask the device directly (unicast mDNS) and via multicast.
      socket.send(query, 5353, ip, () => {});
      socket.send(query, 5353, "224.0.0.251", () => {});
    });
  });
}

/* ------------------------------------------------------------------ */
/* NetBIOS node status                                                 */
/* ------------------------------------------------------------------ */

function buildNbstatQuery() {
  const header = Buffer.from([
    0x00, 0x00, // transaction id
    0x00, 0x00, // flags
    0x00, 0x01, // qdcount
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  // Encoded wildcard name "*" -> "CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  const encoded = Buffer.from("CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "ascii");
  const name = Buffer.concat([Buffer.from([encoded.length]), encoded, Buffer.from([0x00])]);
  const tail = Buffer.from([0x00, 0x21, 0x00, 0x01]); // NBSTAT, IN
  return Buffer.concat([header, name, tail]);
}

function parseNbstat(buffer) {
  // Header (12) + question name + 4 + answer name + type/class/ttl/rdlength
  let offset = 12;
  while (offset < buffer.length && buffer[offset] !== 0) offset += buffer[offset] + 1;
  offset += 1 + 4; // null + qtype/qclass
  while (offset < buffer.length && buffer[offset] !== 0) offset += buffer[offset] + 1;
  offset += 1 + 2 + 2 + 4 + 2; // null + type + class + ttl + rdlength
  if (offset >= buffer.length) return null;
  const count = buffer[offset];
  offset += 1;
  for (let i = 0; i < count; i++) {
    if (offset + 18 > buffer.length) break;
    const rawName = buffer.subarray(offset, offset + 15).toString("ascii").trim();
    const suffix = buffer[offset + 15];
    const flags = buffer.readUInt16BE(offset + 16);
    const isGroup = (flags & 0x8000) !== 0;
    offset += 18;
    if (suffix === 0x00 && !isGroup && rawName) return rawName;
  }
  return null;
}

function netbiosName(ip, timeout = 700) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = dgram.createSocket("udp4");
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);
    socket.on("error", () => finish(null));
    socket.on("message", (msg) => {
      try {
        finish(parseNbstat(msg));
      } catch {
        finish(null);
      }
    });
    socket.send(buildNbstatQuery(), 137, ip, (err) => {
      if (err) finish(null);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Unicast DNS PTR against a specific server (router / local resolver) */
/* ------------------------------------------------------------------ */

function dnsPtr(ip, server, timeout = 700) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = dgram.createSocket("udp4");
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);
    socket.on("error", () => finish(null));
    socket.on("message", (msg) => finish(parsePtrAnswer(msg)));
    const query = buildPtrQuery(reverseName(ip), Math.floor(Math.random() * 65535), false);
    query.writeUInt16BE(0x0100, 2); // recursion desired
    socket.send(query, 53, server, (err) => {
      if (err) finish(null);
    });
  });
}

/** Candidate local resolvers: configured DNS servers + likely gateways. */
function localResolvers() {
  const servers = new Set();
  try {
    for (const server of require("node:dns").getServers()) {
      const clean = server.replace(/^\[|\]$/g, "").split("%")[0];
      if (/^\d+\.\d+\.\d+\.\d+$/.test(clean) && clean !== "127.0.0.1") servers.add(clean);
    }
  } catch {
    /* ignore */
  }
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const parts = iface.address.split(".");
      servers.add(`${parts[0]}.${parts[1]}.${parts[2]}.1`);
    }
  }
  return [...servers].slice(0, 4);
}

module.exports = { mdnsReverse, netbiosName, dnsPtr, localResolvers };
