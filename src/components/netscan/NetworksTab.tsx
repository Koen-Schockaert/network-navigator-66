import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RadarIcon from "@mui/icons-material/Radar";
import SyncIcon from "@mui/icons-material/Sync";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { netscan } from "@/lib/netscan-api";
import type { Info, NetworkRow, OuiStatus, ScanProfile } from "@/lib/netscan-types";
import { statusColors } from "@/theme";
import { Mono, relativeTime } from "./shared";

type Props = {
  networks: NetworkRow[];
  info: Info | null;
  scanning: boolean;
  onRefresh: () => void;
  onScan: (networkId: string, profile: ScanProfile) => void;
};

const PROFILE_STORAGE_KEY = "netscan_scan_profile";

const PROFILE_DETAILS: Record<ScanProfile, { label: string; description: string }> = {
  quick: { label: "Quick", description: "Ping sweep only — no port scan. Fastest." },
  standard: { label: "Standard", description: "Ping plus the default ~30-port list." },
  deep: { label: "Deep", description: "Ping plus an extended ~130-port list. Slowest." },
};

function readStoredProfile(fallback: ScanProfile): ScanProfile {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  return stored === "quick" || stored === "standard" || stored === "deep" ? stored : fallback;
}

function VendorDatabaseCard() {
  const [status, setStatus] = useState<OuiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    netscan
      .getOuiStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await netscan.refreshOuiDatabase());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the vendor database");
    } finally {
      setBusy(false);
    }
  }

  const totalKnown = (status?.builtinEntries ?? 0) + (status?.downloadedEntries ?? 0);

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography variant="h6">Vendor database</Typography>
            <Typography variant="caption" color="text.secondary">
              {status?.downloadedEntries
                ? `${totalKnown.toLocaleString()} known MAC prefixes · full IEEE snapshot from ${relativeTime(status.updatedAt)}`
                : `${totalKnown.toLocaleString()} known MAC prefixes (built-in list only) — refresh to pull the full IEEE registry`}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={busy ? <CircularProgress size={16} /> : <SyncIcon />}
            disabled={busy}
            onClick={refresh}
          >
            {busy ? "Refreshing…" : "Refresh now"}
          </Button>
        </Stack>
        {error ? (
          <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function NetworksTab({ networks, info, scanning, onRefresh, onScan }: Props) {
  const [cidr, setCidr] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<ScanProfile>(() =>
    readStoredProfile(info?.defaultScanProfile ?? "standard"),
  );

  function changeProfile(value: ScanProfile | null) {
    if (!value) return;
    setProfile(value);
    window.localStorage.setItem(PROFILE_STORAGE_KEY, value);
  }

  useEffect(() => {
    const target = cidr.trim();
    if (!target) {
      setPreview(null);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      const result = await netscan.previewTargets(target).catch(() => null);
      if (!active) return;
      setPreview(
        result && result.valid
          ? `${result.count.toLocaleString()} addresses will be probed`
          : "Not a recognised range (use 192.168.1.0/24 or 10.0.0.1-10.0.0.50)",
      );
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cidr]);

  async function addNetwork(value: string, label?: string, source = "manual") {
    setBusy(true);
    setError(null);
    try {
      await netscan.createNetwork({ cidr: value, name: label, source });
      setCidr("");
      setName("");
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that range");
    } finally {
      setBusy(false);
    }
  }

  async function autoDetect() {
    setBusy(true);
    try {
      const interfaces = await netscan.detectNetworks();
      const existing = new Set(networks.map((network) => network.cidr));
      const additions = interfaces.filter((entry) => !existing.has(entry.cidr));
      for (const entry of additions) {
        await netscan.createNetwork({
          cidr: entry.cidr,
          name: `${entry.interface} (${entry.cidr})`,
          source: "auto",
        });
      }
      setError(additions.length === 0 ? "All detected interfaces are already tracked." : null);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function importFile() {
    const { content } = await netscan.importTargetsFile();
    if (!content) return;
    const entries = content
      .split(/[\r\n,;]+/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    for (const entry of entries) {
      await netscan.createNetwork({ cidr: entry, name: entry, source: "import" }).catch(() => null);
    }
    onRefresh();
  }

  async function remove(id: string) {
    await netscan.deleteNetwork(id);
    onRefresh();
  }

  return (
    <Stack spacing={2.5}>
      <Card>
        <CardContent>
          <Typography variant="h6">Add a range to monitor</Typography>
          <Typography variant="caption" color="text.secondary">
            CIDR blocks, single hosts and dashed ranges are all accepted.
          </Typography>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{ mt: 2, alignItems: { md: "flex-start" } }}
          >
            <TextField
              label="Range or host"
              placeholder="192.168.1.0/24"
              value={cidr}
              onChange={(event) => setCidr(event.target.value)}
              helperText={preview ?? " "}
              sx={{ flex: 1, minWidth: 240 }}
            />
            <TextField
              label="Label (optional)"
              placeholder="Office LAN"
              value={name}
              onChange={(event) => setName(event.target.value)}
              helperText=" "
              sx={{ minWidth: 200 }}
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                disabled={!cidr.trim() || busy}
                onClick={() => addNetwork(cidr.trim(), name.trim() || undefined)}
              >
                Add
              </Button>
              <Button
                variant="outlined"
                startIcon={<RadarIcon />}
                onClick={autoDetect}
                disabled={busy}
              >
                Auto-detect
              </Button>
              <Button variant="text" startIcon={<UploadFileIcon />} onClick={importFile}>
                Import list
              </Button>
            </Stack>
          </Stack>
          {error ? (
            <Alert severity="info" sx={{ mt: 1 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          ) : null}
          {info?.interfaces?.length ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: "wrap" }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Detected here:
              </Typography>
              {info.interfaces.map((entry) => (
                <Chip
                  key={entry.interface + entry.cidr}
                  size="small"
                  variant="outlined"
                  label={`${entry.interface} · ${entry.cidr}`}
                  onClick={() => setCidr(entry.cidr)}
                />
              ))}
            </Stack>
          ) : null}
        </CardContent>
      </Card>

      <VendorDatabaseCard />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Scan profile
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={profile}
          onChange={(_event, value: ScanProfile | null) => changeProfile(value)}
        >
          {(Object.keys(PROFILE_DETAILS) as ScanProfile[]).map((key) => (
            <ToggleButton key={key} value={key}>
              <Tooltip title={PROFILE_DETAILS[key].description}>
                <span>{PROFILE_DETAILS[key].label}</span>
              </Tooltip>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        {networks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No ranges yet. Add one above or auto-detect your interfaces.
          </Typography>
        ) : (
          networks.map((network) => (
            <Card key={network.id} sx={{ flex: "1 1 300px", minWidth: 280 }}>
              <CardContent>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "start" }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" noWrap>
                      {network.name}
                    </Typography>
                    <Mono>{network.cidr}</Mono>
                  </Box>
                  <Tooltip title="Remove range">
                    <IconButton size="small" onClick={() => remove(network.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Chip size="small" label={network.source} variant="outlined" />
                  <Chip
                    size="small"
                    label={`${network.onlineCount ?? 0} online`}
                    sx={{ color: statusColors.online }}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    label={`${network.deviceCount ?? 0} known`}
                    variant="outlined"
                  />
                </Stack>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 1.5 }}
                >
                  Last scan {relativeTime(network.lastScanAt)}
                </Typography>

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<PlayArrowIcon />}
                  sx={{ mt: 1.5 }}
                  disabled={scanning}
                  onClick={() => onScan(network.id, profile)}
                >
                  {scanning ? "Scan running" : "Scan now"}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </Stack>
    </Stack>
  );
}
