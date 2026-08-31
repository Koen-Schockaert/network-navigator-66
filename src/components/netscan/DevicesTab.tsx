import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import KeyIcon from "@mui/icons-material/Key";
import LockIcon from "@mui/icons-material/Lock";
import NetworkPingIcon from "@mui/icons-material/NetworkPing";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useEffect, useMemo, useState } from "react";
import { buildCredentialUrl, protocolMeta } from "@/lib/credential-protocols";
import { DEVICE_CATEGORIES, categoryMeta } from "@/lib/device-categories";
import { netscan } from "@/lib/netscan-api";
import type {
  CredentialRow,
  DeviceRow,
  HistoryRow,
  Info,
  NetworkRow,
  VaultStatus,
} from "@/lib/netscan-types";
import { mono } from "@/theme";
import { CredentialFormDialog } from "./CredentialFormDialog";
import { PingDialog } from "./PingDialog";
import {
  HISTORY_LABELS,
  Mono,
  PortChips,
  StatusChip,
  historyColor,
  relativeTime,
  useRevealedSecrets,
} from "./shared";

type Props = {
  devices: DeviceRow[];
  allDevices: DeviceRow[];
  networks: NetworkRow[];
  history: HistoryRow[];
  credentials: CredentialRow[];
  vaultStatus: VaultStatus;
  info: Info | null;
  networkFilter: string;
  onNetworkFilter: (value: string) => void;
  status: "all" | "online" | "offline";
  onStatusChange: (value: "all" | "online" | "offline") => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  deviceIdFilter: string[] | null;
  onClearDeviceIdFilter: () => void;
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  onRefresh: () => void;
};

