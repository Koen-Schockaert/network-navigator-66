"use strict";

const os = require("node:os");
const net = require("node:net");
const dns = require("node:dns").promises;
const { exec } = require("node:child_process");
const { lookupVendor, normalizeMac } = require("./oui.cjs");
const {
  mdnsReverse,
  netbiosName,
  dnsPtr,
  localResolvers,
  mdnsDiscover,
} = require("./hostname.cjs");

/** Common ports we probe by default. */
const DEFAULT_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 143, 161, 443, 445, 515, 548, 631, 993, 995, 1883, 3000, 3306, 3389,
  5000, 5060, 5432, 5900, 8006, 8080, 8443, 9100,
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

const DEEP_PORT_LABELS = {
  20: "FTP-data",
  69: "TFTP",
  88: "Kerberos",
  111: "RPC",
  123: "NTP",
  135: "MS-RPC",
  137: "NetBIOS-NS",
  138: "NetBIOS-DGM",
  139: "NetBIOS-SSN",
  179: "BGP",
  389: "LDAP",
  465: "SMTPS",
  500: "IKE/VPN",
  514: "Syslog",
  587: "SMTP-submission",
  636: "LDAPS",
  873: "rsync",
  902: "VMware",
  1194: "OpenVPN",
  1433: "MSSQL",
  1521: "Oracle DB",
  1723: "PPTP",
  2049: "NFS",
  2181: "ZooKeeper",
  2222: "SSH-alt",
  2375: "Docker",
  2379: "etcd",
  3128: "Squid proxy",
  3260: "iSCSI",
  3690: "SVN",
  4369: "EPMD (Erlang)",
  5222: "XMPP",
  5353: "mDNS",
  5601: "Kibana",
  5672: "AMQP",
  5984: "CouchDB",
  5985: "WinRM",
  5986: "WinRM-HTTPS",
  6379: "Redis",
  6443: "Kubernetes API",
  6667: "IRC",
  7474: "Neo4j",
  7547: "TR-069",
  8086: "InfluxDB",
  8123: "Home Assistant",
  8291: "MikroTik",
  8333: "Bitcoin",
  8384: "Syncthing",
  8554: "RTSP",
  8888: "HTTP-alt",
  9000: "HTTP-alt",
  9042: "Cassandra",
  9090: "Prometheus",
  9200: "Elasticsearch",
  9300: "Elasticsearch-transport",
  10000: "Webmin",
  10250: "Kubelet",
  11211: "Memcached",
  15672: "RabbitMQ mgmt",
  25565: "Minecraft",
  27017: "MongoDB",
  32400: "Plex",
  47808: "BACnet",
};

// Merged in place so PORT_LABELS stays the single map the rest of the module
// (and getInfo()'s frontend payload) already reads from.
Object.assign(PORT_LABELS, DEEP_PORT_LABELS);

/**
 * Extra ports probed by the "deep" profile only - less universally common
 * than DEFAULT_PORTS, but frequent enough on home/office LANs to be worth
 * the extra probe time (dev servers, databases, remote admin, media, IoT).
 */
const DEEP_EXTRA_PORTS = [
  20, 69, 88, 111, 123, 135, 137, 138, 139, 179, 389, 427, 465, 500, 512, 513, 514, 587, 636, 646,
  873, 902, 989, 990, 1025, 1194, 1433, 1521, 1701, 1723, 2000, 2049, 2181, 2222, 2375, 2379, 2483,
  2484, 3128, 3260, 3268, 3690, 4000, 4369, 4500, 5001, 5222, 5353, 5355, 5601, 5671, 5672, 5984,
  5985, 5986, 6000, 6379, 6443, 6667, 7000, 7001, 7070, 7474, 7547, 8000, 8008, 8081, 8086, 8087,
  8089, 8123, 8181, 8200, 8291, 8333, 8384, 8388, 8554, 8888, 8889, 8899, 9000, 9001, 9042, 9090,
  9091, 9200, 9300, 9999, 10000, 10250, 11211, 15672, 20000, 25565, 27017, 32400, 32469, 47808,
  49152,
];

const DEEP_PORTS = Array.from(new Set([...DEFAULT_PORTS, ...DEEP_EXTRA_PORTS])).sort((a, b) => a - b);

/**
 * Named presets so callers (UI, API, IPC) can request a tradeoff by name
 * instead of assembling raw scanNetwork() options. "standard" is deliberately
 * `{}` so it's defined by - and can never drift from - scanNetwork()'s own
 * defaults.
 */
const SCAN_PROFILES = {
  quick: { scanPorts: false, timeout: 600 },
  standard: {},
  deep: { ports: DEEP_PORTS },
};
const DEFAULT_SCAN_PROFILE = "standard";

/** Resolve a named profile (falling back to the default) into scanNetwork() option overrides. */
function resolveScanProfile(profile) {
  return SCAN_PROFILES[profile] || SCAN_PROFILES[DEFAULT_SCAN_PROFILE];
}

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
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
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
      const end =
        endRaw && endRaw.includes(".")
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
      const macMatch = line.match(/((?:[0-9a-fA-F]{1,2}[:-]){5}[0-9a-fA-F]{1,2})/);
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
  const probe = process.platform === "win32" ? `where ${tool}` : `command -v ${tool} 2>/dev/null`;
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

/** Resolve with the first non-null settlement; null once every promise has settled. */
function firstResolved(promises) {
  return new Promise((resolve) => {
    let remaining = promises.length;
    if (!remaining) return resolve(null);
    for (const promise of promises) {
      promise.then(
        (value) => {
          if (value) resolve(value);
          else if (--remaining === 0) resolve(null);
        },
        () => {
          if (--remaining === 0) resolve(null);
        },
      );
    }
  });
}

