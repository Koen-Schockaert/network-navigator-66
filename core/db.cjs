"use strict";

/**
 * Storage layer for the network scanner.
 *
 * Uses node:sqlite when the runtime provides it, and transparently falls back
 * to an atomic JSON file store otherwise (older Node builds, restricted
 * runtimes). Both backends expose the exact same repository API, so callers
 * never need to know which one is active.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { guessCategory } = require("./category.cjs");

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/* ------------------------------------------------------------------ */
/* JSON backend                                                        */
/* ------------------------------------------------------------------ */

function createJsonBackend(file) {
  const empty = {
    networks: [],
    scan_runs: [],
    devices: [],
    scan_results: [],
    device_history: [],
    vault_meta: [],
    credentials: [],
    webhook_config: [],
  };

  let state = { ...empty };
  ensureDir(file);
  if (fs.existsSync(file)) {
    try {
      state = { ...empty, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch {
      state = { ...empty };
    }
  }

  let writeTimer = null;
  const flush = () => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  };
  const persist = () => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(flush, 50);
    if (writeTimer.unref) writeTimer.unref();
  };

  return {
    kind: "json",
    all: (table) => state[table].slice(),
    insert: (table, row) => {
      state[table].push(row);
      persist();
      return row;
    },
    update: (table, id, patch) => {
      const row = state[table].find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      persist();
      return row;
    },
    remove: (table, predicate) => {
      state[table] = state[table].filter((row) => !predicate(row));
      persist();
    },
    close: () => flush(),
  };
}

/* ------------------------------------------------------------------ */
/* SQLite backend                                                      */
/* ------------------------------------------------------------------ */

const TABLE_COLUMNS = {
  networks: ["id", "name", "cidr", "source", "created_at", "updated_at"],
  scan_runs: [
    "id",
    "network_id",
    "started_at",
    "finished_at",
    "status",
    "hosts_scanned",
    "devices_found",
    "new_devices",
    "missing_devices",
  ],
  devices: [
    "id",
    "network_id",
    "ip",
    "hostname",
    "mac",
    "vendor",
    "online",
    "response_time",
    "open_ports",
    "first_seen",
    "last_seen",
    "notes",
    "label",
    "category",
  ],
  scan_results: [
    "id",
    "scan_id",
    "device_id",
    "ip",
    "online",
    "response_time",
    "open_ports",
    "created_at",
  ],
  device_history: ["id", "device_id", "scan_id", "event", "detail", "created_at"],
  vault_meta: [
    "id",
    "salt",
    "kdf",
    "kdf_n",
    "kdf_r",
    "kdf_p",
    "verifier",
    "verifier_iv",
    "verifier_tag",
    "created_at",
    "updated_at",
  ],
  credentials: [
    "id",
    "device_id",
    "label",
    "protocol",
    "host_override",
    "port",
    "username",
    "secret_type",
    "secret_ciphertext",
    "secret_iv",
    "secret_tag",
    "created_at",
    "updated_at",
  ],
  webhook_config: ["id", "url", "enabled", "events", "created_at", "updated_at"],
};