export function DevicesTab({
  devices,
  allDevices,
  networks,
  history,
  credentials,
  vaultStatus,
  info,
  networkFilter,
  onNetworkFilter,
  status,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  deviceIdFilter,
  onClearDeviceIdFilter,
  selectedDeviceId,
  onSelectDevice,
  onRefresh,
}: Props) {
  const [search, setSearch] = useState("");
  const selected = useMemo(
    () => allDevices.find((device) => device.id === selectedDeviceId) ?? null,
    [allDevices, selectedDeviceId],
  );
  const labels = useMemo(() => info?.portLabels ?? {}, [info?.portLabels]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return devices.filter((device) => {
      if (status === "online" && !device.online) return false;
      if (status === "offline" && device.online) return false;
      if (categoryFilter && (device.category || "uncategorized") !== categoryFilter) return false;
      if (deviceIdFilter && !deviceIdFilter.includes(device.id)) return false;
      if (!needle) return true;
      return [device.ip, device.hostname, device.mac, device.vendor, device.notes, device.label]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [devices, search, status, categoryFilter, deviceIdFilter]);

  const columns: GridColDef<DeviceRow>[] = useMemo(
    () => [
      {
        field: "online",
        headerName: "Status",
        width: 120,
        renderCell: (params) => <StatusChip online={Boolean(params.value)} />,
        sortable: true,
      },
      {
        field: "label",
        headerName: "Label",
        width: 150,
        valueGetter: (_value, row) => row.label ?? "—",
      },
      {
        field: "category",
        headerName: "Category",
        width: 170,
        valueGetter: (_value, row) => categoryMeta(row.category).label,
        renderCell: (params) => {
          const meta = categoryMeta((params.row as DeviceRow).category);
          const Icon = meta.icon;
          return (
            <Chip
              size="small"
              variant="outlined"
              icon={<Icon fontSize="small" />}
              label={meta.label}
            />
          );
        },
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
    ],
    [labels],
  );

  const deviceHistory = selected ? history.filter((entry) => entry.device_id === selected.id) : [];
  const deviceCredentials = selected
    ? credentials.filter((credential) => credential.device_id === selected.id)
    : [];

  const { revealed, reveal, hide, clear } = useRevealedSecrets();
  const [pingOpen, setPingOpen] = useState(false);
  const closeDeviceDialog = () => {
    setPingOpen(false);
    onSelectDevice(null);
  };
  const [credentialFormOpen, setCredentialFormOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<CredentialRow | null>(null);
  const [deleteCredentialTarget, setDeleteCredentialTarget] = useState<CredentialRow | null>(null);

  useEffect(() => {
    if (!vaultStatus.unlocked) clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultStatus.unlocked]);

  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function deleteCredential() {
    if (!deleteCredentialTarget) return;
    await netscan.deleteCredential(deleteCredentialTarget.id);
    setDeleteCredentialTarget(null);
    onRefresh();
  }

  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);
  useEffect(() => {
    setLabelDraft(selected?.label ?? "");
  }, [selected]);

  const saveLabel = async () => {
    if (!selected) return;
    const value = labelDraft.trim() || null;
    if (value === selected.label) return;
    setSavingLabel(true);
    try {
      await netscan.updateDevice(selected.id, { label: value });
      onRefresh();
    } finally {
      setSavingLabel(false);
    }
  };

  const [savingCategory, setSavingCategory] = useState(false);
  const saveCategory = async (value: string) => {
    if (!selected) return;
    const category = value || null;
    if (category === selected.category) return;
    setSavingCategory(true);
    try {
      await netscan.updateDevice(selected.id, { category });
      onRefresh();
    } finally {
      setSavingCategory(false);
    }
  };

  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => {
    setNotesDraft(selected?.notes ?? "");
  }, [selected]);

  const saveNotes = async () => {
    if (!selected) return;
    const value = notesDraft.trim() || null;
    if (value === selected.notes) return;
    setSavingNotes(true);
    try {
      await netscan.updateDevice(selected.id, { notes: value });
      onRefresh();
    } finally {
      setSavingNotes(false);
    }
  };

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
        <TextField
          select
          label="Category"
          value={categoryFilter}
          onChange={(event) => onCategoryChange(event.target.value)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">All categories</MenuItem>
          {DEVICE_CATEGORIES.map((category) => (
            <MenuItem key={category.value} value={category.value}>
              {category.label}
            </MenuItem>
          ))}
          <MenuItem value="uncategorized">Uncategorized</MenuItem>
        </TextField>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={status}
          onChange={(_event, value) => value && onStatusChange(value)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="online">Online</ToggleButton>
          <ToggleButton value="offline">Offline</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {deviceIdFilter ? (
        <Chip
          size="small"
          variant="outlined"
          label={`Filtered from overview · ${deviceIdFilter.length} device${deviceIdFilter.length === 1 ? "" : "s"}`}
          onDelete={onClearDeviceIdFilter}
          deleteIcon={<CloseIcon fontSize="small" />}
          sx={{ alignSelf: "flex-start" }}
        />
      ) : null}

      <Card sx={{ height: 620 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          density="comfortable"
          disableRowSelectionOnClick
          onRowClick={(params) => onSelectDevice((params.row as DeviceRow).id)}
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

      <Dialog open={Boolean(selected)} onClose={() => closeDeviceDialog()} maxWidth="sm" fullWidth>
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
                <Tooltip title="Ping this device">
                  <IconButton
                    size="small"
                    onClick={() => setPingOpen(true)}
                    aria-label="Ping device"
                  >
                    <NetworkPingIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {selected.hostname || "no hostname resolved"}
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1.25}>
                <TextField
                  label="Label"
                  placeholder="e.g. Living room TV"
                  size="small"
                  fullWidth
                  value={labelDraft}
                  onChange={(event) => setLabelDraft(event.target.value)}
                  onBlur={saveLabel}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                  disabled={savingLabel}
                />
                <TextField
                  select
                  label="Category"
                  size="small"
                  fullWidth
                  value={selected.category ?? ""}
                  onChange={(event) => saveCategory(event.target.value)}
                  disabled={savingCategory}
                >
                  <MenuItem value="">Uncategorized</MenuItem>
                  {DEVICE_CATEGORIES.map((category) => (
                    <MenuItem key={category.value} value={category.value}>
                      {category.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Notes"
                  placeholder="Anything worth remembering about this device"
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  onBlur={saveNotes}
                  disabled={savingNotes}
                />
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

              <Divider sx={{ my: 2 }} />
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="overline" color="text.secondary">
                  Logins
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  disabled={!vaultStatus.unlocked}
                  onClick={() => setCredentialFormOpen(true)}
                >
                  Add credential
                </Button>
              </Stack>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {deviceCredentials.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {vaultStatus.unlocked
                      ? "No logins saved for this device yet."
                      : "No logins saved for this device yet. Unlock the vault on the Credentials tab to add one."}
                  </Typography>
                ) : (
                  deviceCredentials.map((credential) => {
                    const meta = protocolMeta(credential.protocol);
                    const Icon = meta.icon;
                    const host = credential.host_override || selected.ip;
                    const url = buildCredentialUrl(credential.protocol, host, credential.port);
                    const secret = revealed[credential.id];
                    return (
                      <Stack
                        key={credential.id}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center" }}
                      >
                        <Icon fontSize="small" color="action" />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {credential.label}
                            {credential.username ? ` · ${credential.username}` : ""}
                          </Typography>
                          {secret ? (
                            <Typography variant="caption" color="text.secondary">
                              {secret.kind === "password" ? (
                                <Mono>{secret.password}</Mono>
                              ) : (
                                <Mono>{secret.privateKey.slice(0, 40)}…</Mono>
                              )}
                            </Typography>
                          ) : null}
                        </Box>
                        {credential.secret_type === "ssh_key" ? (
                          <KeyIcon fontSize="inherit" color="disabled" />
                        ) : (
                          <LockIcon fontSize="inherit" color="disabled" />
                        )}
                        <Tooltip
                          title={
                            vaultStatus.unlocked ? "Reveal secret" : "Unlock the vault to reveal"
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              disabled={!vaultStatus.unlocked}
                              onClick={() => (secret ? hide(credential.id) : reveal(credential.id))}
                            >
                              {secret ? (
                                <VisibilityOffIcon fontSize="small" />
                              ) : (
                                <VisibilityIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip
                          title={url ? "Open in browser" : "Not available for this protocol"}
                        >
                          <span>
                            <IconButton
                              size="small"
                              disabled={!url}
                              onClick={() => url && window.open(url, "_blank", "noopener")}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => setEditingCredential(credential)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteCredentialTarget(credential)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    );
                  })
                )}
              </Stack>

              <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 2 }}>
                <Button onClick={() => closeDeviceDialog()}>Close</Button>
              </Stack>
            </DialogContent>
          </>
        ) : null}
      </Dialog>

      <PingDialog open={pingOpen} device={selected} onClose={() => setPingOpen(false)} />

      {selected ? (
        <CredentialFormDialog
          open={credentialFormOpen || Boolean(editingCredential)}
          onClose={() => {
            setCredentialFormOpen(false);
            setEditingCredential(null);
          }}
          devices={devices}
          deviceId={selected.id}
          credential={editingCredential}
          vaultUnlocked={vaultStatus.unlocked}
          onSaved={onRefresh}
        />
      ) : null}

      <Dialog
        open={Boolean(deleteCredentialTarget)}
        onClose={() => setDeleteCredentialTarget(null)}
      >
        <DialogTitle>Delete credential</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete the login "{deleteCredentialTarget?.label}"? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteCredentialTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteCredential}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function Row({ label, value, mono: isMono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      {isMono ? <Mono>{value}</Mono> : <Typography variant="body2">{value}</Typography>}
    </Stack>
  );
}
