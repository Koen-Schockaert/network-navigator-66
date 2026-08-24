import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
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
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <Card sx={{ flex: "1 1 190px", minWidth: 180, position: "relative", overflow: "hidden" }}>
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
