import type {
  CredentialInput,
  CredentialPatch,
  CredentialRow,
  CredentialSecret,
  Dashboard,
  DeviceRow,
  HistoryRow,
  Info,
  NetworkRow,
  OuiStatus,
  ScanProfile,
  ScanProfilePortsConfig,
  ScanRow,
  VaultStatus,
  WebhookConfig,
  WebhookConfigPatch,
} from "./netscan-types";

/**
 * In-browser demo backend.
 *
 * A browser tab cannot ping, read ARP tables or open raw sockets, so when the
 * UI runs outside Electron / Docker it talks to this simulated backend
 * instead. Same shapes, same flows - just fabricated devices, so the whole
 * interface stays explorable in the web preview.
 */

const VENDORS = [
  "Ubiquiti Networks",
  "Apple",
  "Raspberry Pi",
  "Synology",
  "Espressif (ESP8266/ESP32)",
  "Philips Hue",
  "Samsung Electronics",
  "Sonos",
  "Brother Industries",
  "Intel",
];

const HOSTNAMES = [
  "gateway.lan",
  "unifi-ap-office.lan",
  "nas.lan",
  "macbook-koen.lan",
  "printer-hallway.lan",
  "hue-bridge.lan",
  "sonos-kitchen.lan",
  "esp-sensor-garage.lan",
  "tv-living.lan",
  "pi-hole.lan",
  "camera-frontdoor.lan",
  "workstation.lan",
];

// Parallel to VENDORS/HOSTNAMES by index - keeps demo data self-consistent
// (e.g. the Synology entry shows up as a "server", not "Unknown").
const CATEGORIES = [
  "router",
  "laptop",
  "server",
  "server",
  "iot",
  "iot",
  "tv",
  "speaker",
  "printer",
  "desktop",
];

const PORT_SETS = [
  [22, 80, 443],
  [80, 443, 8443],
  [22, 445, 5000, 5432],
  [80, 631, 9100],
  [80],
  [22, 1883],
  [80, 443, 3389],
  [53, 80],
];

function randomMac(index: number) {
  const prefixes = [
    "24:5A:4C",
    "3C:22:FB",
    "B8:27:EB",
    "BC:F6:85",
    "5C:CF:7F",
    "00:17:88",
    "3C:D0:F8",
    "4C:17:EB",
    "00:80:77",
    "00:1B:21",
  ];
  const prefix = prefixes[index % prefixes.length];
  const tail = [0, 1, 2]
    .map((offset) =>
      (((index + 1) * 37 + offset * 91) % 256).toString(16).padStart(2, "0").toUpperCase(),
    )
    .join(":");
  return `${prefix}:${tail}`;
}

function iso(offsetMinutes: number) {
  return new Date(Date.now() - offsetMinutes * 60_000).toISOString();
}

type DemoState = {
  networks: NetworkRow[];
  devices: DeviceRow[];
  scans: ScanRow[];
  history: HistoryRow[];
  credentials: CredentialRow[];
};

