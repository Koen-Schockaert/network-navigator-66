"use strict";

const os = require("node:os");
const net = require("node:net");
const dns = require("node:dns").promises;
const { exec } = require("node:child_process");
const { lookupVendor, normalizeMac } = require("./oui.cjs");

/** Common ports we probe by default. */
const DEFAULT_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 143, 161, 443, 445, 515, 548, 631, 993, 995,
  1883, 3000, 3306, 3389, 5000, 5060, 5432, 5900, 8006, 8080, 8443, 9100,
];

const PORT_LABELS = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  161: "SNMP",
  443: "HTTPS",
  445: "SMB",
  515: "LPD",
  548: "AFP",
  631: "IPP",
  993: "IMAPS",
  995: "POP3S",
  1883: "MQTT",
  3000: "HTTP-alt",
  3306: "MySQL",
  3389: "RDP",
  5000: "UPnP",
  5060: "SIP",
  5432: "PostgreSQL",
  5900: "VNC",
  8006: "Proxmox",
  8080: "HTTP-alt",
  8443: "HTTPS-alt",
  9100: "Printer (RAW)",
};

/* ------------------------------------------------------------------ */
/* IP helpers                                                          */
/* ------------------------------------------------------------------ */

function ipToInt(ip) {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function intToIp(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function isIpv4(value) {
  return ipToInt(value) !== null;
}

/**
 * Expand a target into a list of IPv4 addresses.
 * Accepts: "192.168.1.0/24", "192.168.1.10-192.168.1.50", "192.168.1.5",
 * or any newline/comma separated combination of those.
 */
function expandTargets(input) {
  const out = [];
  const seen = new Set();
  const push = (ip) => {
    if (!seen.has(ip)) {
      seen.add(ip);
      out.push(ip);
    }
  };

  const chunks = String(input || "")
    .split(/[\s,;]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    if (chunk.includes("/")) {
      const [base, bitsRaw] = chunk.split("/");
      const bits = Number(bitsRaw);
      const baseInt = ipToInt(base);
      if (baseInt === null || !Number.isInteger(bits) || bits < 8 || bits > 32) {
        continue;
      }
      const size = 2 ** (32 - bits);
      if (size > 65536) continue; // guard against absurd ranges
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      const network = (baseInt & mask) >>> 0;
      const first = size <= 2 ? network : network + 1;
      const last = size <= 2 ? network + size - 1 : network + size - 2;
      for (let i = first; i <= last; i++) push(intToIp(i >>> 0));
      continue;
    }

    if (chunk.includes("-")) {
      const [startRaw, endRaw] = chunk.split("-");
      const start = ipToInt(startRaw);
      // Support both "10.0.0.1-10.0.0.50" and "10.0.0.1-50"
      const end = endRaw && endRaw.includes(".")
        ? ipToInt(endRaw)
        : start !== null && endRaw
          ? (start & 0xffffff00) + Number(endRaw)
          : null;
      if (start === null || end === null || end < start) continue;
      if (end - start > 65536) continue;
      for (let i = start; i <= end; i++) push(intToIp(i >>> 0));
      continue;
    }

    if (isIpv4(chunk)) push(chunk);
  }

  return out;
}

/** Count how many addresses a target expression covers (cheap preview). */
function countTargets(input) {
  return expandTargets(input).length;
}

/* ------------------------------------------------------------------ */
/* Local interface detection                                           */
/* ------------------------------------------------------------------ */

function prefixFromNetmask(netmask) {
  const value = ipToInt(netmask);
  if (value === null) return 24;
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((value >>> i) & 1) bits++;
    else break;
  }
  return bits;
}

/** Detect usable local IPv4 networks in CIDR form. */
function detectLocalNetworks() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal) continue;
      const prefix = prefixFromNetmask(address.netmask);
      const ipInt = ipToInt(address.address);
      if (ipInt === null) continue;
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      const network = intToIp((ipInt & mask) >>> 0);
      results.push({
        interface: name,
        address: address.address,
        netmask: address.netmask,
        mac: normalizeMac(address.mac),
        cidr: `${network}/${prefix}`,
        hostCount: prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2,
      });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* ARP table                                                           */
/* ------------------------------------------------------------------ */

function run(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 8000, windowsHide: true }, (error, stdout) => {
      resolve(error && !stdout ? "" : String(stdout || ""));
    });
  });
}

/** Read the system ARP/neighbour table into a { ip: mac } map. */
async function readArpTable() {
  const table = {};
  const platform = process.platform;
  const outputs = [];

  if (platform === "win32") {
    outputs.push(await run("arp -a"));
  } else {
    outputs.push(await run("ip neigh show"));
    outputs.push(await run("arp -an"));
  }

  for (const output of outputs) {
    if (!output) continue;
    for (const line of output.split("\n")) {
      const ipMatch = line.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      const macMatch = line.match(
        /((?:[0-9a-fA-F]{1,2}[:-]){5}[0-9a-fA-F]{1,2})/,
      );
      if (!ipMatch || !macMatch) continue;
      const mac = normalizeMac(macMatch[1]);
      if (!mac || mac === "00:00:00:00:00:00") continue;
      if (!table[ipMatch[1]]) table[ipMatch[1]] = mac;
    }
  }

  return table;
}

