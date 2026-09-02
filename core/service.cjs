"use strict";

/**
 * Application service: the single brain shared by the Electron main process
 * and the Docker web server. Owns the database, the scan lifecycle and
 * progress broadcasting.
 */

const crypto = require("node:crypto");
const path = require("node:path");
const { createDatabase } = require("./db.cjs");
const oui = require("./oui.cjs");
const vault = require("./vault.cjs");
const {
  DEEP_PORTS,
  DEFAULT_PORTS,
  DEFAULT_SCAN_PROFILE,
  PORT_LABELS,
  SCAN_PROFILES,
  countTargets,
  detectLocalNetworks,
  expandTargets,
  isIpv4,
  pingHost,
  resolveScanProfile,
  scanNetwork,
} = require("./scanner.cjs");

// The ports each profile probes out of the box, before any user override -
// "quick" is ping-only by design (see SCAN_PROFILES), so it starts empty.
const DEFAULT_SCAN_PROFILE_PORTS = { quick: [], standard: DEFAULT_PORTS, deep: DEEP_PORTS };

function normalizeScanProfileConfig(row) {
  const overrides = {
    quick: row && Array.isArray(row.quick_ports) ? row.quick_ports : null,
    standard: row && Array.isArray(row.standard_ports) ? row.standard_ports : null,
    deep: row && Array.isArray(row.deep_ports) ? row.deep_ports : null,
  };
  return {
    quick: overrides.quick ?? DEFAULT_SCAN_PROFILE_PORTS.quick,
    standard: overrides.standard ?? DEFAULT_SCAN_PROFILE_PORTS.standard,
    deep: overrides.deep ?? DEFAULT_SCAN_PROFILE_PORTS.deep,
    customized: {
      quick: overrides.quick !== null,
      standard: overrides.standard !== null,
      deep: overrides.deep !== null,
    },
    updatedAt: (row && row.updated_at) || null,
  };
}

function sanitizePortList(ports) {
  if (!Array.isArray(ports)) throw new Error("ports must be a list of numbers");
  const clean = Array.from(new Set(ports.map(Number))).filter(
    (p) => Number.isInteger(p) && p > 0 && p < 65536,
  );
  clean.sort((a, b) => a - b);
  return clean;
}

// The full set of core/db.cjs recordScan() event kinds a webhook can
// subscribe to - kept here (not in db.cjs) since it's a webhook-feature
// concern, not a storage concern.
const WEBHOOK_EVENTS = [
  "first_seen",
  "status_change",
  "ip_changed",
  "hostname_changed",
  "vendor_changed",
  "ports_changed",
];
const DEFAULT_WEBHOOK_EVENTS = ["first_seen", "status_change", "ports_changed"];

function normalizeWebhookConfig(row) {
  return {
    url: (row && row.url) || "",
    enabled: Boolean(row && row.enabled),
    events:
      row && Array.isArray(row.events) && row.events.length ? row.events : DEFAULT_WEBHOOK_EVENTS,
    updatedAt: (row && row.updated_at) || null,
  };
}

