import DevicesIcon from "@mui/icons-material/DevicesOther";
import FiberNewIcon from "@mui/icons-material/FiberNew";
import LanIcon from "@mui/icons-material/Lan";
import SignalWifiOffIcon from "@mui/icons-material/SignalWifiOff";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { categoryMeta } from "@/lib/device-categories";
import type { Dashboard, DeviceRow } from "@/lib/netscan-types";
import { statusColors } from "@/theme";
import { HISTORY_LABELS, Mono, StatCard, historyColor, relativeTime } from "./shared";

type DeviceFilter = {
  status?: "all" | "online" | "offline";
  category?: string | null;
  deviceIds?: string[] | null;
};

type Props = {
  data: Dashboard | null;
  devices: DeviceRow[];
  newDeviceIds: string[];
  missingDeviceIds: string[];
  onFilterDevices: (filter: DeviceFilter) => void;
  onSelectDevice: (deviceId: string) => void;
};

export function DashboardTab({
  data,
  devices,
  newDeviceIds,
  missingDeviceIds,
  onFilterDevices,
  onSelectDevice,
}: Props) {
  const deviceById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);

  if (!data) return <LinearProgress />;

  const maxCategory = Math.max(1, ...data.categories.map((c) => c.count));

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <StatCard
          label="Devices"
          value={data.totalDevices}
          hint={`across ${data.networks} network${data.networks === 1 ? "" : "s"}`}
          icon={<DevicesIcon fontSize="small" />}
          onClick={() => onFilterDevices({})}
        />
        <StatCard
          label="Online"
          value={data.onlineDevices}
          hint={`last scan ${relativeTime(data.lastScanAt)}`}
          accent={statusColors.online}
          icon={<WifiTetheringIcon fontSize="small" />}
          onClick={() => onFilterDevices({ status: "online" })}
        />
        <StatCard
          label="Offline"
          value={data.offlineDevices}
          hint="seen before, quiet now"
          accent={statusColors.offline}
          icon={<SignalWifiOffIcon fontSize="small" />}
          onClick={() => onFilterDevices({ status: "offline" })}
        />
        <StatCard
          label="New"
          value={data.newDevices}
          hint="first seen in last scan"
          accent={statusColors.info}
          icon={<FiberNewIcon fontSize="small" />}
          onClick={() => onFilterDevices({ deviceIds: newDeviceIds })}
        />
        <StatCard
          label="Disappeared"
          value={data.missingDevices}
          hint="missing since last scan"
          accent={statusColors.alert}
          icon={<LanIcon fontSize="small" />}
          onClick={() => onFilterDevices({ deviceIds: missingDeviceIds })}
        />
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="h6">Devices by category</Typography>
          <Typography variant="caption" color="text.secondary">
            Auto-guessed from vendor and hostname on first scan; edit any device to correct it
          </Typography>
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap", mt: 2 }}>
            {data.categories.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No devices yet — run a scan to populate this view.
              </Typography>
            ) : (
              data.categories.map((entry) => {
                const meta = categoryMeta(entry.category);
                const Icon = meta.icon;
                return (
                  <Box
                    key={entry.category}
                    onClick={() => onFilterDevices({ category: entry.category })}
                    sx={{
                      minWidth: 170,
                      flex: "1 1 170px",
                      cursor: "pointer",
                      borderRadius: 1,
                      p: 0.5,
                      m: -0.5,
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                      <Icon fontSize="small" color="action" />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {meta.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {entry.count}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={(entry.count / maxCategory) * 100}
                    />
                  </Box>
                );
              })
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Recent changes</Typography>
          <Typography variant="caption" color="text.secondary">
            Every difference detected between scans
          </Typography>
          <Stack
            spacing={0}
            divider={<Divider flexItem />}
            sx={{ mt: 2, maxHeight: 320, overflowY: "auto" }}
          >
            {data.recentHistory.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nothing recorded yet.
              </Typography>
            ) : (
              data.recentHistory.map((entry) => {
                const device = deviceById.get(entry.device_id);
                const deviceName = device?.label || device?.hostname || entry.device_id;
                return (
                  <Stack
                    key={entry.id}
                    direction="row"
                    spacing={1.5}
                    onClick={device ? () => onSelectDevice(device.id) : undefined}
                    sx={{
                      py: 1.25,
                      alignItems: "center",
                      cursor: device ? "pointer" : "default",
                      borderRadius: 1,
                      px: 0.5,
                      mx: -0.5,
                      "&:hover": device ? { backgroundColor: "action.hover" } : undefined,
                    }}
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 26,
                        borderRadius: 1,
                        backgroundColor: historyColor(entry.event),
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" noWrap>
                        <strong>{deviceName}</strong>
                        {" — "}
                        {HISTORY_LABELS[entry.event] || entry.event}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        <Mono>{entry.detail}</Mono> · {relativeTime(entry.created_at)}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
