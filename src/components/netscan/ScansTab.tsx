import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import type { DeviceRow, HistoryRow, NetworkRow, ScanRow } from "@/lib/netscan-types";
import { statusColors } from "@/theme";
import { HISTORY_LABELS, Mono, historyColor, relativeTime } from "./shared";

type Props = {
  scans: ScanRow[];
  networks: NetworkRow[];
  history: HistoryRow[];
  devices: DeviceRow[];
  onSelectDevice: (deviceId: string) => void;
};

function duration(scan: ScanRow) {
  if (!scan.finished_at) return "running";
  const ms = new Date(scan.finished_at).getTime() - new Date(scan.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`;
}

export function ScansTab({ scans, networks, history, devices, onSelectDevice }: Props) {
  const nameFor = (id: string) => networks.find((n) => n.id === id)?.name ?? id;
  const deviceById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);

  return (
    <Stack direction={{ xs: "column", lg: "row" }} spacing={2.5}>
      <Card sx={{ flex: 2 }}>
        <CardContent>
          <Typography variant="h6">Scan history</Typography>
          <Typography variant="caption" color="text.secondary">
            Compare consecutive sweeps to spot new or vanished devices
          </Typography>
          <Table size="small" sx={{ mt: 1.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Network</TableCell>
                <TableCell align="right">Hosts</TableCell>
                <TableCell align="right">Found</TableCell>
                <TableCell align="right">New</TableCell>
                <TableCell align="right">Gone</TableCell>
                <TableCell align="right">Duration</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {scans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary">
                      No scans recorded yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                scans.map((scan) => (
                  <TableRow key={scan.id} hover>
                    <TableCell>{relativeTime(scan.started_at)}</TableCell>
                    <TableCell>{nameFor(scan.network_id)}</TableCell>
                    <TableCell align="right">
                      <Mono>{scan.hosts_scanned}</Mono>
                    </TableCell>
                    <TableCell align="right">
                      <Mono>{scan.devices_found}</Mono>
                    </TableCell>
                    <TableCell align="right" sx={{ color: statusColors.info }}>
                      {scan.new_devices ? `+${scan.new_devices}` : "0"}
                    </TableCell>
                    <TableCell align="right" sx={{ color: statusColors.alert }}>
                      {scan.missing_devices ? `-${scan.missing_devices}` : "0"}
                    </TableCell>
                    <TableCell align="right">{duration(scan)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={scan.status}
                        sx={{
                          color:
                            scan.status === "completed"
                              ? statusColors.online
                              : scan.status === "running"
                                ? statusColors.info
                                : statusColors.danger,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card sx={{ flex: 1 }}>
        <CardContent>
          <Typography variant="h6">Change timeline</Typography>
          <Typography variant="caption" color="text.secondary">
            Full audit trail across all devices
          </Typography>
          <Stack divider={<Divider flexItem />} sx={{ mt: 1.5, maxHeight: 520, overflowY: "auto" }}>
            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nothing recorded yet.
              </Typography>
            ) : (
              history.map((entry) => {
                const device = deviceById.get(entry.device_id);
                const deviceName = device?.label || device?.hostname || entry.device_id;
                return (
                  <Stack
                    key={entry.id}
                    direction="row"
                    spacing={1.5}
                    onClick={device ? () => onSelectDevice(device.id) : undefined}
                    sx={{
                      py: 1.1,
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
                        height: 24,
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
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ display: "block" }}
                      >
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