async function postWebhook(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Webhook endpoint responded with HTTP ${response.status}`);
}

function createService(options = {}) {
  const db = createDatabase({ file: options.dbFile });
  const ouiCacheFile = path.join(path.dirname(db.file), "oui-cache.json");
  oui.loadOuiCache(ouiCacheFile);
  const listeners = new Set();

  /** @type {{ scanId: string, networkId: string, signal: { aborted: boolean }, progress: object } | null} */
  let active = null;

  /** @type {Map<string, { ip: string, sequence: number, aborted: boolean, timer: NodeJS.Timeout | null }>} */
  const pingSessions = new Map();

  /** Derived vault key. Buffer while unlocked, null while locked. Never persisted. */
  let vaultKey = null;

  const buildSecretFromInput = (input) => {
    if (input.secret_type === "ssh_key") {
      return {
        kind: "ssh_key",
        privateKey: input.privateKey || "",
        passphrase: input.passphrase || "",
        publicKey: input.publicKey || null,
      };
    }
    return { kind: "password", password: input.password || "" };
  };

  const broadcast = (event) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* a broken listener must not break a scan */
      }
    }
  };

  /**
   * One batched POST per scan - never one per event - so a first scan that
   * finds thirty devices doesn't fire thirty webhook calls and trip a
   * receiver's rate limit. A no-op when nothing is configured, disabled, or
   * nothing this scan matches the subscribed event types. Delivery failures
   * are logged and broadcast, never thrown: a webhook receiver being down
   * must never affect scanning itself.
   */
  async function dispatchWebhook({ networkId, scanId, summary, notifications }) {
    const config = normalizeWebhookConfig(db.getWebhookConfig());
    if (!config.enabled || !config.url) return;
    const matched = notifications.filter((n) => config.events.includes(n.event));
    if (!matched.length) return;

    const payload = {
      type: "netscan.scan_summary",
      networkId,
      scanId,
      timestamp: new Date().toISOString(),
      summary,
      events: matched.map((n) => ({
        event: n.event,
        detail: n.detail,
        device: { id: n.device_id, ip: n.ip, hostname: n.hostname },
      })),
    };

    try {
      await postWebhook(config.url, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[netscan] webhook delivery failed: ${message}`);
      broadcast({ type: "webhook:failed", message });
    }
  }

  const service = {
    db,

    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /* ------------------------- meta ------------------------- */
    getInfo() {
      return {
        backend: db.backend,
        dbFile: db.file,
        platform: process.platform,
        defaultPorts: DEFAULT_PORTS,
        portLabels: PORT_LABELS,
        scanProfiles: Object.keys(SCAN_PROFILES),
        defaultScanProfile: DEFAULT_SCAN_PROFILE,
        webhookEvents: WEBHOOK_EVENTS,
        interfaces: detectLocalNetworks(),
      };
    },
    detectNetworks() {
      return detectLocalNetworks();
    },
    previewTargets(target) {
      const hosts = expandTargets(target);
      return {
        valid: hosts.length > 0,
        count: hosts.length,
        first: hosts.slice(0, 3),
        last: hosts.slice(-1),
      };
    },
    countTargets,

    /* ---------------------- vendor lookup -------------------- */
    getOuiStatus() {
      return oui.getOuiStatus();
    },
    async refreshOuiDatabase() {
      const status = await oui.refreshOuiDatabase(ouiCacheFile);
      broadcast({ type: "oui:refreshed", ...status });
      return status;
    },

    /* -------------------------- webhook ----------------------- */
    getWebhookConfig() {
      return normalizeWebhookConfig(db.getWebhookConfig());
    },

    updateWebhookConfig(patch) {
      const raw = db.getWebhookConfig();
      const current = normalizeWebhookConfig(raw);
      const next = { ...current, ...patch };
      if (next.url) {
        try {
          new URL(next.url);
        } catch {
          throw new Error("That doesn't look like a valid URL");
        }
      }
      if (!Array.isArray(next.events) || !next.events.length) {
        throw new Error("Select at least one event type");
      }
      const timestamp = new Date().toISOString();
      db.setWebhookConfig({
        url: next.url,
        enabled: Boolean(next.enabled),
        events: next.events,
        created_at: (raw && raw.created_at) || timestamp,
        updated_at: timestamp,
      });
      const updated = service.getWebhookConfig();
      broadcast({ type: "webhook:updated", config: updated });
      return updated;
    },

    async testWebhook() {
      const config = normalizeWebhookConfig(db.getWebhookConfig());
      if (!config.url) throw new Error("Set a webhook URL first");
      await postWebhook(config.url, {
        type: "netscan.test",
        timestamp: new Date().toISOString(),
        message: "This is a test notification from NetScan.",
      });
      return { ok: true };
    },

    /* -------------------- scan profile port config -------------------- */
    getScanProfilePorts() {
      return normalizeScanProfileConfig(db.getScanProfileConfig());
    },

    updateScanProfilePorts(profile, ports) {
      if (!SCAN_PROFILES[profile]) throw new Error(`Unknown scan profile "${profile}"`);
      const clean = sanitizePortList(ports);
      const raw = db.getScanProfileConfig();
      db.setScanProfileConfig({
        quick_ports: raw ? raw.quick_ports : null,
        standard_ports: raw ? raw.standard_ports : null,
        deep_ports: raw ? raw.deep_ports : null,
        [`${profile}_ports`]: clean,
        updated_at: new Date().toISOString(),
      });
      const updated = service.getScanProfilePorts();
      broadcast({ type: "scan-profile:updated", config: updated });
      return updated;
    },

    resetScanProfilePorts(profile) {
      if (!SCAN_PROFILES[profile]) throw new Error(`Unknown scan profile "${profile}"`);
      const raw = db.getScanProfileConfig();
      db.setScanProfileConfig({
        quick_ports: raw ? raw.quick_ports : null,
        standard_ports: raw ? raw.standard_ports : null,
        deep_ports: raw ? raw.deep_ports : null,
        [`${profile}_ports`]: null,
        updated_at: new Date().toISOString(),
      });
      const updated = service.getScanProfilePorts();
      broadcast({ type: "scan-profile:updated", config: updated });
      return updated;
    },

    /* ----------------------- networks ----------------------- */
    listNetworks() {
      const networks = db.listNetworks();
      const devices = db.listDevices();
      const scans = db.listScans();
      return networks.map((network) => {
        const own = devices.filter((d) => d.network_id === network.id);
        const lastScan = scans.find((s) => s.network_id === network.id) || null;
        return {
          ...network,
          deviceCount: own.length,
          onlineCount: own.filter((d) => d.online).length,
          lastScanAt: lastScan ? lastScan.started_at : null,
        };
      });
    },
    createNetwork(input) {
      if (!input || !input.cidr) throw new Error("A subnet or IP range is required");
      if (!expandTargets(input.cidr).length) {
        throw new Error(`"${input.cidr}" is not a valid subnet, range or IP list`);
      }
      return db.createNetwork(input);
    },
    updateNetwork(id, patch) {
      return db.updateNetwork(id, patch);
    },
    deleteNetwork(id) {
      return db.deleteNetwork(id);
    },

    /* ------------------------ devices ----------------------- */
    listDevices(networkId) {
      return db.listDevices(networkId);
    },
    getDevice(id) {
      const device = db.getDevice(id);
      if (!device) return null;
      return { ...device, history: db.listDeviceHistory(id) };
    },
    updateDevice(id, patch) {
      return db.updateDevice(id, patch);
    },
    updateDevices(ids, patch) {
      return db.updateDevices(ids, patch);
    },
    deleteDevices(ids) {
      const result = db.deleteDevices(ids);
      broadcast({ type: "device:deleted", ids });
      return result;
    },

    /**
     * Probe a single device's ports on demand (the device detail panel's
     * "rescan ports" button) instead of waiting for the next full network
     * scan. Reuses the same profile/port-override resolution as startScan(),
     * but never touches scan_runs or any other device - see db.rescanDevice().
     */
    async rescanDevicePorts(deviceId, scanOptions = {}) {
      const device = db.getDevice(deviceId);
      if (!device) throw new Error("Device not found");

      const { profile, ...explicitOptions } = scanOptions;
      const profileConfig = db.getScanProfileConfig();
      const portOverrides = profileConfig && {
        quick: profileConfig.quick_ports,
        standard: profileConfig.standard_ports,
        deep: profileConfig.deep_ports,
      };
      const resolvedOptions = { ...resolveScanProfile(profile, portOverrides), ...explicitOptions };

      const result = await scanNetwork(device.ip, { ...resolvedOptions, resolveHostnames: true });
      const found = result.devices[0] || null;
      const { device: updated, notifications } = db.rescanDevice({ deviceId, found });
      if (updated) {
        broadcast({ type: "device:updated", networkId: device.network_id, device: updated });
      }
      dispatchWebhook({
        networkId: device.network_id,
        scanId: null,
        summary: {
          hosts_scanned: 1,
          devices_found: found ? 1 : 0,
          new_devices: 0,
          missing_devices: found ? 0 : 1,
        },
        notifications,
      });
      return { device: updated };
    },

    listScans(networkId) {
      return db.listScans(networkId);
    },
    getScanDetail(scanId) {
      const scan = db.getScan(scanId);
      if (!scan) return null;
      return { ...scan, results: db.listScanResults(scanId) };
    },
    listHistory(deviceId) {
      return db.listDeviceHistory(deviceId);
    },
    exportAll() {
      return db.exportAll();
    },
    exportNetwork(networkId) {
      const data = db.exportNetwork(networkId);
      if (!data) throw new Error("Network not found");
      return data;
    },
    exportScan(scanId) {
      const data = db.exportScan(scanId);
      if (!data) throw new Error("Scan not found");
      return data;
    },

    /* ----------------------- dashboard ---------------------- */
    getDashboard() {
      const devices = db.listDevices();
      const scans = db.listScans();
      const lastScan = scans[0] || null;
      const history = db.listDeviceHistory().slice(0, 25);
      const online = devices.filter((d) => d.online);
      const vendorCounts = {};
      const categoryCounts = {};
      for (const device of devices) {
        const key = device.vendor || "Unknown";
        vendorCounts[key] = (vendorCounts[key] || 0) + 1;
        const category = device.category || "uncategorized";
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
      return {
        totalDevices: devices.length,
        onlineDevices: online.length,
        offlineDevices: devices.length - online.length,
        newDevices: lastScan ? lastScan.new_devices || 0 : 0,
        missingDevices: lastScan ? lastScan.missing_devices || 0 : 0,
        networks: db.listNetworks().length,
        lastScanAt: lastScan ? lastScan.started_at : null,
        vendors: Object.entries(vendorCounts)
          .map(([vendor, count]) => ({ vendor, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        categories: Object.entries(categoryCounts)
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count),
        recentScans: scans.slice(0, 10),
        recentHistory: history,
      };
    },

    /* ------------------------- scans ------------------------ */
    getScanStatus() {
      return active
        ? { running: true, ...active.progress, scanId: active.scanId, networkId: active.networkId }
        : { running: false };
    },

    async startScan(networkId, scanOptions = {}) {
      if (active) throw new Error("A scan is already running");
      const network = db.getNetwork(networkId);
      if (!network) throw new Error("Network not found");

      // A named profile (quick/standard/deep) fills in sane defaults - using
      // the user's configured port list for that profile, if any - and any
      // option the caller sets explicitly alongside it still wins.
      const { profile, ...explicitOptions } = scanOptions;
      const profileConfig = db.getScanProfileConfig();
      const portOverrides = profileConfig && {
        quick: profileConfig.quick_ports,
        standard: profileConfig.standard_ports,
        deep: profileConfig.deep_ports,
      };
      const resolvedOptions = { ...resolveScanProfile(profile, portOverrides), ...explicitOptions };

      const run = db.startScan(networkId);
      const signal = { aborted: false };
      active = {
        scanId: run.id,
        networkId,
        signal,
        progress: { total: 0, completed: 0, found: 0, percent: 0, currentIp: null },
      };
      broadcast({ type: "scan:started", scanId: run.id, networkId });

      (async () => {
        try {
          const result = await scanNetwork(network.cidr, {
            ...resolvedOptions,
            signal,
            onProgress: (progress) => {
              if (active) active.progress = progress;
              broadcast({ type: "scan:progress", scanId: run.id, networkId, ...progress });
            },
            onHostnameResolved: (ip, hostname) => {
              const match = db.listDevices(networkId).find((d) => d.ip === ip);
              if (!match) return;
              const updated = db.resolveDeviceHostname(match.id, run.id, hostname);
              if (updated)
                broadcast({ type: "device:updated", scanId: run.id, networkId, device: updated });
            },
          });
          const { notifications, ...summary } = db.recordScan({
            networkId,
            scanId: run.id,
            hostsScanned: result.hostsScanned,
            devices: result.devices,
          });
          broadcast({ type: "scan:finished", scanId: run.id, networkId, summary });
          dispatchWebhook({ networkId, scanId: run.id, summary, notifications });
        } catch (error) {
          db.finishScan(run.id, { status: "failed" });
          broadcast({
            type: "scan:failed",
            scanId: run.id,
            networkId,
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          active = null;
        }
      })();

      return { scanId: run.id, networkId };
    },

    stopScan() {
      if (!active) return { running: false };
      active.signal.aborted = true;
      broadcast({ type: "scan:stopping", scanId: active.scanId });
      return { running: true, stopping: true, scanId: active.scanId };
    },

    /* -------------------------- ping ------------------------------- */
    startPing(ip, pingOptions = {}) {
      if (!ip || !isIpv4(ip)) throw new Error("A valid IPv4 address is required");
      const intervalMs = Math.min(Math.max(Number(pingOptions.intervalMs) || 1000, 250), 60000);
      const timeoutMs = Math.min(Math.max(Number(pingOptions.timeoutMs) || 1000, 200), 5000);
      const sessionId = crypto.randomUUID();
      const session = { ip, sequence: 0, aborted: false, timer: null };
      pingSessions.set(sessionId, session);
      broadcast({ type: "ping:started", sessionId, ip });

      const tick = async () => {
        if (session.aborted) return;
        const startedAt = Date.now();
        const rttMs = await pingHost(ip, timeoutMs);
        if (session.aborted) return;
        session.sequence += 1;
        broadcast({
          type: "ping:result",
          sessionId,
          ip,
          sequence: session.sequence,
          rttMs,
          timestamp: new Date().toISOString(),
        });
        if (session.aborted) return;
        const elapsed = Date.now() - startedAt;
        session.timer = setTimeout(tick, Math.max(0, intervalMs - elapsed));
      };
      tick();

      return { sessionId, ip };
    },

    stopPing(sessionId) {
      const session = pingSessions.get(sessionId);
      if (!session) return { stopped: false };
      session.aborted = true;
      if (session.timer) clearTimeout(session.timer);
      pingSessions.delete(sessionId);
      broadcast({ type: "ping:stopped", sessionId, ip: session.ip });
      return { stopped: true };
    },

    /* -------------------------- vault ------------------------------ */
    getVaultStatus() {
      return { configured: Boolean(db.getVaultMeta()), unlocked: vaultKey !== null };
    },

    setupVault(password) {
      if (!password || password.length < 8) {
        throw new Error("Master password must be at least 8 characters");
      }
      if (db.getVaultMeta()) {
        throw new Error("Vault already configured - use changeMasterPassword instead");
      }
      const salt = vault.generateSalt();
      const key = vault.deriveKey(password, salt);
      const verifier = vault.createVerifier(key);
      const timestamp = new Date().toISOString();
      db.setVaultMeta({
        salt,
        kdf: "scrypt",
        kdf_n: vault.SCRYPT_PARAMS.N,
        kdf_r: vault.SCRYPT_PARAMS.r,
        kdf_p: vault.SCRYPT_PARAMS.p,
        verifier: verifier.verifier,
        verifier_iv: verifier.verifierIv,
        verifier_tag: verifier.verifierTag,
        created_at: timestamp,
        updated_at: timestamp,
      });
      vaultKey = key;
      broadcast({ type: "vault:unlocked" });
      return service.getVaultStatus();
    },

    unlockVault(password) {
      const meta = db.getVaultMeta();
      if (!meta) throw new Error("Vault has not been set up yet");
      const key = vault.deriveKey(password, meta.salt, {
        N: meta.kdf_n,
        r: meta.kdf_r,
        p: meta.kdf_p,
      });
      const ok = vault.checkVerifier(key, {
        verifier: meta.verifier,
        verifierIv: meta.verifier_iv,
        verifierTag: meta.verifier_tag,
      });
      if (!ok) throw new Error("Incorrect master password");
      vaultKey = key;
      broadcast({ type: "vault:unlocked" });
      return service.getVaultStatus();
    },

    lockVault() {
      vaultKey = null;
      broadcast({ type: "vault:locked" });
      return service.getVaultStatus();
    },

    changeMasterPassword(oldPassword, newPassword) {
      const meta = db.getVaultMeta();
      if (!meta) throw new Error("Vault has not been set up yet");
      if (!newPassword || newPassword.length < 8) {
        throw new Error("Master password must be at least 8 characters");
      }
      const oldKey = vault.deriveKey(oldPassword, meta.salt, {
        N: meta.kdf_n,
        r: meta.kdf_r,
        p: meta.kdf_p,
      });
      const ok = vault.checkVerifier(oldKey, {
        verifier: meta.verifier,
        verifierIv: meta.verifier_iv,
        verifierTag: meta.verifier_tag,
      });
      if (!ok) throw new Error("Incorrect current master password");

      const newSalt = vault.generateSalt();
      const newKey = vault.deriveKey(newPassword, newSalt);
      for (const row of db.listCredentialsRaw()) {
        const secret = vault.decryptSecret(oldKey, {
          ciphertext: row.secret_ciphertext,
          iv: row.secret_iv,
          authTag: row.secret_tag,
        });
        const encoded = vault.encryptSecret(newKey, secret);
        db.updateCredential(row.id, {
          secret_ciphertext: encoded.ciphertext,
          secret_iv: encoded.iv,
          secret_tag: encoded.authTag,
        });
      }
      const verifier = vault.createVerifier(newKey);
      db.setVaultMeta({
        salt: newSalt,
        kdf: "scrypt",
        kdf_n: vault.SCRYPT_PARAMS.N,
        kdf_r: vault.SCRYPT_PARAMS.r,
        kdf_p: vault.SCRYPT_PARAMS.p,
        verifier: verifier.verifier,
        verifier_iv: verifier.verifierIv,
        verifier_tag: verifier.verifierTag,
        created_at: meta.created_at,
        updated_at: new Date().toISOString(),
      });
      vaultKey = newKey;
      broadcast({ type: "vault:password_changed" });
      return service.getVaultStatus();
    },

    resetVault() {
      db.wipeVault();
      vaultKey = null;
      broadcast({ type: "vault:reset" });
      return service.getVaultStatus();
    },

    /* ----------------------- credentials ----------------------------- */
    listCredentials(deviceId) {
      return db.listCredentials(deviceId);
    },

    getCredentialSecret(id) {
      if (!vaultKey) throw new Error("Vault is locked");
      const row = db.getCredentialRaw(id);
      if (!row) throw new Error("Credential not found");
      return vault.decryptSecret(vaultKey, {
        ciphertext: row.secret_ciphertext,
        iv: row.secret_iv,
        authTag: row.secret_tag,
      });
    },

    createCredential(input) {
      if (!vaultKey) throw new Error("Vault is locked");
      if (!input || !input.device_id) throw new Error("device_id is required");
      if (!db.getDevice(input.device_id)) throw new Error("Device not found");
      if (!input.label || !input.label.trim()) throw new Error("Label is required");
      const secret = buildSecretFromInput(input);
      const encoded = vault.encryptSecret(vaultKey, secret);
      const created = db.createCredential({
        device_id: input.device_id,
        label: input.label.trim(),
        protocol: input.protocol || "other",
        host_override: input.host_override || null,
        port: input.port ?? null,
        username: input.username || null,
        secret_type: secret.kind,
        secret_ciphertext: encoded.ciphertext,
        secret_iv: encoded.iv,
        secret_tag: encoded.authTag,
      });
      broadcast({ type: "credential:created", credential: created });
      return created;
    },

    updateCredential(id, patch) {
      if (!vaultKey) throw new Error("Vault is locked");
      const existing = db.getCredentialRaw(id);
      if (!existing) throw new Error("Credential not found");

      const metaPatch = {};
      for (const key of ["label", "protocol", "host_override", "port", "username"]) {
        if (key in patch) metaPatch[key] = patch[key];
      }

      const touchesSecret =
        "secret_type" in patch ||
        "password" in patch ||
        "privateKey" in patch ||
        "passphrase" in patch ||
        "publicKey" in patch;

      if (touchesSecret) {
        const currentSecret = vault.decryptSecret(vaultKey, {
          ciphertext: existing.secret_ciphertext,
          iv: existing.secret_iv,
          authTag: existing.secret_tag,
        });
        const replacingKind = "secret_type" in patch && patch.secret_type !== existing.secret_type;
        const nextSecret = replacingKind
          ? buildSecretFromInput(patch)
          : buildSecretFromInput({ ...currentSecret, secret_type: existing.secret_type, ...patch });
        const encoded = vault.encryptSecret(vaultKey, nextSecret);
        metaPatch.secret_type = nextSecret.kind;
        metaPatch.secret_ciphertext = encoded.ciphertext;
        metaPatch.secret_iv = encoded.iv;
        metaPatch.secret_tag = encoded.authTag;
      }

      const updated = db.updateCredential(id, metaPatch);
      broadcast({ type: "credential:updated", credential: updated });
      return updated;
    },

    deleteCredential(id) {
      const result = db.deleteCredential(id);
      broadcast({ type: "credential:deleted", id });
      return result;
    },

    close() {
      for (const session of pingSessions.values()) {
        session.aborted = true;
        if (session.timer) clearTimeout(session.timer);
      }
      pingSessions.clear();
      db.close();
    },
  };

  return service;
}

module.exports = { createService };