function buildState(): DemoState {
  const networkId = "demo-network-1";
  const networks: NetworkRow[] = [
    {
      id: networkId,
      name: "Home LAN",
      cidr: "192.168.1.0/24",
      source: "auto",
      created_at: iso(60 * 24 * 12),
      updated_at: iso(12),
    },
    {
      id: "demo-network-2",
      name: "IoT VLAN",
      cidr: "192.168.30.0/24",
      source: "manual",
      created_at: iso(60 * 24 * 6),
      updated_at: iso(190),
    },
  ];

  const devices: DeviceRow[] = Array.from({ length: 18 }, (_, index) => {
    const online = index % 7 !== 5;
    const inIot = index >= 12;
    return {
      id: `demo-device-${index + 1}`,
      network_id: inIot ? "demo-network-2" : networkId,
      ip: inIot ? `192.168.30.${index + 4}` : `192.168.1.${index + 1}`,
      hostname: index % 5 === 3 ? null : (HOSTNAMES[index % HOSTNAMES.length] ?? null),
      mac: randomMac(index),
      vendor: VENDORS[index % VENDORS.length] ?? null,
      online,
      response_time: online ? Math.round((3 + ((index * 7) % 40)) * 10) / 10 : null,
      open_ports: online ? (PORT_SETS[index % PORT_SETS.length] ?? []) : [],
      first_seen: iso(60 * 24 * (14 - (index % 10))),
      last_seen: online ? iso(11) : iso(60 * 24 * 2),
      notes: null,
      label: null,
      // Leave every third device uncategorized so the demo shows what an
      // unclassified device looks like too, not just a fully-tagged fleet.
      category: index % 3 === 2 ? null : (CATEGORIES[index % CATEGORIES.length] ?? null),
    };
  });

  const scans: ScanRow[] = Array.from({ length: 6 }, (_, index) => ({
    id: `demo-scan-${index + 1}`,
    network_id: index % 3 === 2 ? "demo-network-2" : networkId,
    started_at: iso(11 + index * 240),
    finished_at: iso(9 + index * 240),
    status: "completed",
    hosts_scanned: 254,
    devices_found: 16 - (index % 3),
    new_devices: index === 0 ? 2 : index % 2,
    missing_devices: index === 0 ? 1 : 0,
  }));

  const history: HistoryRow[] = [
    {
      id: "demo-history-1",
      device_id: "demo-device-1",
      scan_id: "demo-scan-1",
      event: "ports_changed",
      detail: "opened: 8443",
      created_at: iso(11),
    },
    {
      id: "demo-history-2",
      device_id: "demo-device-6",
      scan_id: "demo-scan-1",
      event: "first_seen",
      detail: "Discovered at 192.168.1.6",
      created_at: iso(11),
    },
    {
      id: "demo-history-3",
      device_id: "demo-device-13",
      scan_id: "demo-scan-1",
      event: "status_change",
      detail: "No longer responding",
      created_at: iso(11),
    },
    {
      id: "demo-history-4",
      device_id: "demo-device-3",
      scan_id: "demo-scan-2",
      event: "hostname_changed",
      detail: "unknown -> nas.lan",
      created_at: iso(251),
    },
    {
      id: "demo-history-5",
      device_id: "demo-device-10",
      scan_id: "demo-scan-1",
      event: "first_seen",
      detail: "Discovered at 192.168.1.10",
      created_at: iso(11),
    },
  ];

  const credentials: CredentialRow[] = [
    {
      id: "demo-credential-1",
      device_id: "demo-device-1",
      label: "Router admin",
      protocol: "http",
      host_override: null,
      port: null,
      username: "admin",
      secret_type: "password",
      created_at: iso(60 * 24 * 10),
      updated_at: iso(60 * 24 * 10),
    },
    {
      id: "demo-credential-2",
      device_id: "demo-device-3",
      label: "NAS web UI",
      protocol: "https",
      host_override: null,
      port: 5001,
      username: "koen",
      secret_type: "password",
      created_at: iso(60 * 24 * 8),
      updated_at: iso(60 * 24 * 8),
    },
    {
      id: "demo-credential-3",
      device_id: "demo-device-3",
      label: "NAS SSH",
      protocol: "ssh",
      host_override: null,
      port: null,
      username: "koen",
      secret_type: "ssh_key",
      created_at: iso(60 * 24 * 8),
      updated_at: iso(60 * 24 * 8),
    },
  ];

  demoSecrets.set("demo-credential-1", { kind: "password", password: "letmein123" });
  demoSecrets.set("demo-credential-2", { kind: "password", password: "hunter2!" });
  demoSecrets.set("demo-credential-3", {
    kind: "ssh_key",
    privateKey:
      "-----BEGIN OPENSSH PRIVATE KEY-----\n(demo key - not a real credential)\n-----END OPENSSH PRIVATE KEY-----",
    passphrase: "",
    publicKey: "ssh-ed25519 AAAA...demo koen@nas",
  });

  return { networks, devices, scans, history, credentials };
}

let state: DemoState | null = null;
const demoSecrets = new Map<string, CredentialSecret>();
let demoVaultPassword: string | null = null;
let demoVaultUnlocked = false;

let demoWebhookConfig: WebhookConfig = {
  url: "",
  enabled: false,
  events: ["first_seen", "status_change", "ports_changed"],
  updatedAt: null,
};