/* ------------------------------------------------------------------ */
/* Probes                                                              */
/* ------------------------------------------------------------------ */

/** Check whether a single TCP port is open. */
function checkPort(ip, port, timeout = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip);
  });
}

/** ICMP ping via the system ping binary. Returns latency in ms or null. */
async function pingHost(ip, timeoutMs = 1000) {
  const started = Date.now();
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  const command =
    process.platform === "win32"
      ? `ping -n 1 -w ${timeoutMs} ${ip}`
      : process.platform === "darwin"
        ? `ping -c 1 -W ${timeoutMs} -t ${seconds} ${ip}`
        : `ping -c 1 -W ${seconds} -w ${seconds} ${ip}`;

  const output = await run(command);
  if (!output) return null;
  const alive =
    /ttl[=<]/i.test(output) ||
    /1 (?:packets )?received/i.test(output) ||
    /Received = 1/i.test(output);
  if (!alive) return null;
  const timeMatch = output.match(/time[=<]\s?([\d.]+)\s?ms/i);
  return timeMatch ? Number(timeMatch[1]) : Date.now() - started;
}

const hostnameCache = new Map();
const toolAvailability = new Map();

function cleanName(raw) {
  if (!raw) return null;
  let name = String(raw).trim().replace(/\.$/, "");
  if (!name || name.length > 253) return null;
  if (isIpv4(name)) return null;
  if (/^(?:in-addr\.arpa|localhost|unknown|failed|name or service not known)$/i.test(name)) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  // Strip a trailing local search domain duplicate like "nas.local.local"
  name = name.replace(/(\.local)+$/i, ".local");
  return name;
}

/** Check once whether a CLI helper exists on this machine. */
async function hasTool(tool) {
  if (toolAvailability.has(tool)) return toolAvailability.get(tool);
  const probe =
    process.platform === "win32" ? `where ${tool}` : `command -v ${tool} 2>/dev/null`;
  const output = await run(probe);
  const available = Boolean(output && output.trim());
  toolAvailability.set(tool, available);
  return available;
}

/** 1. Standard reverse DNS through the configured resolvers. */
async function tryReverseDns(ip) {
  try {
    const names = await dns.reverse(ip);
    return cleanName(names && names[0]);
  } catch {
    return null;
  }
}

/** 2. /etc/hosts, NSS and mDNS via getent (Linux/macOS). */
async function tryGetent(ip) {
  if (process.platform === "win32") return null;
  if (!(await hasTool("getent"))) return null;
  const output = await run(`getent hosts ${ip}`);
  const parts = output.trim().split(/\s+/);
  return parts.length > 1 ? cleanName(parts[1]) : null;
}

/** 3. mDNS / Bonjour (Apple TV, printers, NAS, IoT). */
async function tryMdns(ip) {
  if (await hasTool("avahi-resolve")) {
    const output = await run(`avahi-resolve -a ${ip}`);
    const parts = output.trim().split(/\s+/);
    if (parts.length > 1) {
      const name = cleanName(parts[1]);
      if (name) return name;
    }
  }
  if (process.platform === "darwin" && (await hasTool("dscacheutil"))) {
    const output = await run(`dscacheutil -q host -a ip_address ${ip}`);
    const match = output.match(/name:\s*(\S+)/i);
    if (match) {
      const name = cleanName(match[1]);
      if (name) return name;
    }
  }
  return null;
}

/** 4. NetBIOS names (Windows machines, Samba shares, printers). */
async function tryNetbios(ip) {
  if (process.platform === "win32") {
    const output = await run(`nbtstat -A ${ip}`);
    const match = output.match(/^\s*(\S+)\s+<00>\s+UNIQUE/im);
    return match ? cleanName(match[1]) : null;
  }
  if (!(await hasTool("nmblookup"))) return null;
  const output = await run(`nmblookup -A ${ip}`);
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\S+)\s+<00>\s+-\s+([BMH]\s+)?<ACTIVE>/i);
    if (match && !/^GROUP$/i.test(match[1])) {
      const name = cleanName(match[1]);
      if (name) return name;
    }
  }
  return null;
}

/** 5. Explicit PTR query against the local resolvers / router. */
async function tryDig(ip) {
  if (process.platform === "win32") return null;
  if (await hasTool("dig")) {
    const output = await run(`dig +short +time=1 +tries=1 -x ${ip}`);
    const first = output.split("\n").map((l) => l.trim()).filter(Boolean)[0];
    const name = cleanName(first);
    if (name) return name;
  }
  if (await hasTool("host")) {
    const output = await run(`host -W 1 ${ip}`);
    const match = output.match(/domain name pointer\s+(\S+)/i);
    if (match) return cleanName(match[1]);
  }
  return null;
}

