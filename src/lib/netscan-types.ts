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
  label: string | null;
  category: string | null;
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
  categories: { category: string; count: number }[];
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
  device?: DeviceRow;
  credential?: CredentialRow;
  id?: string;
  [key: string]: unknown;
};

export type TransportMode = "desktop" | "server" | "demo";

export type CredentialProtocol =
  "http" | "https" | "ssh" | "telnet" | "rdp" | "vnc" | "ftp" | "other";

export type CredentialSecretKind = "password" | "ssh_key";

export type CredentialRow = {
  id: string;
  device_id: string;
  label: string;
  protocol: CredentialProtocol;
  host_override: string | null;
  port: number | null;
  username: string | null;
  secret_type: CredentialSecretKind;
  created_at: string;
  updated_at: string;
};

// Discriminated union, not a fixed {password,notes} shape - this is what lets
// a future secret kind (e.g. an API token for some other addon) be added
// later without a DB migration: core/vault.cjs encrypts whatever JSON object
// is handed to it, so a new union member is the only change needed.
export type CredentialSecret =
  | { kind: "password"; password: string }
  | { kind: "ssh_key"; privateKey: string; passphrase: string; publicKey: string | null };

export type CredentialInput = {
  device_id: string;
  label: string;
  protocol: CredentialProtocol;
  host_override?: string | null;
  port?: number | null;
  username?: string | null;
} & (
  | { secret_type: "password"; password: string }
  | { secret_type: "ssh_key"; privateKey: string; passphrase?: string; publicKey?: string | null }
);

// Not a strict discriminated union: the caller includes only the fields it's
// actually changing (mirrors how core/service.cjs's updateCredential checks
// "key" in patch per field), so metadata-only edits and secret replacements
// share one loose shape instead of forcing every field on every call.
export type CredentialPatch = Partial<
  Pick<CredentialRow, "label" | "protocol" | "host_override" | "port" | "username">
> & {
  secret_type?: CredentialSecretKind;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  publicKey?: string | null;
};

export type VaultStatus = { configured: boolean; unlocked: boolean };
