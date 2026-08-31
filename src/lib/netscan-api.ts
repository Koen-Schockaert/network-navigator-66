import { demoBackend, demoInfo } from "./netscan-demo";
import type {
  CredentialInput,
  CredentialPatch,
  CredentialRow,
  CredentialSecret,
  Dashboard,
  DeviceRow,
  HistoryRow,
  Info,
  NetscanEvent,
  NetworkRow,
  PingOptions,
  ScanProgress,
  ScanRow,
  TransportMode,
  VaultStatus,
} from "./netscan-types";

/**
 * One API surface, three transports:
 *  - "desktop": Electron IPC bridge exposed on window.netscan
 *  - "server":  the Docker container's JSON API + SSE stream
 *  - "demo":    simulated data so the web preview stays fully explorable
 */

type DesktopBridge = {
  isDesktop: true;
  getInfo(): Promise<Info>;
  detectNetworks(): Promise<Info["interfaces"]>;
  previewTargets(target: string): Promise<TargetPreview>;
  listNetworks(): Promise<NetworkRow[]>;
  createNetwork(input: NetworkInput): Promise<NetworkRow>;
  updateNetwork(id: string, patch: Partial<NetworkRow>): Promise<NetworkRow>;
  deleteNetwork(id: string): Promise<{ ok: boolean }>;
  listDevices(networkId?: string): Promise<DeviceRow[]>;
  getDevice(id: string): Promise<DeviceDetail | null>;
  updateDevice(id: string, patch: Partial<DeviceRow>): Promise<DeviceRow>;
  listScans(networkId?: string): Promise<ScanRow[]>;
  getScanStatus(): Promise<ScanProgress>;
  startScan(networkId: string, options?: ScanOptions): Promise<{ scanId: string }>;
  stopScan(): Promise<unknown>;
  startPing(ip: string, options?: PingOptions): Promise<{ sessionId: string; ip: string }>;
  stopPing(sessionId: string): Promise<{ stopped: boolean }>;
  getDashboard(): Promise<Dashboard>;
  listHistory(deviceId?: string): Promise<HistoryRow[]>;
  exportData(): Promise<{ saved: boolean; filePath?: string }>;
  importTargetsFile(): Promise<{ content: string | null }>;
  getVaultStatus(): Promise<VaultStatus>;
  setupVault(password: string): Promise<VaultStatus>;
  unlockVault(password: string): Promise<VaultStatus>;
  lockVault(): Promise<VaultStatus>;
  changeMasterPassword(oldPassword: string, newPassword: string): Promise<VaultStatus>;
  resetVault(): Promise<VaultStatus>;
  listCredentials(deviceId?: string): Promise<CredentialRow[]>;
  getCredentialSecret(id: string): Promise<CredentialSecret>;
  createCredential(input: CredentialInput): Promise<CredentialRow>;
  updateCredential(id: string, patch: CredentialPatch): Promise<CredentialRow>;
  deleteCredential(id: string): Promise<{ ok: boolean }>;
  onEvent(handler: (event: NetscanEvent) => void): () => void;
};

export type NetworkInput = { name?: string | undefined; cidr: string; source?: string | undefined };
export type TargetPreview = {
  valid: boolean;
  count: number;
  first: string[];
  last: string[];
};
export type ScanOptions = {
  scanPorts?: boolean;
  resolveHostnames?: boolean;
  timeout?: number;
  concurrency?: number;
};
export type DeviceDetail = DeviceRow & { history: HistoryRow[] };

function bridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { netscan?: DesktopBridge }).netscan;
  return candidate && candidate.isDesktop ? candidate : null;
}

let serverAvailable: boolean | null = null;

/** Detect whether the headless server API is reachable at this origin. */
async function hasServer(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (serverAvailable !== null) return serverAvailable;
  try {
    // Relative (no leading slash) so this still resolves correctly when the
    // page is served under a path prefix, e.g. Home Assistant Ingress.
    const response = await fetch("api/info", { signal: AbortSignal.timeout(1500) });
    const contentType = response.headers.get("content-type") || "";
    // A dev/SPA fallback answers with HTML — only real JSON means the engine is there.
    serverAvailable = response.ok && contentType.includes("application/json");
    if (serverAvailable) {
      const payload = (await response
        .clone()
        .json()
        .catch(() => null)) as Info | null;
      serverAvailable = Boolean(payload && typeof payload.backend === "string");
    }
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

export async function getTransport(): Promise<TransportMode> {
  if (bridge()) return "desktop";
  return (await hasServer()) ? "server" : "demo";
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`api${path}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function send<T>(path: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(`api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || "Request failed");
  }
  return payload as T;
}

