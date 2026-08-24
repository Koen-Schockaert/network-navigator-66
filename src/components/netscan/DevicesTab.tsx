import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useMemo, useState } from "react";
import type { DeviceRow, HistoryRow, Info, NetworkRow } from "@/lib/netscan-types";
import { mono } from "@/theme";
import {
  HISTORY_LABELS,
  Mono,
  PortChips,
  StatusChip,
  historyColor,
  relativeTime,
} from "./shared";

type Props = {
  devices: DeviceRow[];
  networks: NetworkRow[];
  history: HistoryRow[];
  info: Info | null;
  networkFilter: string;
  onNetworkFilter: (value: string) => void;
};

export function DevicesTab({
  devices,
  networks,
  history,
  info,
  networkFilter,
  onNetworkFilter,
}: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "online" | "offline">("all");
  const [selected, setSelected] = useState<DeviceRow | null>(null);
  const labels = info?.portLabels ?? {};

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return devices.filter((device) => {
      if (status === "online" && !device.online) return false;
      if (status === "offline" && device.online) return false;
      if (!needle) return true;
      return [device.ip, device.hostname, device.mac, device.vendor, device.notes]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [devices, search, status]);

  const columns: GridColDef<DeviceRow>[] = [
    {
      field: "online",
      headerName: "Status",
      width: 120,
      renderCell: (params) => <StatusChip online={Boolean(params.value)} />,
      sortable: true,
    },
    {
      field: "ip",
      headerName: "IP address",
      width: 140,
      renderCell: (params) => <Mono>{params.value as string}</Mono>,
    },
    {
      field: "hostname",
      headerName: "Hostname",
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => row.hostname ?? "—",
    },
    {
      field: "mac",
      headerName: "MAC",
      width: 170,
      renderCell: (params) => <Mono>{(params.value as string) || "—"}</Mono>,
    },
    {
      field: "vendor",
      headerName: "Vendor",
      width: 150,
      valueGetter: (_value, row) => row.vendor ?? "Unknown",
    },
    {
      field: "open_ports",
      headerName: "Open ports",
      flex: 1,
      minWidth: 200,
      sortable: false,
      renderCell: (params) => (
        <PortChips ports={(params.value as number[]) ?? []} labels={labels} max={4} />
      ),
    },
    {
      field: "response_time",
      headerName: "Latency",
      width: 110,
      valueGetter: (_value, row) =>
        row.response_time === null ? "—" : `${row.response_time} ms`,
    },
    {
      field: "last_seen",
      headerName: "Last seen",
      width: 130,
      valueGetter: (_value, row) => relativeTime(row.last_seen),
    },
  ];

  const deviceHistory = selected
    ? history.filter((entry) => entry.device_id === selected.id)
    : [];

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{ alignItems: { md: "center" } }}
      >
        <TextField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search IP, hostname, MAC or vendor"
          sx={{ minWidth: 300, flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          label="Network"
          value={networkFilter}
          onChange={(event) => onNetworkFilter(event.target.value)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">All networks</MenuItem>
          {networks.map((network) => (
            <MenuItem key={network.id} value={network.id}>
              {network.name}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={status}
          onChange={(_event, value) => value && setStatus(value)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="online">Online</ToggleButton>
          <ToggleButton value="offline">Offline</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Card sx={{ height: 620 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          density="comfortable"
          disableRowSelectionOnClick
          onRowClick={(params) => setSelected(params.row as DeviceRow)}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={{
            border: 0,
            "& .MuiDataGrid-columnHeaders": { fontSize: 12, letterSpacing: "0.04em" },
            "& .MuiDataGrid-row": { cursor: "pointer" },
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": {
              outline: "none",
            },
          }}
        />
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        maxWidth="sm"
        fullWidth
      >
        {selected ? (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Box sx={{ fontFamily: mono }}>{selected.ip}</Box>
                <StatusChip online={selected.online} />
                <IconButton
                  size="small"
                  onClick={() => navigator.clipboard?.writeText(selected.ip)}
                  aria-label="Copy IP address"
                >
                  <ContentCopyIcon fontSize="inherit" />
                </IconButton>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {selected.hostname || "no hostname resolved"}
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1.25}>
                <Row label="Vendor" value={selected.vendor || "Unknown"} />
                <Row label="MAC address" value={selected.mac || "not available"} mono />
                <Row
                  label="Latency"
                  value={selected.response_time === null ? "—" : `${selected.response_time} ms`}
                />
                <Row label="First seen" value={relativeTime(selected.first_seen)} />
                <Row label="Last seen" value={relativeTime(selected.last_seen)} />
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Open ports
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <PortChips ports={selected.open_ports} labels={labels} max={20} />
                  </Box>
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary">
                Change history
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {deviceHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No changes recorded for this device yet.
                  </Typography>
                ) : (
                  deviceHistory.map((entry) => (
                    <Stack
                      key={entry.id}
                      direction="row"
                      spacing={1.25}
                      sx={{ alignItems: "center" }}
                    >
                      <Box
                        sx={{
                          width: 6,
                          height: 22,
                          borderRadius: 1,
                          backgroundColor: historyColor(entry.event),
                        }}
                      />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {HISTORY_LABELS[entry.event] || entry.event}: {entry.detail}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {relativeTime(entry.created_at)}
                      </Typography>
                    </Stack>
                  ))
                )}
              </Stack>
              <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 2 }}>
                <Button onClick={() => setSelected(null)}>Close</Button>
              </Stack>
            </DialogContent>
          </>
        ) : null}
      </Dialog>
    </Stack>
  );
}

function Row({
  label,
  value,
  mono: isMono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      {isMono ? (
        <Mono>{value}</Mono>
      ) : (
        <Typography variant="body2">{value}</Typography>
      )}
    </Stack>
  );
}
