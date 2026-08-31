"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/** Unwrap the { ok, data, error } envelope from the main process. */
async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result && result.ok === false) throw new Error(result.error);
  return result ? result.data : null;
}

contextBridge.exposeInMainWorld("netscan", {
  isDesktop: true,

  getInfo: () => call("info"),
  detectNetworks: () => call("detectNetworks"),
  previewTargets: (target) => call("previewTargets", target),

  listNetworks: () => call("listNetworks"),
  createNetwork: (input) => call("createNetwork", input),
  updateNetwork: (id, patch) => call("updateNetwork", id, patch),
  deleteNetwork: (id) => call("deleteNetwork", id),

  listDevices: (networkId) => call("listDevices", networkId),
  getDevice: (id) => call("getDevice", id),
  updateDevice: (id, patch) => call("updateDevice", id, patch),

  listScans: (networkId) => call("listScans", networkId),
  getScanDetail: (id) => call("getScanDetail", id),
  getScanStatus: () => call("getScanStatus"),
  startScan: (networkId, options) => call("startScan", networkId, options),
  stopScan: () => call("stopScan"),
  startPing: (ip, options) => call("startPing", ip, options),
  stopPing: (sessionId) => call("stopPing", sessionId),

  getDashboard: () => call("getDashboard"),
  listHistory: (deviceId) => call("listHistory", deviceId),
  exportData: () => call("exportData"),
  importTargetsFile: () => call("importTargetsFile"),

  getVaultStatus: () => call("getVaultStatus"),
  setupVault: (password) => call("setupVault", password),
  unlockVault: (password) => call("unlockVault", password),
  lockVault: () => call("lockVault"),
  changeMasterPassword: (oldPassword, newPassword) =>
    call("changeMasterPassword", oldPassword, newPassword),
  resetVault: () => call("resetVault"),
  listCredentials: (deviceId) => call("listCredentials", deviceId),
  getCredentialSecret: (id) => call("getCredentialSecret", id),
  createCredential: (input) => call("createCredential", input),
  updateCredential: (id, patch) => call("updateCredential", id, patch),
  deleteCredential: (id) => call("deleteCredential", id),

  onEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("netscan:event", listener);
    return () => ipcRenderer.removeListener("netscan:event", listener);
  },
});
