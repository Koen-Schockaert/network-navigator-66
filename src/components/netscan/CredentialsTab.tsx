import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import KeyIcon from "@mui/icons-material/Key";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useEffect, useState } from "react";
import { buildCredentialUrl, protocolMeta } from "@/lib/credential-protocols";
import { netscan } from "@/lib/netscan-api";
import type { CredentialRow, DeviceRow, VaultStatus } from "@/lib/netscan-types";
import { CredentialFormDialog } from "./CredentialFormDialog";
import { Mono, relativeTime, useRevealedSecrets } from "./shared";

type Props = {
  credentials: CredentialRow[];
  devices: DeviceRow[];
  vaultStatus: VaultStatus;
  onRefresh: () => void;
};

export function CredentialsTab({ credentials, devices, vaultStatus, onRefresh }: Props) {
  const { revealed, reveal, hide, clear } = useRevealedSecrets();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<CredentialRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CredentialRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!vaultStatus.unlocked) clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultStatus.unlocked]);

  const deviceById = new Map(devices.map((device) => [device.id, device]));

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await netscan.deleteCredential(deleteTarget.id);
      setDeleteTarget(null);
      onRefresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  const columns: GridColDef<CredentialRow>[] = [
    { field: "label", headerName: "Label", flex: 1, minWidth: 160 },
    {
      field: "device_id",
      headerName: "Device",
      width: 180,
      valueGetter: (_value, row) => {
        const device = deviceById.get(row.device_id);
        return device ? device.label || device.hostname || device.ip : "Unknown device";
      },
    },
    {
      field: "protocol",
      headerName: "Protocol",
      width: 130,
      renderCell: (params) => {
        const meta = protocolMeta(params.row.protocol);
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
      field: "secret_type",
      headerName: "Auth",
      width: 90,
      renderCell: (params) =>
        params.row.secret_type === "ssh_key" ? (
          <Tooltip title="SSH key">
            <KeyIcon fontSize="small" color="action" />
          </Tooltip>
        ) : (
          <Tooltip title="Password">
            <LockIcon fontSize="small" color="action" />
          </Tooltip>
        ),
    },
    {
      field: "host_override",
      headerName: "Host",
      width: 150,
      valueGetter: (_value, row) => row.host_override || deviceById.get(row.device_id)?.ip || "—",
    },
    {
      field: "port",
      headerName: "Port",
      width: 90,
      valueGetter: (_value, row) => row.port ?? "—",
    },
    {
      field: "username",
      headerName: "Username",
      width: 140,
      valueGetter: (_value, row) => row.username ?? "—",
    },
    {
      field: "updated_at",
      headerName: "Updated",
      width: 110,
      valueGetter: (_value, row) => relativeTime(row.updated_at),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 180,
      sortable: false,
      renderCell: (params) => {
        const row = params.row;
        const device = deviceById.get(row.device_id);
        const host = row.host_override || device?.ip || null;
        const url = buildCredentialUrl(row.protocol, host, row.port);
        const secret = revealed[row.id];
        return (
          <Stack direction="row" spacing={0.25}>
            <Tooltip title={vaultStatus.unlocked ? "Reveal secret" : "Unlock the vault to reveal"}>
              <span>
                <IconButton
                  size="small"
                  disabled={!vaultStatus.unlocked}
                  onClick={() => (secret ? hide(row.id) : reveal(row.id))}
                >
                  {secret ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={url ? "Open in browser" : "Not available for this protocol"}>
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
              <IconButton size="small" onClick={() => setEditingCredential(row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => setDeleteTarget(row)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        );
      },
    },
  ];

  return (
    <Stack spacing={2}>
      <VaultBanner vaultStatus={vaultStatus} onRefresh={onRefresh} />

      {vaultStatus.unlocked ? (
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
            Add credential
          </Button>
        </Stack>
      ) : null}

      <Card sx={{ height: 560 }}>
        <DataGrid
          rows={credentials}
          columns={columns}
          density="comfortable"
          disableRowSelectionOnClick
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={{
            border: 0,
            "& .MuiDataGrid-columnHeaders": { fontSize: 12, letterSpacing: "0.04em" },
          }}
        />
      </Card>

      {Object.keys(revealed).length > 0 ? (
        <Stack spacing={1}>
          {Object.entries(revealed).map(([id, secret]) => {
            const row = credentials.find((c) => c.id === id);
            if (!row) return null;
            return (
              <Alert key={id} severity="info" onClose={() => hide(id)}>
                <Typography variant="body2">
                  <strong>{row.label}</strong>:{" "}
                  {secret.kind === "password" ? (
                    <Mono>{secret.password}</Mono>
                  ) : (
                    <>
                      <Mono>{secret.privateKey}</Mono>
                      {secret.passphrase ? (
                        <>
                          {" "}
                          (passphrase: <Mono>{secret.passphrase}</Mono>)
                        </>
                      ) : null}
                    </>
                  )}
                </Typography>
              </Alert>
            );
          })}
        </Stack>
      ) : null}

      <CredentialFormDialog
        open={formOpen || Boolean(editingCredential)}
        onClose={() => {
          setFormOpen(false);
          setEditingCredential(null);
        }}
        devices={devices}
        credential={editingCredential}
        vaultUnlocked={vaultStatus.unlocked}
        onSaved={onRefresh}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete credential</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete the login "{deleteTarget?.label}"? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={deleteBusy} onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function VaultBanner({
  vaultStatus,
  onRefresh,
}: {
  vaultStatus: VaultStatus;
  onRefresh: () => void;
}) {
  if (!vaultStatus.configured) return <SetupVaultCard onRefresh={onRefresh} />;
  if (!vaultStatus.unlocked) return <UnlockVaultCard onRefresh={onRefresh} />;
  return <UnlockedVaultToolbar onRefresh={onRefresh} />;
}

function SetupVaultCard({ onRefresh }: { onRefresh: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setup() {
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await netscan.setupVault(password);
      setPassword("");
      setConfirm("");
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set up the vault");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Set up your vault</Typography>
        <Typography variant="caption" color="text.secondary">
          Choose a master password to encrypt stored logins. This password is never stored — if you
          forget it, saved credentials cannot be recovered.
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mt: 2 }}>
          <TextField
            label="Master password"
            type="password"
            size="small"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            label="Confirm password"
            type="password"
            size="small"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            sx={{ minWidth: 220 }}
          />
          <Button variant="contained" disabled={!password || !confirm || busy} onClick={setup}>
            Set up vault
          </Button>
        </Stack>
        {error ? (
          <Alert severity="info" sx={{ mt: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UnlockVaultCard({ onRefresh }: { onRefresh: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      await netscan.unlockVault(password);
      setPassword("");
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unlock the vault");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Unlock vault</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mt: 2 }}>
          <TextField
            label="Master password"
            type="password"
            size="small"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && unlock()}
            sx={{ minWidth: 220 }}
          />
          <Button
            variant="contained"
            startIcon={<LockOpenIcon />}
            disabled={!password || busy}
            onClick={unlock}
          >
            Unlock
          </Button>
        </Stack>
        {error ? (
          <Alert severity="info" sx={{ mt: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UnlockedVaultToolbar({ onRefresh }: { onRefresh: () => void }) {
  const [changeOpen, setChangeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  async function lock() {
    await netscan.lockVault();
    onRefresh();
  }

  return (
    <>
      <Card>
        <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Chip
              size="small"
              icon={<LockOpenIcon fontSize="small" />}
              label="Vault unlocked"
              color="success"
              variant="outlined"
            />
            <Box sx={{ flex: 1 }} />
            <Button size="small" startIcon={<LockIcon />} onClick={lock}>
              Lock vault
            </Button>
            <Button size="small" onClick={() => setChangeOpen(true)}>
              Change master password
            </Button>
            <Button size="small" color="error" onClick={() => setResetOpen(true)}>
              Reset vault
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <ChangePasswordDialog
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        onRefresh={onRefresh}
      />
      <ResetVaultDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onRefresh={onRefresh}
      />
    </>
  );
}

function ChangePasswordDialog({
  open,
  onClose,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (newPassword !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await netscan.changeMasterPassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
      onRefresh();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the master password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change master password</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField
            label="Current password"
            type="password"
            size="small"
            fullWidth
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            size="small"
            fullWidth
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <TextField
            label="Confirm new password"
            type="password"
            size="small"
            fullWidth
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {error ? (
            <Alert severity="info" onClose={() => setError(null)}>
              {error}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!oldPassword || !newPassword || busy}
          onClick={submit}
        >
          Change password
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const RESET_CONFIRMATION = "RESET";

function ResetVaultDialog({
  open,
  onClose,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await netscan.resetVault();
      setConfirmText("");
      onRefresh();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset the vault");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reset vault</DialogTitle>
      <DialogContent>
        <Alert severity="error" sx={{ mb: 2 }}>
          This permanently deletes every saved credential and the master password. This cannot be
          undone.
        </Alert>
        <TextField
          label={`Type ${RESET_CONFIRMATION} to confirm`}
          size="small"
          fullWidth
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
        />
        {error ? (
          <Alert severity="info" sx={{ mt: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={confirmText !== RESET_CONFIRMATION || busy}
          onClick={submit}
        >
          Reset vault
        </Button>
      </DialogActions>
    </Dialog>
  );
}
