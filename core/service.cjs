"use strict";

/**
 * Application service: the single brain shared by the Electron main process
 * and the Docker web server. Owns the database, the scan lifecycle and
 * progress broadcasting.
 */

const { createDatabase } = require("./db.cjs");
const {
  DEFAULT_PORTS,
  PORT_LABELS,
  countTargets,
  detectLocalNetworks,
  expandTargets,
  scanNetwork,
} = require("./scanner.cjs");

function createService(options = {}) {
  const db = createDatabase({ file: options.dbFile });
  const listeners = new Set();

  /** @type {{ scanId: string, networkId: string, signal: { aborted: boolean }, progress: object } | null} */
  let active = null;

  const broadcast = (event) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* a broken listener must not break a scan */
      }
    }
  };

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

    /* ----------------------- dashboard ---------------------- */
    getDashboard() {
      const devices = db.listDevices();
      const scans = db.listScans();
      const lastScan = scans[0] || null;
      const history = db.listDeviceHistory().slice(0, 25);
      const online = devices.filter((d) => d.online);
      const vendorCounts = {};
      for (const device of devices) {
        const key = device.vendor || "Unknown";
        vendorCounts[key] = (vendorCounts[key] || 0) + 1;
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
            ...scanOptions,
            signal,
            onProgress: (progress) => {
              if (active) active.progress = progress;
              broadcast({ type: "scan:progress", scanId: run.id, networkId, ...progress });
            },
          });
          const summary = db.recordScan({
            networkId,
            scanId: run.id,
            hostsScanned: result.hostsScanned,
            devices: result.devices,
          });
          broadcast({ type: "scan:finished", scanId: run.id, networkId, summary });
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

    close() {
      db.close();
    },
  };

  return service;
}

module.exports = { createService };
