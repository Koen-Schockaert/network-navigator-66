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
import type { Dashboard } from "@/lib/netscan-types";
import { statusColors } from "@/theme";
import { HISTORY_LABELS, Mono, StatCard, historyColor, relativeTime } from "./shared";

export function DashboardTab({ data }: { data: Dashboard | null }) {
  if (!data) return <LinearProgress />;

  const maxVendor = Math.max(1, ...data.vendors.map((v) => v.count));

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <StatCard
          label="Devices"
          value={data.totalDevices}
          hint={`across ${data.networks} network${data.networks === 1 ? "" : "s"}`}
          icon={<DevicesIcon fontSize="small" />}
        />
        <StatCard
          label="Online"
          value={data.onlineDevices}
          hint={`last scan ${relativeTime(data.lastScanAt)}`}
          accent={statusColors.online}
          icon={<WifiTetheringIcon fontSize="small" />}
        />
        <StatCard
          label="Offline"
          value={data.offlineDevices}
          hint="seen before, quiet now"
          accent={statusColors.offline}
          icon={<SignalWifiOffIcon fontSize="small" />}
        />
        <StatCard
          label="New"
          value={data.newDevices}
          hint="first seen in last scan"
          accent={statusColors.info}
          icon={<FiberNewIcon fontSize="small" />}
        />
        <StatCard
          label="Disappeared"
          value={data.missingDevices}
          hint="missing since last scan"
          accent={statusColors.alert}
          icon={<LanIcon fontSize="small" />}
        />
      </Stack>

      <Stack direction={{ xs: "column", lg: "row" }} spacing={2.5} sx={{ alignItems: "stretch" }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="h6">Vendor breakdown</Typography>
            <Typography variant="caption" color="text.secondary">
              Derived from MAC address OUI prefixes
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {data.vendors.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No devices yet — run a scan to populate this view.
                </Typography>
              ) : (
                data.vendors.map((vendor) => (
                  <Box key={vendor.vendor}>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: "space-between", mb: 0.5 }}
                    >
                      <Typography variant="body2">{vendor.vendor}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {vendor.count}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={(vendor.count / maxVendor) * 100}
                    />
                  </Box>
                ))
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
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
                data.recentHistory.map((entry) => (
                  <Stack
                    key={entry.id}
                    direction="row"
                    spacing={1.5}
                    sx={{ py: 1.25, alignItems: "center" }}
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
                        {HISTORY_LABELS[entry.event] || entry.event}
                        {" — "}
                        <Mono>{entry.detail}</Mono>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {relativeTime(entry.created_at)}
                      </Typography>
                    </Box>
                  </Stack>
                ))
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}