function createSqliteBackend(file) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return null;
  }
  if (!DatabaseSync) return null;

  let db;
  try {
    ensureDir(file);
    db = new DatabaseSync(file);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS networks (
        id TEXT PRIMARY KEY, name TEXT, cidr TEXT, source TEXT,
        created_at TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS scan_runs (
        id TEXT PRIMARY KEY, network_id TEXT, started_at TEXT,
        finished_at TEXT, status TEXT, hosts_scanned INTEGER,
        devices_found INTEGER, new_devices INTEGER, missing_devices INTEGER
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, network_id TEXT, ip TEXT, hostname TEXT,
        mac TEXT, vendor TEXT, online INTEGER, response_time REAL,
        open_ports TEXT, first_seen TEXT, last_seen TEXT, notes TEXT,
        label TEXT, category TEXT
      );
      CREATE TABLE IF NOT EXISTS scan_results (
        id TEXT PRIMARY KEY, scan_id TEXT, device_id TEXT, ip TEXT,
        online INTEGER, response_time REAL, open_ports TEXT, created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS device_history (
        id TEXT PRIMARY KEY, device_id TEXT, scan_id TEXT, event TEXT,
        detail TEXT, created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS vault_meta (
        id TEXT PRIMARY KEY, salt TEXT, kdf TEXT, kdf_n INTEGER, kdf_r INTEGER, kdf_p INTEGER,
        verifier TEXT, verifier_iv TEXT, verifier_tag TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY, device_id TEXT, label TEXT, protocol TEXT,
        host_override TEXT, port INTEGER, username TEXT, secret_type TEXT,
        secret_ciphertext TEXT, secret_iv TEXT, secret_tag TEXT,
        created_at TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS webhook_config (
        id TEXT PRIMARY KEY, url TEXT, enabled INTEGER, events TEXT,
        created_at TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_devices_network ON devices(network_id);
      CREATE INDEX IF NOT EXISTS idx_results_scan ON scan_results(scan_id);
      CREATE INDEX IF NOT EXISTS idx_history_device ON device_history(device_id);
      CREATE INDEX IF NOT EXISTS idx_credentials_device ON credentials(device_id);
    `);
  } catch {
    return null;
  }

  try {
    db.exec(`ALTER TABLE devices ADD COLUMN label TEXT`);
  } catch {
    // column already exists on databases created before this field was added
  }
  try {
    db.exec(`ALTER TABLE devices ADD COLUMN category TEXT`);
  } catch {
    // column already exists on databases created before this field was added
  }

  const decode = (table, row) => {
    if (!row) return row;
    const out = { ...row };
    if ("online" in out && out.online !== null) out.online = Boolean(out.online);
    if ("enabled" in out && out.enabled !== null) out.enabled = Boolean(out.enabled);
    if ("open_ports" in out) {
      try {
        out.open_ports = out.open_ports ? JSON.parse(out.open_ports) : [];
      } catch {
        out.open_ports = [];
      }
    }
    if ("events" in out) {
      try {
        out.events = out.events ? JSON.parse(out.events) : [];
      } catch {
        out.events = [];
      }
    }
    return out;
  };

  const encode = (row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "boolean") out[key] = value ? 1 : 0;
      else if (Array.isArray(value) || (value && typeof value === "object")) {
        out[key] = JSON.stringify(value);
      } else out[key] = value === undefined ? null : value;
    }
    return out;
  };

  return {
    kind: "sqlite",
    all: (table) =>
      db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .map((row) => decode(table, row)),
    insert: (table, row) => {
      const columns = TABLE_COLUMNS[table];
      const encoded = encode(row);
      db.prepare(
        `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${columns
          .map((c) => `$${c}`)
          .join(", ")})`,
      ).run(Object.fromEntries(columns.map((c) => [c, encoded[c] ?? null])));
      return row;
    },
    update: (table, id, patch) => {
      const encoded = encode(patch);
      const keys = Object.keys(encoded).filter((k) => k !== "id");
      if (!keys.length) return null;
      db.prepare(
        `UPDATE ${table} SET ${keys.map((k) => `${k} = $${k}`).join(", ")} WHERE id = $id`,
      ).run({ ...encoded, id });
      return decode(table, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    },
    remove: (table, predicate, ids) => {
      const targets = ids
        ? ids
        : db
            .prepare(`SELECT * FROM ${table}`)
            .all()
            .filter((row) => predicate(decode(table, row)))
            .map((row) => row.id);
      const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
      for (const id of targets) stmt.run(id);
    },
    close: () => db.close(),
  };
}

/* ------------------------------------------------------------------ */
/* Repository                                                          */
/* ------------------------------------------------------------------ */

function createDatabase(options = {}) {
  const file = options.file || path.join(process.cwd(), "data", "netscan.db");
  const backend =
    createSqliteBackend(file) || createJsonBackend(file.replace(/\.db$/, "") + ".json");

  const stripSecret = (row) => {
    if (!row) return row;
    const { secret_ciphertext, secret_iv, secret_tag, ...meta } = row;
    return meta;
  };

  const api = {
    backend: backend.kind,
    file,

    /* -------------------------- networks -------------------------- */
    listNetworks() {
      return backend
        .all("networks")
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    },
    getNetwork(id) {
      return backend.all("networks").find((n) => n.id === id) || null;
    },
    createNetwork({ name, cidr, source = "manual" }) {
      const row = {
        id: newId(),
        name: name || cidr,
        cidr,
        source,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      return backend.insert("networks", row);
    },
    updateNetwork(id, patch) {
      return backend.update("networks", id, {
        ...patch,
        updated_at: nowIso(),
      });
    },
    deleteNetwork(id) {
      const scanIds = backend
        .all("scan_runs")
        .filter((s) => s.network_id === id)
        .map((s) => s.id);
      const deviceIds = backend
        .all("devices")
        .filter((d) => d.network_id === id)
        .map((d) => d.id);
      backend.remove("device_history", (r) => deviceIds.includes(r.device_id));
      backend.remove("scan_results", (r) => scanIds.includes(r.scan_id));
      // NOTE: there is no standalone deleteDevice - devices are only ever
      // removed here, via their network's cascade. If a standalone
      // deleteDevice is ever added, it must cascade credentials too.
      backend.remove("credentials", (r) => deviceIds.includes(r.device_id));
      backend.remove("devices", (r) => r.network_id === id);
      backend.remove("scan_runs", (r) => r.network_id === id);
      backend.remove("networks", (r) => r.id === id);
      return { ok: true };
    },

    /* --------------------------- scans ---------------------------- */
    listScans(networkId) {
      return backend
        .all("scan_runs")
        .filter((s) => !networkId || s.network_id === networkId)
        .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    },
    getScan(id) {
      return backend.all("scan_runs").find((s) => s.id === id) || null;
    },
    startScan(networkId) {
      return backend.insert("scan_runs", {
        id: newId(),
        network_id: networkId,
        started_at: nowIso(),
        finished_at: null,
        status: "running",
        hosts_scanned: 0,
        devices_found: 0,
        new_devices: 0,
        missing_devices: 0,
      });
    },
    finishScan(id, patch) {
      return backend.update("scan_runs", id, {
        finished_at: nowIso(),
        status: "completed",
        ...patch,
      });
    },

    /* -------------------------- devices --------------------------- */
    listDevices(networkId) {
      return backend.all("devices").filter((d) => !networkId || d.network_id === networkId);
    },
    getDevice(id) {
      return backend.all("devices").find((d) => d.id === id) || null;
    },
    updateDevice(id, patch) {
      return backend.update("devices", id, patch);
    },

    /**
     * Apply a hostname discovered by background enrichment (after the scan
     * that found the device has already finished and moved on). No-ops if
     * the name hasn't actually changed; records a history entry otherwise,
     * same as a hostname change discovered mid-scan.
     */
    resolveDeviceHostname(id, scanId, hostname) {
      if (!hostname) return null;
      const record = backend.all("devices").find((d) => d.id === id);
      if (!record || record.hostname === hostname) return null;
      backend.insert("device_history", {
        id: newId(),
        device_id: id,
        scan_id: scanId || null,
        event: "hostname_changed",
        detail: `${record.hostname || "unknown"} -> ${hostname}`,
        created_at: nowIso(),
      });
      return backend.update("devices", id, { hostname });
    },
    listDeviceHistory(deviceId) {
      return backend
        .all("device_history")
        .filter((h) => !deviceId || h.device_id === deviceId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    },
    listScanResults(scanId) {
      return backend.all("scan_results").filter((r) => r.scan_id === scanId);
    },

    /**
     * Reconcile a completed sweep against stored state, writing devices,
     * per-scan results and history events. Returns a summary plus the raw
     * `notifications` list (history events enriched with ip/hostname) so a
     * caller - the webhook dispatcher in core/service.cjs - can act on what
     * just changed without re-querying the database.
     */
    recordScan({ networkId, scanId, hostsScanned, devices }) {
      const known = backend.all("devices").filter((d) => d.network_id === networkId);
      const byKey = new Map();
      for (const device of known) {
        byKey.set(device.mac || device.ip, device);
      }

      const seenIds = new Set();
      let newCount = 0;
      const timestamp = nowIso();
      const notifications = [];

      const addHistory = (deviceId, event, detail, context = {}) => {
        const row = {
          id: newId(),
          device_id: deviceId,
          scan_id: scanId,
          event,
          detail: typeof detail === "string" ? detail : JSON.stringify(detail),
          created_at: timestamp,
        };
        backend.insert("device_history", row);
        notifications.push({ ...row, ip: context.ip || null, hostname: context.hostname || null });
        return row;
      };

      for (const found of devices) {
        const key = found.mac || found.ip;
        let record = byKey.get(key) || byKey.get(found.ip);
        const ports = found.openPorts || [];
        const context = { ip: found.ip, hostname: found.hostname || (record && record.hostname) };

        if (!record) {
          record = {
            id: newId(),
            network_id: networkId,
            ip: found.ip,
            hostname: found.hostname || null,
            mac: found.mac || null,
            vendor: found.vendor || null,
            online: true,
            response_time: found.responseTime ?? null,
            open_ports: ports,
            first_seen: timestamp,
            last_seen: timestamp,
            notes: null,
            label: null,
            category: guessCategory({
              vendor: found.vendor,
              hostname: found.hostname,
              openPorts: ports,
            }),
          };
          backend.insert("devices", record);
          addHistory(record.id, "first_seen", `Discovered at ${found.ip}`, context);
          newCount++;
        } else {
          const previousPorts = record.open_ports || [];
          if (!record.online) {
            addHistory(record.id, "status_change", "Came back online", context);
          }
          if (record.ip !== found.ip) {
            addHistory(record.id, "ip_changed", `${record.ip} -> ${found.ip}`, context);
          }
          if (found.hostname && record.hostname !== found.hostname) {
            addHistory(
              record.id,
              "hostname_changed",
              `${record.hostname || "unknown"} -> ${found.hostname}`,
              context,
            );
          }
          if (found.vendor && record.vendor !== found.vendor) {
            addHistory(
              record.id,
              "vendor_changed",
              `${record.vendor || "unknown"} -> ${found.vendor}`,
              context,
            );
          }
          const opened = ports.filter((p) => !previousPorts.includes(p));
          const closed = previousPorts.filter((p) => !ports.includes(p));
          if (opened.length || closed.length) {
            addHistory(
              record.id,
              "ports_changed",
              [
                opened.length ? `opened: ${opened.join(", ")}` : null,
                closed.length ? `closed: ${closed.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" | "),
              context,
            );
          }

          const vendor = found.vendor || record.vendor;
          const hostname = found.hostname || record.hostname;
          backend.update("devices", record.id, {
            ip: found.ip,
            hostname,
            mac: found.mac || record.mac,
            vendor,
            online: true,
            response_time: found.responseTime ?? null,
            open_ports: ports,
            last_seen: timestamp,
            // Only fill in a still-empty category - never overwrite one the
            // user has set (or already guessed) on a previous scan.
            category: record.category || guessCategory({ vendor, hostname, openPorts: ports }),
          });
        }

        seenIds.add(record.id);
        backend.insert("scan_results", {
          id: newId(),
          scan_id: scanId,
          device_id: record.id,
          ip: found.ip,
          online: true,
          response_time: found.responseTime ?? null,
          open_ports: ports,
          created_at: timestamp,
        });
      }

      let missingCount = 0;
      for (const device of known) {
        if (seenIds.has(device.id)) continue;
        if (device.online) {
          addHistory(device.id, "status_change", "No longer responding", {
            ip: device.ip,
            hostname: device.hostname,
          });
          missingCount++;
        }
        backend.update("devices", device.id, { online: false });
        backend.insert("scan_results", {
          id: newId(),
          scan_id: scanId,
          device_id: device.id,
          ip: device.ip,
          online: false,
          response_time: null,
          open_ports: [],
          created_at: timestamp,
        });
      }

      const summary = {
        hosts_scanned: hostsScanned,
        devices_found: devices.length,
        new_devices: newCount,
        missing_devices: missingCount,
      };
      api.finishScan(scanId, summary);
      return { ...summary, notifications };
    },

    /* --------------------------- vault ------------------------------ */
    getVaultMeta() {
      return backend.all("vault_meta")[0] || null;
    },
    setVaultMeta(meta) {
      backend.remove("vault_meta", () => true);
      return backend.insert("vault_meta", { id: "singleton", ...meta });
    },
    wipeVault() {
      backend.remove("credentials", () => true);
      backend.remove("vault_meta", () => true);
      return { ok: true };
    },

    /* -------------------------- webhook ------------------------------ */
    getWebhookConfig() {
      return backend.all("webhook_config")[0] || null;
    },
    setWebhookConfig(config) {
      backend.remove("webhook_config", () => true);
      return backend.insert("webhook_config", { id: "singleton", ...config });
    },

    /* ------------------------ credentials ---------------------------- */
    listCredentials(deviceId) {
      return backend
        .all("credentials")
        .filter((c) => !deviceId || c.device_id === deviceId)
        .map(stripSecret);
    },
    getCredentialRaw(id) {
      return backend.all("credentials").find((c) => c.id === id) || null;
    },
    listCredentialsRaw() {
      return backend.all("credentials");
    },
    createCredential(row) {
      const record = { id: newId(), created_at: nowIso(), updated_at: nowIso(), ...row };
      backend.insert("credentials", record);
      return stripSecret(record);
    },
    updateCredential(id, patch) {
      return stripSecret(backend.update("credentials", id, { ...patch, updated_at: nowIso() }));
    },
    deleteCredential(id) {
      backend.remove("credentials", (r) => r.id === id);
      return { ok: true };
    },

    /* --------------------------- export --------------------------- */
    exportAll() {
      return {
        exportedAt: nowIso(),
        networks: backend.all("networks"),
        scans: backend.all("scan_runs"),
        devices: backend.all("devices"),
        results: backend.all("scan_results"),
        history: backend.all("device_history"),
      };
    },

    /** Everything for one network: its devices, its scans, and only the results/history rows that belong to those. */
    exportNetwork(networkId) {
      const network = api.getNetwork(networkId);
      if (!network) return null;
      const devices = backend.all("devices").filter((d) => d.network_id === networkId);
      const deviceIds = new Set(devices.map((d) => d.id));
      const scans = backend
        .all("scan_runs")
        .filter((s) => s.network_id === networkId)
        .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
      const scanIds = new Set(scans.map((s) => s.id));
      return {
        exportedAt: nowIso(),
        network,
        devices,
        scans,
        results: backend.all("scan_results").filter((r) => scanIds.has(r.scan_id)),
        history: backend.all("device_history").filter((h) => deviceIds.has(h.device_id)),
      };
    },

    /** One scan run: its own results plus just the devices and history entries those results touch. */
    exportScan(scanId) {
      const scan = api.getScan(scanId);
      if (!scan) return null;
      const results = backend.all("scan_results").filter((r) => r.scan_id === scanId);
      const deviceIds = new Set(results.map((r) => r.device_id));
      return {
        exportedAt: nowIso(),
        scan,
        network: api.getNetwork(scan.network_id),
        devices: backend.all("devices").filter((d) => deviceIds.has(d.id)),
        results,
        history: backend.all("device_history").filter((h) => h.scan_id === scanId),
      };
    },

    close() {
      backend.close();
    },
  };

  return api;
}

module.exports = { createDatabase, newId, nowIso };
