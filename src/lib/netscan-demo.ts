import type {
  Dashboard,
  DeviceRow,
  HistoryRow,
  Info,
  NetworkRow,
  ScanRow,
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
      hostname: index % 5 === 3 ? null : HOSTNAMES[index % HOSTNAMES.length],
      mac: randomMac(index),
      vendor: VENDORS[index % VENDORS.length],
      online,
      response_time: online ? Math.round((3 + ((index * 7) % 40)) * 10) / 10 : null,
      open_ports: online ? PORT_SETS[index % PORT_SETS.length] : [],
      first_seen: iso(60 * 24 * (14 - (index % 10))),
      last_seen: online ? iso(11) : iso(60 * 24 * 2),
      notes: null,
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
      device_id: "demo-device-6",
      scan_id: "demo-scan-2",
      event: "status_change",
      detail: "No longer responding",
      created_at: iso(251),
    },
    {
      id: "demo-history-4",
      device_id: "demo-device-3",
      scan_id: "demo-scan-2",
      event: "hostname_changed",
      detail: "unknown -> nas.lan",
      created_at: iso(251),
    },
  ];

  return { networks, devices, scans, history };
}

let state: DemoState | null = null;
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
    current.networks = current.networks.filter((n) => n.id !== id);
    current.devices = current.devices.filter((d) => d.network_id !== id);
    current.scans = current.scans.filter((s) => s.network_id !== id);
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

  listScans(networkId?: string): ScanRow[] {
    return getState().scans.filter((s) => !networkId || s.network_id === networkId);
  },

  listHistory(deviceId?: string): HistoryRow[] {
    return getState().history.filter((h) => !deviceId || h.device_id === deviceId);
  },

  getDashboard(): Dashboard {
    const { devices, scans, history } = getState();
    const vendorCounts = new Map<string, number>();
    for (const device of devices) {
      const key = device.vendor || "Unknown";
      vendorCounts.set(key, (vendorCounts.get(key) || 0) + 1);
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
      recentScans: scans.slice(0, 10),
      recentHistory: history.slice(0, 25),
    };
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