/**
 * Resolve a hostname using every method available on this machine, in order of
 * speed/reliability: reverse DNS -> hosts/NSS -> mDNS -> NetBIOS -> explicit PTR.
 * Results (including misses) are cached for the lifetime of the process.
 */
async function resolveHostname(ip) {
  if (hostnameCache.has(ip)) return hostnameCache.get(ip);

  let name = null;
  for (const strategy of [tryReverseDns, tryGetent, tryMdns, tryNetbios, tryDig]) {
    try {
      name = await strategy(ip);
    } catch {
      name = null;
    }
    if (name) break;
  }

  hostnameCache.set(ip, name);
  return name;
}

/** Drop cached lookups so a fresh scan re-resolves names. */
function clearHostnameCache() {
  hostnameCache.clear();
}


/* ------------------------------------------------------------------ */
/* Scan orchestration                                                  */
/* ------------------------------------------------------------------ */

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length))
    .fill(null)
    .map(async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    });
  await Promise.all(runners);
  return results;
}

/**
 * Scan a target expression and return discovered hosts.
 *
 * options:
 *  - ports: number[]            ports to probe (default DEFAULT_PORTS)
 *  - concurrency: number        parallel hosts (default 64)
 *  - timeout: number            per-probe timeout in ms (default 1000)
 *  - resolveHostnames: boolean  reverse DNS (default true)
 *  - scanPorts: boolean         probe TCP ports (default true)
 *  - signal: { aborted: boolean }  cooperative cancellation
 *  - onProgress: (progress) => void
 */
async function scanNetwork(target, options = {}) {
  const {
    ports = DEFAULT_PORTS,
    concurrency = 64,
    timeout = 1000,
    resolveHostnames = true,
    scanPorts = true,
    signal,
    onProgress,
  } = options;

  const hosts = expandTargets(target);
  const startedAt = new Date().toISOString();
  const devices = [];
  let completed = 0;

  const emit = (currentIp) => {
    if (typeof onProgress !== "function") return;
    onProgress({
      total: hosts.length,
      completed,
      found: devices.length,
      currentIp: currentIp || null,
      percent: hosts.length ? Math.round((completed / hosts.length) * 100) : 100,
    });
  };

  emit(null);

  await mapWithConcurrency(hosts, concurrency, async (ip) => {
    if (signal && signal.aborted) {
      completed++;
      return null;
    }

    let responseTime = await pingHost(ip, timeout);
    let openPorts = [];

    // Hosts that block ICMP still answer TCP - probe a few quick ports.
    if (responseTime === null) {
      const quickPorts = [80, 443, 22, 445, 8080];
      const quick = await Promise.all(
        quickPorts.map((port) => checkPort(ip, port, Math.min(timeout, 600))),
      );
      const hit = quick.findIndex(Boolean);
      if (hit !== -1) {
        responseTime = 0;
        openPorts.push(quickPorts[hit]);
      }
    }

    if (responseTime === null) {
      completed++;
      emit(ip);
      return null;
    }

    if (scanPorts && ports.length) {
      const results = await mapWithConcurrency(ports, 24, async (port) =>
        (await checkPort(ip, port, Math.min(timeout, 800))) ? port : null,
      );
      openPorts = Array.from(
        new Set([...openPorts, ...results.filter((p) => p !== null)]),
      ).sort((a, b) => a - b);
    }

    const hostname = resolveHostnames ? await resolveHostname(ip) : null;

    const device = {
      ip,
      hostname,
      mac: null,
      vendor: null,
      online: true,
      responseTime,
      openPorts,
    };
    devices.push(device);
    completed++;
    emit(ip);
    return device;
  });

  // Fill MAC + vendor from the ARP table once, after the sweep populated it.
  const arp = await readArpTable();
  for (const device of devices) {
    const mac = arp[device.ip] || null;
    device.mac = mac;
    device.vendor = mac ? lookupVendor(mac) : null;
  }

  devices.sort((a, b) => (ipToInt(a.ip) || 0) - (ipToInt(b.ip) || 0));
  emit(null);

  return {
    target,
    startedAt,
    finishedAt: new Date().toISOString(),
    hostsScanned: hosts.length,
    devices,
    aborted: Boolean(signal && signal.aborted),
  };
}

module.exports = {
  DEFAULT_PORTS,
  PORT_LABELS,
  checkPort,
  countTargets,
  detectLocalNetworks,
  expandTargets,
  intToIp,
  ipToInt,
  isIpv4,
  pingHost,
  readArpTable,
  resolveHostname,
  scanNetwork,
};
