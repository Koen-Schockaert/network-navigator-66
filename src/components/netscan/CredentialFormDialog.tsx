import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { CREDENTIAL_PROTOCOLS, protocolMeta } from "@/lib/credential-protocols";
import { netscan } from "@/lib/netscan-api";
import type {
  CredentialInput,
  CredentialPatch,
  CredentialProtocol,
  CredentialRow,
  CredentialSecretKind,
  DeviceRow,
} from "@/lib/netscan-types";
import { mono } from "@/theme";

type Props = {
  open: boolean;
  onClose: () => void;
  devices: DeviceRow[];
  deviceId?: string;
  credential?: CredentialRow | null;
  vaultUnlocked: boolean;
  onSaved: () => void;
};

export function CredentialFormDialog({
  open,
  onClose,
  devices,
  deviceId,
  credential,
  vaultUnlocked,
  onSaved,
}: Props) {
  const editing = Boolean(credential);
  const firstDevice = devices[0];

  const [selectedDeviceId, setSelectedDeviceId] = useState(deviceId ?? firstDevice?.id ?? "");
  const [label, setLabel] = useState("");
  const [protocol, setProtocol] = useState<CredentialProtocol>("http");
  const [portTouched, setPortTouched] = useState(false);
  const [hostOverride, setHostOverride] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<CredentialSecretKind>("password");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [secretLoading, setSecretLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowPassword(false);
    setPortTouched(Boolean(credential));

    if (credential) {
      setSelectedDeviceId(credential.device_id);
      setLabel(credential.label);
      setProtocol(credential.protocol);
      setHostOverride(credential.host_override ?? "");
      setPort(credential.port !== null ? String(credential.port) : "");
      setUsername(credential.username ?? "");
      setAuthType(credential.secret_type);
      setPassword("");
      setPrivateKey("");
      setPassphrase("");
      setPublicKey("");

      if (vaultUnlocked) {
        setSecretLoading(true);
        netscan
          .getCredentialSecret(credential.id)
          .then((secret) => {
            setAuthType(secret.kind);
            if (secret.kind === "ssh_key") {
              setPrivateKey(secret.privateKey);
              setPassphrase(secret.passphrase);
              setPublicKey(secret.publicKey ?? "");
            } else {
              setPassword(secret.password);
            }
          })
          .catch((cause) => {
            setError(cause instanceof Error ? cause.message : "Could not load the saved secret");
          })
          .finally(() => setSecretLoading(false));
      }
    } else {
      setSelectedDeviceId(deviceId ?? firstDevice?.id ?? "");
      setLabel("");
      setProtocol("http");
      setHostOverride("");
      setPort("");
      setUsername("");
      setAuthType("password");
      setPassword("");
      setPrivateKey("");
      setPassphrase("");
      setPublicKey("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, credential]);

  function selectProtocol(value: CredentialProtocol) {
    setProtocol(value);
    const meta = protocolMeta(value);
    if (meta.suggestsKeyAuth) setAuthType("ssh_key");
    if (!portTouched && meta.defaultPort) setPort(String(meta.defaultPort));
  }

  async function handleSubmit() {
    if (!selectedDeviceId) {
      setError("Choose a device");
      return;
    }
    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const portNumber = port.trim() ? Number(port.trim()) : null;
      const secretFields =
        authType === "ssh_key"
          ? {
              secret_type: "ssh_key" as const,
              privateKey,
              passphrase,
              publicKey: publicKey || null,
            }
          : { secret_type: "password" as const, password };

      if (editing && credential) {
        const patch: CredentialPatch = {
          label: label.trim(),
          protocol,
          host_override: hostOverride.trim() || null,
          port: portNumber,
          username: username.trim() || null,
          ...secretFields,
        };
        await netscan.updateCredential(credential.id, patch);
      } else {
        const input: CredentialInput = {
          device_id: selectedDeviceId,
          label: label.trim(),
          protocol,
          host_override: hostOverride.trim() || null,
          port: portNumber,
          username: username.trim() || null,
          ...secretFields,
        };
        await netscan.createCredential(input);
      }
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the credential");
    } finally {
      setBusy(false);
    }
  }

  const secretDisabled = !vaultUnlocked || secretLoading;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? "Edit credential" : "Add credential"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {!deviceId ? (
            <TextField
              select
              label="Device"
              size="small"
              fullWidth
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              disabled={editing}
            >
              {devices.map((device) => (
                <MenuItem key={device.id} value={device.id}>
                  {device.label || device.hostname || device.ip}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          <TextField
            label="Label"
            placeholder="e.g. Router admin"
            size="small"
            fullWidth
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />

          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Protocol"
              size="small"
              sx={{ flex: 1 }}
              value={protocol}
              onChange={(event) => selectProtocol(event.target.value as CredentialProtocol)}
            >
              {CREDENTIAL_PROTOCOLS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Port"
              size="small"
              type="number"
              sx={{ width: 120 }}
              value={port}
              onChange={(event) => {
                setPortTouched(true);
                setPort(event.target.value);
              }}
            />
          </Stack>

          <TextField
            label="Host override"
            placeholder="defaults to the device's IP"
            helperText="Leave blank to use the device's IP address"
            size="small"
            fullWidth
            value={hostOverride}
            onChange={(event) => setHostOverride(event.target.value)}
          />

          <TextField
            label="Username"
            size="small"
            fullWidth
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <ToggleButtonGroup
            exclusive
            size="small"
            value={authType}
            onChange={(_event, value: CredentialSecretKind | null) => value && setAuthType(value)}
            disabled={secretDisabled}
          >
            <ToggleButton value="password">Password</ToggleButton>
            <ToggleButton value="ssh_key">SSH key</ToggleButton>
          </ToggleButtonGroup>

          {!vaultUnlocked ? (
            <Typography variant="caption" color="text.secondary">
              Unlock the vault to view or change the secret. Other fields can still be edited.
            </Typography>
          ) : null}

          {authType === "password" ? (
            <TextField
              label="Password"
              size="small"
              fullWidth
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={secretDisabled}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          ) : (
            <>
              <TextField
                label="Private key"
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                size="small"
                fullWidth
                multiline
                minRows={3}
                value={privateKey}
                onChange={(event) => setPrivateKey(event.target.value)}
                disabled={secretDisabled}
                sx={{ "& textarea": { fontFamily: mono, fontSize: 12 } }}
              />
              <TextField
                label="Passphrase (optional)"
                size="small"
                fullWidth
                type={showPassword ? "text" : "password"}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                disabled={secretDisabled}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? "Hide passphrase" : "Show passphrase"}
                        >
                          {showPassword ? (
                            <VisibilityOffIcon fontSize="small" />
                          ) : (
                            <VisibilityIcon fontSize="small" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                label="Public key (optional)"
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={publicKey}
                onChange={(event) => setPublicKey(event.target.value)}
                disabled={secretDisabled}
                sx={{ "& textarea": { fontFamily: mono, fontSize: 12 } }}
              />
            </>
          )}

          {error ? (
            <Alert severity="info" onClose={() => setError(null)}>
              {error}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={busy}>
          {editing ? "Save" : "Add credential"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