/* ------------------------------------------------------------------ */
/* Demo scan bookkeeping                                               */
/* ------------------------------------------------------------------ */

const demoListeners = new Set<(event: NetscanEvent) => void>();
let demoProgress: ScanProgress = { running: false };
let demoCancel: (() => void) | null = null;
const demoPingTimers = new Map<string, ReturnType<typeof setInterval>>();

function emitDemo(event: NetscanEvent) {
  for (const listener of demoListeners) listener(event);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const netscan = {
  async getInfo(): Promise<Info> {
    const desktop = bridge();
    if (desktop) return desktop.getInfo();
    if (await hasServer()) return get<Info>("/info");
    return demoInfo;
  },

  async detectNetworks(): Promise<Info["interfaces"]> {
    const desktop = bridge();
    if (desktop) return desktop.detectNetworks();
    if (await hasServer()) return get<Info["interfaces"]>("/detect");
    return demoInfo.interfaces;
  },

  async previewTargets(target: string): Promise<TargetPreview> {
    const desktop = bridge();
    if (desktop) return desktop.previewTargets(target);
    if (await hasServer()) {
      return get<TargetPreview>(`/preview?target=${encodeURIComponent(target)}`);
    }
    const match = /\/(\d{1,2})$/.exec(target.trim());
    const bits = match ? Number(match[1]) : null;
    const count = bits !== null && bits >= 16 && bits <= 32 ? 2 ** (32 - bits) - 2 : 0;
    return { valid: count > 0, count: Math.max(count, 0), first: [], last: [] };
  },

  async listNetworks(): Promise<NetworkRow[]> {
    const desktop = bridge();
    if (desktop) return desktop.listNetworks();
    if (await hasServer()) return get<NetworkRow[]>("/networks");
    return demoBackend.listNetworks();
  },

  async createNetwork(input: NetworkInput): Promise<NetworkRow> {
    const desktop = bridge();
    if (desktop) return desktop.createNetwork(input);
    if (await hasServer()) return send<NetworkRow>("/networks", "POST", input);
    return demoBackend.createNetwork({
      cidr: input.cidr,
      ...(input.name ? { name: input.name } : {}),
      ...(input.source ? { source: input.source } : {}),
    });
  },

  async updateNetwork(id: string, patch: Partial<NetworkRow>) {
    const desktop = bridge();
    if (desktop) return desktop.updateNetwork(id, patch);
    if (await hasServer()) return send("/networks", "PATCH", { id, patch });
    return demoBackend.updateNetwork(id, patch);
  },

  async deleteNetwork(id: string) {
    const desktop = bridge();
    if (desktop) return desktop.deleteNetwork(id);
    if (await hasServer()) return send("/networks", "DELETE", { id });
    return demoBackend.deleteNetwork(id);
  },

  async listDevices(networkId?: string): Promise<DeviceRow[]> {
    const desktop = bridge();
    if (desktop) return desktop.listDevices(networkId);
    if (await hasServer()) {
      return get<DeviceRow[]>(`/devices${networkId ? `?networkId=${networkId}` : ""}`);
    }
    return demoBackend.listDevices(networkId);
  },

  async getDevice(id: string): Promise<DeviceDetail | null> {
    const desktop = bridge();
    if (desktop) return desktop.getDevice(id);
    if (await hasServer()) return get<DeviceDetail | null>(`/device?id=${id}`);
    return demoBackend.getDevice(id) as DeviceDetail | null;
  },

  async updateDevice(id: string, patch: Partial<DeviceRow>) {
    const desktop = bridge();
    if (desktop) return desktop.updateDevice(id, patch);
    if (await hasServer()) return send("/devices", "PATCH", { id, patch });
    return demoBackend.updateDevice(id, patch);
  },

  async listScans(networkId?: string): Promise<ScanRow[]> {
    const desktop = bridge();
    if (desktop) return desktop.listScans(networkId);
    if (await hasServer()) {
      return get<ScanRow[]>(`/scans${networkId ? `?networkId=${networkId}` : ""}`);
    }
    return demoBackend.listScans(networkId);
  },

  async listHistory(deviceId?: string): Promise<HistoryRow[]> {
    const desktop = bridge();
    if (desktop) return desktop.listHistory(deviceId);
    if (await hasServer()) {
      return get<HistoryRow[]>(`/history${deviceId ? `?deviceId=${deviceId}` : ""}`);
    }
    return demoBackend.listHistory(deviceId);
  },

  async getDashboard(): Promise<Dashboard> {
    const desktop = bridge();
    if (desktop) return desktop.getDashboard();
    if (await hasServer()) return get<Dashboard>("/dashboard");
    return demoBackend.getDashboard();
  },

  async getScanStatus(): Promise<ScanProgress> {
    const desktop = bridge();
    if (desktop) return desktop.getScanStatus();
    if (await hasServer()) return get<ScanProgress>("/scan/status");
    return demoProgress;
  },

  async startScan(networkId: string, options: ScanOptions = {}) {
    const desktop = bridge();
    if (desktop) return desktop.startScan(networkId, options);
    if (await hasServer()) {
      return send<{ scanId: string }>("/scan/start", "POST", { networkId, options });
    }

    if (demoProgress.running) throw new Error("A scan is already running");
    demoProgress = { running: true, networkId, percent: 0, completed: 0, total: 254, found: 0 };
    emitDemo({ type: "scan:started", networkId });
    demoCancel = demoBackend.simulateScan(
      networkId,
      (progress) => {
        demoProgress = { running: true, networkId, ...progress };
        emitDemo({ type: "scan:progress", networkId, ...progress });
      },
      () => {
        demoProgress = { running: false };
        demoCancel = null;
        emitDemo({ type: "scan:finished", networkId });
      },
    );
    return { scanId: `demo-${Date.now()}` };
  },

  async stopScan() {
    const desktop = bridge();
    if (desktop) return desktop.stopScan();
    if (await hasServer()) return send("/scan/stop", "POST", {});
    if (demoCancel) demoCancel();
    demoCancel = null;
    demoProgress = { running: false };
    emitDemo({ type: "scan:finished" });
    return { running: false };
  },

  async startPing(ip: string, options: PingOptions = {}) {
    const desktop = bridge();
    if (desktop) return desktop.startPing(ip, options);
    if (await hasServer()) {
      return send<{ sessionId: string; ip: string }>("/ping/start", "POST", { ip, options });
    }

    const sessionId = `demo-ping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const intervalMs = Math.min(Math.max(options.intervalMs ?? 1000, 250), 60000);
    let sequence = 0;
    emitDemo({ type: "ping:started", sessionId, ip });
    const timer = setInterval(() => {
      sequence += 1;
      const timedOut = Math.random() < 0.08;
      emitDemo({
        type: "ping:result",
        sessionId,
        ip,
        sequence,
        rttMs: timedOut ? null : Math.round(2 + Math.random() * 40),
        timestamp: new Date().toISOString(),
      });
    }, intervalMs);
    demoPingTimers.set(sessionId, timer);
    return { sessionId, ip };
  },

  async stopPing(sessionId: string) {
    const desktop = bridge();
    if (desktop) return desktop.stopPing(sessionId);
    if (await hasServer()) return send<{ stopped: boolean }>("/ping/stop", "POST", { sessionId });

    const timer = demoPingTimers.get(sessionId);
    if (!timer) return { stopped: false };
    clearInterval(timer);
    demoPingTimers.delete(sessionId);
    emitDemo({ type: "ping:stopped", sessionId });
    return { stopped: true };
  },

  async exportData(): Promise<{ saved: boolean; filePath?: string }> {
    const desktop = bridge();
    if (desktop) return desktop.exportData();

    const payload = (await hasServer())
      ? await get<unknown>("/export")
      : {
          exportedAt: new Date().toISOString(),
          networks: demoBackend.listNetworks(),
          devices: demoBackend.listDevices(),
          scans: demoBackend.listScans(),
          history: demoBackend.listHistory(),
        };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `netscan-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { saved: true };
  },

  async importTargetsFile(): Promise<{ content: string | null }> {
    const desktop = bridge();
    if (desktop) return desktop.importTargetsFile();
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,.csv,.list,text/plain";
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve({ content: file ? await file.text() : null });
      };
      input.click();
    });
  },

  async getVaultStatus(): Promise<VaultStatus> {
    const desktop = bridge();
    if (desktop) return desktop.getVaultStatus();
    if (await hasServer()) return get<VaultStatus>("/vault/status");
    return demoBackend.getVaultStatus();
  },

  async setupVault(password: string): Promise<VaultStatus> {
    const desktop = bridge();
    if (desktop) return desktop.setupVault(password);
    if (await hasServer()) return send<VaultStatus>("/vault/setup", "POST", { password });
    return demoBackend.setupVault(password);
  },

  async unlockVault(password: string): Promise<VaultStatus> {
    const desktop = bridge();
    if (desktop) return desktop.unlockVault(password);
    if (await hasServer()) return send<VaultStatus>("/vault/unlock", "POST", { password });
    return demoBackend.unlockVault(password);
  },

  async lockVault(): Promise<VaultStatus> {
    const desktop = bridge();
    if (desktop) return desktop.lockVault();
    if (await hasServer()) return send<VaultStatus>("/vault/lock", "POST", {});
    return demoBackend.lockVault();
  },

  async changeMasterPassword(oldPassword: string, newPassword: string): Promise<VaultStatus> {
    const desktop = bridge();
    if (desktop) return desktop.changeMasterPassword(oldPassword, newPassword);
    if (await hasServer()) {
      return send<VaultStatus>("/vault/change-password", "POST", { oldPassword, newPassword });
    }
    return demoBackend.changeMasterPassword(oldPassword, newPassword);
  },

  async resetVault(): Promise<VaultStatus> {
    const desktop = bridge();
    if (desktop) return desktop.resetVault();
    if (await hasServer()) return send<VaultStatus>("/vault/reset", "POST", {});
    return demoBackend.resetVault();
  },

  async listCredentials(deviceId?: string): Promise<CredentialRow[]> {
    const desktop = bridge();
    if (desktop) return desktop.listCredentials(deviceId);
    if (await hasServer()) {
      return get<CredentialRow[]>(`/credentials${deviceId ? `?deviceId=${deviceId}` : ""}`);
    }
    return demoBackend.listCredentials(deviceId);
  },

  async getCredentialSecret(id: string): Promise<CredentialSecret> {
    const desktop = bridge();
    if (desktop) return desktop.getCredentialSecret(id);
    if (await hasServer()) return get<CredentialSecret>(`/credentials/secret?id=${id}`);
    return demoBackend.getCredentialSecret(id);
  },

  async createCredential(input: CredentialInput): Promise<CredentialRow> {
    const desktop = bridge();
    if (desktop) return desktop.createCredential(input);
    if (await hasServer()) return send<CredentialRow>("/credentials", "POST", input);
    return demoBackend.createCredential(input);
  },

  async updateCredential(id: string, patch: CredentialPatch): Promise<CredentialRow> {
    const desktop = bridge();
    if (desktop) return desktop.updateCredential(id, patch);
    if (await hasServer()) return send<CredentialRow>("/credentials", "PATCH", { id, patch });
    return demoBackend.updateCredential(id, patch);
  },

  async deleteCredential(id: string): Promise<{ ok: boolean }> {
    const desktop = bridge();
    if (desktop) return desktop.deleteCredential(id);
    if (await hasServer()) return send<{ ok: boolean }>("/credentials", "DELETE", { id });
    return demoBackend.deleteCredential(id);
  },

  /** Subscribe to live scan events across whichever transport is active. */
  subscribe(handler: (event: NetscanEvent) => void): () => void {
    const desktop = bridge();
    if (desktop) return desktop.onEvent(handler);

    // hasServer() may still be resolving the first time a caller subscribes
    // (e.g. mounted before getTransport()'s probe lands) — wait for the real
    // answer instead of reading the (possibly still-null) cached flag, or
    // this silently attaches to the demo bus, which real scans never publish to.
    let cancelled = false;
    let teardown: (() => void) | null = null;

    void hasServer().then((available) => {
      if (cancelled) return;
      if (available) {
        const source = new EventSource("api/events");
        source.onmessage = (message) => {
          try {
            handler(JSON.parse(message.data) as NetscanEvent);
          } catch {
            /* ignore malformed frames */
          }
        };
        teardown = () => source.close();
      } else {
        demoListeners.add(handler);
        teardown = () => demoListeners.delete(handler);
      }
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  },
};