/** 5. Explicit PTR query against the local resolvers / router. */
async function tryDig(ip) {
  if (process.platform === "win32") return null;
  if (await hasTool("dig")) {
    const output = await run(`dig +short +time=1 +tries=1 -x ${ip}`);
    const first = output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0];
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
/** 6. Native mDNS reverse lookup (no CLI tools needed). */
async function tryNativeMdns(ip) {
  return cleanName(await mdnsReverse(ip));
}

/** 7. Native NetBIOS node status query (no CLI tools needed). */
async function tryNativeNetbios(ip) {
  return cleanName(await netbiosName(ip));
}

/** 8. Native PTR query straight at the router / local resolvers, raced in parallel. */
async function tryNativeDnsPtr(ip) {
  const servers = localResolvers();
  if (!servers.length) return null;
  return firstResolved(
    servers.map((server) =>
      dnsPtr(ip, server)
        .then(cleanName)
        .catch(() => null),
    ),
  );
}

/**
 * Resolve a hostname by racing every strategy available on this machine
 * concurrently and taking whichever answers first, bounded by `timeoutMs` so
 * one slow/unreachable resolver can't stall the whole lookup. Only a
 * positive result is cached: a miss isn't remembered, so the same IP gets a
 * fresh chance on the next scan instead of being stuck blank forever.
 */
async function resolveHostname(ip, { timeoutMs = 1800, onLate } = {}) {
  const cached = hostnameCache.get(ip);
  if (cached) return cached;

  const attempts = [
    tryNativeMdns,
    tryNativeNetbios,
    tryNativeDnsPtr,
    tryReverseDns,
    tryGetent,
    tryMdns,
    tryNetbios,
    tryDig,
  ].map((strategy) => strategy(ip).catch(() => null));

  // A straggler that answers after we've already given up on this call is
  // still worth keeping: cache it and let the caller know, so a slow-but-
  // correct source (e.g. a loaded router) isn't wasted.
  Promise.allSettled(attempts).then((settled) => {
    if (hostnameCache.get(ip)) return;
    const late = settled.find((r) => r.status === "fulfilled" && r.value);
    if (late) {
      hostnameCache.set(ip, late.value);
      if (onLate) onLate(late.value);
    }
  });

  const name = await Promise.race([
    firstResolved(attempts),
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (name) hostnameCache.set(ip, name);
  return name;
}

/* ------------------------------------------------------------------ */
/* Scan orchestration                                                  */
/* ------------------------------------------------------------------ */

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Resolve hostnames for already-discovered devices in the background,
 * off the critical path of the scan itself. `scanNetwork` returns as soon
 * as the ping/port sweep is done; this keeps running afterwards and reports
 * each name back through `onResolved` as it arrives, so a slow lookup for
 * one device never holds up the rest of the scan.
 */
async function enrichHostnames(devices, { signal, onResolved } = {}) {
  if (!devices.length) return;

  // One shared mDNS listen covers many devices at once and finds names
  // that a per-host reverse lookup usually can't (see mdnsDiscover) - run
  // it first so the slower per-host fallback only has to chase whatever's
  // left.
  const discovered = await mdnsDiscover().catch(() => new Map());
  for (const [ip, rawName] of discovered) {
    if (signal && signal.aborted) break;
    const device = devices.find((d) => d.ip === ip);
    const name = cleanName(rawName);
    if (device && name && !device.hostname) {
      device.hostname = name;
      if (onResolved) onResolved(ip, name);
    }
  }

  const remaining = devices.filter((d) => !d.hostname);
  if (!remaining.length) return;

  await mapWithConcurrency(remaining, Math.min(32, remaining.length), async (device) => {
    if (signal && signal.aborted) return;
    const name = await resolveHostname(device.ip, {
      onLate: (lateName) => {
        device.hostname = device.hostname || lateName;
        if (onResolved) onResolved(device.ip, lateName);
      },
    });
    if (name) {
      device.hostname = name;
      if (onResolved) onResolved(device.ip, name);
    }
  });
}

/**
 * Scan a target expression and return discovered hosts.
 *
 * options:
 *  - ports: number[]            ports to probe (default DEFAULT_PORTS)
 *  - concurrency: number        parallel hosts (default 64)
 *  - timeout: number            per-probe timeout in ms (default 1000)
 *  - resolveHostnames: boolean  resolve hostnames in the background (default true)
 *  - scanPorts: boolean         probe TCP ports (default true)
 *  - signal: { aborted: boolean }  cooperative cancellation
 *  - onProgress: (progress) => void
 *  - onHostnameResolved: (ip, hostname) => void   fired as background lookups land
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
    onHostnameResolved,
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
      openPorts = Array.from(new Set([...openPorts, ...results.filter((p) => p !== null)])).sort(
        (a, b) => a - b,
      );
    }

    const device = {
      ip,
      hostname: null,
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

  if (resolveHostnames) {
    // Fire-and-forget: don't make the scan wait on the slowest hostname
    // lookup. Callers that care hear about each name via onHostnameResolved.
    enrichHostnames(devices, { signal, onResolved: onHostnameResolved }).catch(() => {});
  }

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
  DEEP_PORTS,
  DEFAULT_PORTS,
  DEFAULT_SCAN_PROFILE,
  PORT_LABELS,
  SCAN_PROFILES,
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
  resolveScanProfile,
  scanNetwork,
};