// "quick" scans no ports by default (ping only) - matches core/scanner.cjs's
// SCAN_PROFILES. standard/deep mirror its real port lists, just illustrative
// rather than exhaustive, same as demoInfo.defaultPorts below.
const DEMO_DEFAULT_PROFILE_PORTS: Record<ScanProfile, number[]> = {
  quick: [],
  standard: [22, 80, 443, 445, 631, 3389, 5432, 8080, 9100],
  deep: [
    21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 631, 3000, 3306, 3389, 5432, 5900, 8080, 8443, 9100,
  ],
};

let demoScanProfileConfig: ScanProfilePortsConfig = {
  ...DEMO_DEFAULT_PROFILE_PORTS,
  customized: { quick: false, standard: false, deep: false },
  updatedAt: null,
};

function getState(): DemoState {
  if (!state) state = buildState();
  return state;
}

export const demoInfo: Info = {
  backend: "demo",
  dbFile: "(in-memory demo data)",
  platform: "browser",
  defaultPorts: [22, 80, 443, 445, 631, 3389, 5432, 8080, 9100],
  portLabels: {
    "22": "SSH",
    "80": "HTTP",
    "443": "HTTPS",
    "445": "SMB",
    "631": "IPP",
    "1883": "MQTT",
    "3389": "RDP",
    "5000": "UPnP",
    "5432": "PostgreSQL",
    "8080": "HTTP-alt",
    "8443": "HTTPS-alt",
    "9100": "Printer (RAW)",
  },
  scanProfiles: ["quick", "standard", "deep"],
  defaultScanProfile: "standard",
  webhookEvents: [
    "first_seen",
    "status_change",
    "ip_changed",
    "hostname_changed",
    "vendor_changed",
    "ports_changed",
  ],
  interfaces: [
    {
      interface: "eth0",
      address: "192.168.1.42",
      netmask: "255.255.255.0",
      mac: "3C:22:FB:11:22:33",
      cidr: "192.168.1.0/24",
      hostCount: 254,
    },
  ],
};

