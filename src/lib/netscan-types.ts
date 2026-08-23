export type NetworkRow = {
  id: string;
  name: string;
  cidr: string;
  source: string;
  created_at: string;
  updated_at: string;
  deviceCount?: number;
  onlineCount?: number;
  lastScanAt?: string | null;
};

export type DeviceRow = {
  id: string;
  network_id: string;
  ip: string;
  hostname: string | null;
  mac: string | null;
  vendor: string | null;
  online: boolean;
  response_time: number | null;
  open_ports: number[];
  first_seen: string;
  last_seen: string;
  notes: string | null;
};

export type HistoryRow = {
  id: string;
  device_id: string;
  scan_id: string;
  event: string;
  detail: string;
  created_at: string;
};

export type ScanRow = {
  id: string;
  network_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  hosts_scanned: number;
  devices_found: number;
  new_devices: number;
  missing_devices: number;
};

export type ScanProgress = {
  running: boolean;
  scanId?: string;
  networkId?: string;
  total?: number;
  completed?: number;
  found?: number;
  percent?: number;
  currentIp?: string | null;
};

export type Dashboard = {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  newDevices: number;
  missingDevices: number;
  networks: number;
  lastScanAt: string | null;
  vendors: { vendor: string; count: number }[];
  recentScans: ScanRow[];
  recentHistory: HistoryRow[];
};

export type LocalInterface = {
  interface: string;
  address: string;
  netmask: string;
  mac: string | null;
  cidr: string;
  hostCount: number;
};

export type Info = {
  backend: string;
  dbFile: string;
  platform: string;
  defaultPorts: number[];
  portLabels: Record<string, string>;
  interfaces: LocalInterface[];
};

export type NetscanEvent = {
  type: string;
  scanId?: string;
  networkId?: string;
  message?: string;
  [key: string]: unknown;
};

export type TransportMode = "desktop" | "server" | "demo";
