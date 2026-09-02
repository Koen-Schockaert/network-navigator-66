"use strict";

const path = require("node:path");
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs");
const { createService } = require("../core/service.cjs");

let mainWindow = null;
let service = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0b1017",
    autoHideMenuBar: true,
    title: "NetScan - Network Device Scanner",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServer = process.env["NETSCAN_DEV_SERVER"];
  if (devServer) {
    mainWindow.loadURL(devServer);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist-app", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/** Wrap a service call so renderer errors arrive as data, never as crashes. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

app.whenReady().then(() => {
  service = createService({
    dbFile: path.join(app.getPath("userData"), "netscan.db"),
  });

  service.onEvent((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("netscan:event", event);
    }
  });

  handle("info", () => service.getInfo());
  handle("detectNetworks", () => service.detectNetworks());
  handle("previewTargets", (target) => service.previewTargets(target));
  handle("getOuiStatus", () => service.getOuiStatus());
  handle("refreshOuiDatabase", () => service.refreshOuiDatabase());
  handle("getWebhookConfig", () => service.getWebhookConfig());
  handle("updateWebhookConfig", (patch) => service.updateWebhookConfig(patch));
  handle("testWebhook", () => service.testWebhook());
  handle("getScanProfilePorts", () => service.getScanProfilePorts());
  handle("updateScanProfilePorts", (profile, ports) =>
    service.updateScanProfilePorts(profile, ports),
  );
  handle("resetScanProfilePorts", (profile) => service.resetScanProfilePorts(profile));

  handle("listNetworks", () => service.listNetworks());
  handle("createNetwork", (input) => service.createNetwork(input));
  handle("updateNetwork", (id, patch) => service.updateNetwork(id, patch));
  handle("deleteNetwork", (id) => service.deleteNetwork(id));

  handle("listDevices", (networkId) => service.listDevices(networkId));
  handle("getDevice", (id) => service.getDevice(id));
  handle("updateDevice", (id, patch) => service.updateDevice(id, patch));
  handle("rescanDevicePorts", (id, options) => service.rescanDevicePorts(id, options));

  handle("listScans", (networkId) => service.listScans(networkId));
  handle("getScanDetail", (id) => service.getScanDetail(id));
  handle("getScanStatus", () => service.getScanStatus());
  handle("startScan", (networkId, options) => service.startScan(networkId, options));
  handle("stopScan", () => service.stopScan());
  handle("startPing", (ip, options) => service.startPing(ip, options));
  handle("stopPing", (sessionId) => service.stopPing(sessionId));

  handle("getDashboard", () => service.getDashboard());
  handle("listHistory", (deviceId) => service.listHistory(deviceId));

  handle("getVaultStatus", () => service.getVaultStatus());
  handle("setupVault", (password) => service.setupVault(password));
  handle("unlockVault", (password) => service.unlockVault(password));
  handle("lockVault", () => service.lockVault());
  handle("changeMasterPassword", (oldPassword, newPassword) =>
    service.changeMasterPassword(oldPassword, newPassword),
  );
  handle("resetVault", () => service.resetVault());
  handle("listCredentials", (deviceId) => service.listCredentials(deviceId));
  handle("getCredentialSecret", (id) => service.getCredentialSecret(id));
  handle("createCredential", (input) => service.createCredential(input));
  handle("updateCredential", (id, patch) => service.updateCredential(id, patch));
  handle("deleteCredential", (id) => service.deleteCredential(id));

  const saveJsonExport = async (title, defaultPath, payload) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) return { saved: false };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return { saved: true, filePath };
  };
  const dateStamp = () => new Date().toISOString().slice(0, 10);
  const slugify = (value) =>
    String(value || "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "network";

  handle("exportData", () =>
    saveJsonExport(
      "Export scan data",
      `netscan-export-${dateStamp()}.json`,
      service.exportAll(),
    ),
  );

  handle("exportNetwork", (networkId) => {
    const payload = service.exportNetwork(networkId);
    return saveJsonExport(
      "Export network data",
      `netscan-${slugify(payload.network.name)}-${dateStamp()}.json`,
      payload,
    );
  });

  handle("exportScan", (scanId) => {
    const payload = service.exportScan(scanId);
    return saveJsonExport(
      "Export scan data",
      `netscan-scan-${dateStamp()}.json`,
      payload,
    );
  });

  handle("importTargetsFile", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Import IP list",
      properties: ["openFile"],
      filters: [{ name: "Text / CSV", extensions: ["txt", "csv", "list"] }],
    });
    if (canceled || !filePaths.length) return { content: null };
    return { content: fs.readFileSync(filePaths[0], "utf8") };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (service) service.close();
  app.quit();
});