export const demoBackend = {
  getOuiStatus(): OuiStatus {
    return { builtinEntries: 181, downloadedEntries: 0, updatedAt: null, source: null };
  },

  getWebhookConfig(): WebhookConfig {
    return demoWebhookConfig;
  },

  updateWebhookConfig(patch: WebhookConfigPatch): WebhookConfig {
    const next = { ...demoWebhookConfig, ...patch };
    if (next.url) {
      try {
        new URL(next.url);
      } catch {
        throw new Error("That doesn't look like a valid URL");
      }
    }
    if (!next.events.length) throw new Error("Select at least one event type");
    demoWebhookConfig = { ...next, updatedAt: new Date().toISOString() };
    return demoWebhookConfig;
  },

  getScanProfilePorts(): ScanProfilePortsConfig {
    return demoScanProfileConfig;
  },

  updateScanProfilePorts(profile: ScanProfile, ports: number[]): ScanProfilePortsConfig {
    const clean = Array.from(new Set(ports.map(Number)))
      .filter((p) => Number.isInteger(p) && p > 0 && p < 65536)
      .sort((a, b) => a - b);
    demoScanProfileConfig = {
      ...demoScanProfileConfig,
      [profile]: clean,
      customized: { ...demoScanProfileConfig.customized, [profile]: true },
      updatedAt: new Date().toISOString(),
    };
    return demoScanProfileConfig;
  },

  resetScanProfilePorts(profile: ScanProfile): ScanProfilePortsConfig {
    demoScanProfileConfig = {
      ...demoScanProfileConfig,
      [profile]: DEMO_DEFAULT_PROFILE_PORTS[profile],
      customized: { ...demoScanProfileConfig.customized, [profile]: false },
      updatedAt: new Date().toISOString(),
    };
    return demoScanProfileConfig;
  },

  listNetworks(): NetworkRow[] {
    const { networks, devices, scans } = getState();
    return networks.map((network) => {
      const own = devices.filter((d) => d.network_id === network.id);
      const lastScan = scans.find((s) => s.network_id === network.id);
      return {
        ...network,
        deviceCount: own.length,
        onlineCount: own.filter((d) => d.online).length,
        lastScanAt: lastScan ? lastScan.started_at : null,
      };
    });
  },

  createNetwork(input: { name?: string; cidr: string; source?: string }): NetworkRow {
    const network: NetworkRow = {
      id: `demo-network-${Date.now()}`,
      name: input.name || input.cidr,
      cidr: input.cidr,
      source: input.source || "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    getState().networks.push(network);
    return network;
  },

  updateNetwork(id: string, patch: Partial<NetworkRow>) {
    const network = getState().networks.find((n) => n.id === id);
    if (network) Object.assign(network, patch, { updated_at: new Date().toISOString() });
    return network ?? null;
  },

  deleteNetwork(id: string) {
    const current = getState();
    const removedDeviceIds = new Set(
      current.devices.filter((d) => d.network_id === id).map((d) => d.id),
    );
    current.networks = current.networks.filter((n) => n.id !== id);
    current.devices = current.devices.filter((d) => d.network_id !== id);
    current.scans = current.scans.filter((s) => s.network_id !== id);
    current.history = current.history.filter((h) => !removedDeviceIds.has(h.device_id));
    current.credentials = current.credentials.filter((c) => !removedDeviceIds.has(c.device_id));
    return { ok: true };
  },

  listDevices(networkId?: string): DeviceRow[] {
    return getState().devices.filter((d) => !networkId || d.network_id === networkId);
  },

  getDevice(id: string) {
    const device = getState().devices.find((d) => d.id === id);
    if (!device) return null;
    return { ...device, history: demoBackend.listHistory(id) };
  },

  updateDevice(id: string, patch: Partial<DeviceRow>) {
    const device = getState().devices.find((d) => d.id === id);
    if (device) Object.assign(device, patch);
    return device ?? null;
  },

  updateDevices(ids: string[], patch: Partial<DeviceRow>): DeviceRow[] {
    const idSet = new Set(ids);
    const updated: DeviceRow[] = [];
    for (const device of getState().devices) {
      if (!idSet.has(device.id)) continue;
      Object.assign(device, patch);
      updated.push(device);
    }
    return updated;
  },

  deleteDevices(ids: string[]): { ok: boolean } {
    const current = getState();
    const idSet = new Set(ids);
    current.devices = current.devices.filter((d) => !idSet.has(d.id));
    current.history = current.history.filter((h) => !idSet.has(h.device_id));
    current.credentials = current.credentials.filter((c) => !idSet.has(c.device_id));
    return { ok: true };
  },

  async rescanDevicePorts(
    id: string,
    options: { profile?: ScanProfile } = {},
  ): Promise<{ device: DeviceRow | null }> {
    const device = getState().devices.find((d) => d.id === id);
    if (!device) throw new Error("Device not found");

    // A little artificial delay so the button's spinner isn't instant even
    // in demo mode - a real port probe takes a moment too.
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));

    if (options.profile === "quick") {
      device.last_seen = new Date().toISOString();
      return { device };
    }

    const candidates = options.profile === "deep" ? [22, 80, 443, 3000, 8080, 8443] : [22, 80, 443];
    const previous = device.open_ports;
    const kept = previous.filter((p) => !candidates.includes(p));
    const found = candidates.filter(() => Math.random() > 0.4);
    const ports = Array.from(new Set([...kept, ...found])).sort((a, b) => a - b);

    const opened = ports.filter((p) => !previous.includes(p));
    const closed = previous.filter((p) => !ports.includes(p));
    if (opened.length || closed.length) {
      getState().history.unshift({
        id: `demo-history-${Date.now()}`,
        device_id: device.id,
        scan_id: "",
        event: "ports_changed",
        detail: [
          opened.length ? `opened: ${opened.join(", ")}` : null,
          closed.length ? `closed: ${closed.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
        created_at: new Date().toISOString(),
      });
    }

    device.open_ports = ports;
    device.online = true;
    device.last_seen = new Date().toISOString();
    return { device };
  },

  listScans(networkId?: string): ScanRow[] {
    return getState().scans.filter((s) => !networkId || s.network_id === networkId);
  },

  listHistory(deviceId?: string): HistoryRow[] {
    return getState().history.filter((h) => !deviceId || h.device_id === deviceId);
  },

  exportNetwork(networkId: string) {
    const { networks, devices, scans, history } = getState();
    const network = networks.find((n) => n.id === networkId);
    const ownDevices = devices.filter((d) => d.network_id === networkId);
    const deviceIds = new Set(ownDevices.map((d) => d.id));
    return {
      exportedAt: new Date().toISOString(),
      network,
      devices: ownDevices,
      scans: scans.filter((s) => s.network_id === networkId),
      history: history.filter((h) => deviceIds.has(h.device_id)),
    };
  },

  exportScan(scanId: string) {
    const { networks, devices, scans, history } = getState();
    const scan = scans.find((s) => s.id === scanId);
    return {
      exportedAt: new Date().toISOString(),
      scan,
      network: scan ? networks.find((n) => n.id === scan.network_id) : null,
      devices: scan ? devices.filter((d) => d.network_id === scan.network_id) : [],
      history: history.filter((h) => h.scan_id === scanId),
    };
  },

  getDashboard(): Dashboard {
    const { devices, scans, history } = getState();
    const vendorCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    for (const device of devices) {
      const key = device.vendor || "Unknown";
      vendorCounts.set(key, (vendorCounts.get(key) || 0) + 1);
      const category = device.category || "uncategorized";
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }
    return {
      totalDevices: devices.length,
      onlineDevices: devices.filter((d) => d.online).length,
      offlineDevices: devices.filter((d) => !d.online).length,
      newDevices: scans[0]?.new_devices ?? 0,
      missingDevices: scans[0]?.missing_devices ?? 0,
      networks: getState().networks.length,
      lastScanAt: scans[0]?.started_at ?? null,
      vendors: [...vendorCounts.entries()]
        .map(([vendor, count]) => ({ vendor, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      categories: [...categoryCounts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      recentScans: scans.slice(0, 10),
      recentHistory: history.slice(0, 25),
    };
  },

  /* -------------------------- vault (simulated) -------------------------- */
  // The demo shell has no real crypto - it's already an explicitly
  // non-real-scanning preview, so the "vault" is just a password check kept
  // in memory for the length of the page session.

  getVaultStatus(): VaultStatus {
    return { configured: demoVaultPassword !== null, unlocked: demoVaultUnlocked };
  },

  setupVault(password: string): VaultStatus {
    if (password.length < 8) throw new Error("Master password must be at least 8 characters");
    if (demoVaultPassword !== null) {
      throw new Error("Vault already configured - use changeMasterPassword instead");
    }
    demoVaultPassword = password;
    demoVaultUnlocked = true;
    return demoBackend.getVaultStatus();
  },

  unlockVault(password: string): VaultStatus {
    if (demoVaultPassword === null) throw new Error("Vault has not been set up yet");
    if (password !== demoVaultPassword) throw new Error("Incorrect master password");
    demoVaultUnlocked = true;
    return demoBackend.getVaultStatus();
  },

  lockVault(): VaultStatus {
    demoVaultUnlocked = false;
    return demoBackend.getVaultStatus();
  },

  changeMasterPassword(oldPassword: string, newPassword: string): VaultStatus {
    if (demoVaultPassword === null) throw new Error("Vault has not been set up yet");
    if (oldPassword !== demoVaultPassword) throw new Error("Incorrect current master password");
    if (newPassword.length < 8) throw new Error("Master password must be at least 8 characters");
    demoVaultPassword = newPassword;
    demoVaultUnlocked = true;
    return demoBackend.getVaultStatus();
  },

  resetVault(): VaultStatus {
    demoVaultPassword = null;
    demoVaultUnlocked = false;
    getState().credentials = [];
    demoSecrets.clear();
    return demoBackend.getVaultStatus();
  },

  /* ------------------------- credentials (simulated) ---------------------- */

  listCredentials(deviceId?: string): CredentialRow[] {
    return getState().credentials.filter((c) => !deviceId || c.device_id === deviceId);
  },

  getCredentialSecret(id: string): CredentialSecret {
    if (!demoVaultUnlocked) throw new Error("Vault is locked");
    const secret = demoSecrets.get(id);
    if (!secret) throw new Error("Credential not found");
    return secret;
  },

  createCredential(input: CredentialInput): CredentialRow {
    if (!demoVaultUnlocked) throw new Error("Vault is locked");
    if (!getState().devices.some((d) => d.id === input.device_id)) {
      throw new Error("Device not found");
    }
    if (!input.label.trim()) throw new Error("Label is required");
    const timestamp = new Date().toISOString();
    const row: CredentialRow = {
      id: `demo-credential-${Date.now()}`,
      device_id: input.device_id,
      label: input.label.trim(),
      protocol: input.protocol,
      host_override: input.host_override ?? null,
      port: input.port ?? null,
      username: input.username ?? null,
      secret_type: input.secret_type,
      created_at: timestamp,
      updated_at: timestamp,
    };
    getState().credentials.push(row);
    demoSecrets.set(
      row.id,
      input.secret_type === "ssh_key"
        ? {
            kind: "ssh_key",
            privateKey: input.privateKey,
            passphrase: input.passphrase ?? "",
            publicKey: input.publicKey ?? null,
          }
        : { kind: "password", password: input.password },
    );
    return row;
  },

  updateCredential(id: string, patch: CredentialPatch): CredentialRow {
    if (!demoVaultUnlocked) throw new Error("Vault is locked");
    const row = getState().credentials.find((c) => c.id === id);
    if (!row) throw new Error("Credential not found");
    for (const key of ["label", "protocol", "host_override", "port", "username"] as const) {
      if (key in patch && patch[key] !== undefined) {
        (row as Record<string, unknown>)[key] = patch[key];
      }
    }
    if ("secret_type" in patch && patch.secret_type) {
      const current = demoSecrets.get(id);
      if (patch.secret_type === "ssh_key") {
        const base =
          current?.kind === "ssh_key"
            ? current
            : { privateKey: "", passphrase: "", publicKey: null };
        demoSecrets.set(id, {
          kind: "ssh_key",
          privateKey: patch.privateKey ?? base.privateKey,
          passphrase: patch.passphrase ?? base.passphrase,
          publicKey: patch.publicKey ?? base.publicKey,
        });
      } else {
        const base = current?.kind === "password" ? current : { password: "" };
        demoSecrets.set(id, {
          kind: "password",
          password: patch.password ?? base.password,
        });
      }
      row.secret_type = patch.secret_type;
    }
    row.updated_at = new Date().toISOString();
    return row;
  },

  deleteCredential(id: string): { ok: boolean } {
    const current = getState();
    current.credentials = current.credentials.filter((c) => c.id !== id);
    demoSecrets.delete(id);
    return { ok: true };
  },

  /** Simulate a sweep so the scan screen is fully explorable in the browser. */
  simulateScan(
    networkId: string,
    onProgress: (progress: {
      total: number;
      completed: number;
      found: number;
      percent: number;
      currentIp: string | null;
    }) => void,
    onDone: () => void,
  ) {
    const total = 254;
    let completed = 0;
    const deviceCount = demoBackend.listDevices(networkId).length;
    const timer = setInterval(() => {
      completed = Math.min(total, completed + Math.ceil(Math.random() * 14));
      const percent = Math.round((completed / total) * 100);
      onProgress({
        total,
        completed,
        found: Math.min(deviceCount, Math.round((percent / 100) * deviceCount)),
        percent,
        currentIp: `192.168.1.${Math.max(1, Math.min(254, completed))}`,
      });
      if (completed >= total) {
        clearInterval(timer);
        const current = getState();
        current.scans.unshift({
          id: `demo-scan-${Date.now()}`,
          network_id: networkId,
          started_at: new Date(Date.now() - 20_000).toISOString(),
          finished_at: new Date().toISOString(),
          status: "completed",
          hosts_scanned: total,
          devices_found: deviceCount,
          new_devices: 0,
          missing_devices: 0,
        });
        onDone();
      }
    }, 260);
    return () => clearInterval(timer);
  },
};
