import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useState } from "react";
import { netscan } from "@/lib/netscan-api";
import type {
  CredentialSecret,
  Dashboard,
  DeviceRow,
  HistoryRow,
  ScanRow,
} from "@/lib/netscan-types";
import { mono, statusColors } from "@/theme";

export function Mono({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: mono, fontSize: 13 }}>
      {children}
    </Box>
  );
}

export function StatusDot({ online }: { online: boolean }) {
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        flexShrink: 0,
        backgroundColor: online ? statusColors.online : statusColors.offline,
        boxShadow: online ? `0 0 10px ${statusColors.online}` : "none",
      }}
    />
  );
}

export function StatusChip({ online }: { online: boolean }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<StatusDot online={online} />}
      label={online ? "Online" : "Offline"}
      sx={{
        borderColor: online ? statusColors.online : statusColors.offline,
        color: online ? statusColors.online : "text.secondary",
        pl: 0.5,
      }}
    />
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "primary.main",
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      sx={{
        flex: "1 1 190px",
        minWidth: 180,
        position: "relative",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        ...(onClick
          ? {
              "&:hover": {
                borderColor: accent,
                boxShadow: `0 0 0 1px ${accent}`,
              },
            }
          : {}),
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          borderLeft: "3px solid",
          borderColor: accent,
          pointerEvents: "none",
        }}
      />
      <CardContent sx={{ py: 2.25 }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          {icon ? <Box sx={{ color: accent, display: "flex" }}>{icon}</Box> : null}
        </Stack>
        <Typography variant="h4" sx={{ mt: 0.5, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PortChips({
  ports,
  labels,
  max = 6,
}: {
  ports: number[];
  labels: Record<string, string>;
  max?: number;
}) {
  if (!ports?.length) {
    return (
      <Typography variant="caption" color="text.secondary">
        none
      </Typography>
    );
  }
  const shown = ports.slice(0, max);
  const rest = ports.length - shown.length;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
      {shown.map((port) => (
        <Tooltip key={port} title={labels[String(port)] || `Port ${port}`}>
          <Chip size="small" label={port} sx={{ fontFamily: mono }} />
        </Tooltip>
      ))}
      {rest > 0 ? <Chip size="small" variant="outlined" label={`+${rest}`} /> : null}
    </Stack>
  );
}

export function relativeTime(value?: string | null) {
  if (!value) return "never";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return "unknown";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export const HISTORY_LABELS: Record<string, string> = {
  first_seen: "Discovered",
  status_change: "Status change",
  ip_changed: "IP changed",
  hostname_changed: "Hostname changed",
  vendor_changed: "Vendor changed",
  ports_changed: "Ports changed",
};

export function historyColor(event: string) {
  if (event === "first_seen") return statusColors.info;
  if (event === "status_change") return statusColors.alert;
  if (event === "ports_changed") return statusColors.danger;
  return statusColors.offline;
}

/**
 * Recomputes the Overview tab's summary stats from already-loaded devices,
 * scans and history, mirroring core/service.cjs's getDashboard(). Doing this
 * client-side (rather than a scoped API call) lets the same computation
 * respond instantly to the network filter without a round trip, and keeps
 * one code path regardless of whether a filter is active.
 */
export function buildDashboard(
  devices: DeviceRow[],
  scans: ScanRow[],
  history: HistoryRow[],
  networkCount: number,
): Dashboard {
  const lastScan = scans[0] ?? null;
  const online = devices.filter((d) => d.online);
  const vendorCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const device of devices) {
    const vendorKey = device.vendor || "Unknown";
    vendorCounts.set(vendorKey, (vendorCounts.get(vendorKey) ?? 0) + 1);
    const categoryKey = device.category || "uncategorized";
    categoryCounts.set(categoryKey, (categoryCounts.get(categoryKey) ?? 0) + 1);
  }
  return {
    totalDevices: devices.length,
    onlineDevices: online.length,
    offlineDevices: devices.length - online.length,
    newDevices: lastScan?.new_devices ?? 0,
    missingDevices: lastScan?.missing_devices ?? 0,
    networks: networkCount,
    lastScanAt: lastScan?.started_at ?? null,
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
}

export function deriveScanDeltas(history: HistoryRow[], latestScanId: string | null) {
  if (!latestScanId) return { newDeviceIds: [] as string[], missingDeviceIds: [] as string[] };
  const scanHistory = history.filter((entry) => entry.scan_id === latestScanId);
  return {
    newDeviceIds: scanHistory
      .filter((entry) => entry.event === "first_seen")
      .map((entry) => entry.device_id),
    missingDeviceIds: scanHistory
      .filter((entry) => entry.event === "status_change" && entry.detail === "No longer responding")
      .map((entry) => entry.device_id),
  };
}

/**
 * Tracks which credentials' secrets have been decrypted and revealed in the
 * current view. Callers must clear() when the vault locks so revealed
 * plaintext never survives a lock.
 */
export function useRevealedSecrets() {
  const [revealed, setRevealed] = useState<Record<string, CredentialSecret>>({});

  const reveal = async (id: string) => {
    const secret = await netscan.getCredentialSecret(id);
    setRevealed((prev) => ({ ...prev, [id]: secret }));
  };

  const hide = (id: string) => {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clear = () => setRevealed({});

  return { revealed, reveal, hide, clear };
}
