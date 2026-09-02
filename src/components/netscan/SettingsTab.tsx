import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SendIcon from "@mui/icons-material/Send";
import SyncIcon from "@mui/icons-material/Sync";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { netscan } from "@/lib/netscan-api";
import type {
  OuiStatus,
  ScanProfile,
  ScanProfilePortsConfig,
  WebhookConfig,
  WebhookEvent,
} from "@/lib/netscan-types";
import { HISTORY_LABELS, relativeTime } from "./shared";

const SCAN_PROFILE_COPY: Record<ScanProfile, { label: string; description: string }> = {
  quick: {
    label: "Quick",
    description: "Ping only by default — add a port here to also probe it during quick scans.",
  },
  standard: {
    label: "Standard",
    description: "The port list probed on every standard scan.",
  },
  deep: {
    label: "Deep",
    description: "An extended port list for a slower, more thorough scan.",
  },
};

function ScanProfilePortsCard() {
  const [config, setConfig] = useState<ScanProfilePortsConfig | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<ScanProfile, string>>({
    quick: "",
    standard: "",
    deep: "",
  });
  const [busy, setBusy] = useState<ScanProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ScanProfile | null>(null);

  useEffect(() => {
    netscan
      .getScanProfilePorts()
      .then(setConfig)
      .catch(() => null);
    netscan
      .getInfo()
      .then((info) => setLabels(info.portLabels))
      .catch(() => null);
  }, []);

  async function addPort(profile: ScanProfile) {
    if (!config) return;
    const value = Number(draft[profile].trim());
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      setError("Enter a port number between 1 and 65535");
      return;
    }
    if (config[profile].includes(value)) {
      setDraft((prev) => ({ ...prev, [profile]: "" }));
      return;
    }
    setBusy(profile);
    setError(null);
    try {
      const updated = await netscan.updateScanProfilePorts(
        profile,
        [...config[profile], value].sort((a, b) => a - b),
      );
      setConfig(updated);
      setDraft((prev) => ({ ...prev, [profile]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the port list");
    } finally {
      setBusy(null);
    }
  }

  async function removePort(profile: ScanProfile, port: number) {
    if (!config) return;
    setBusy(profile);
    setError(null);
    try {
      setConfig(
        await netscan.updateScanProfilePorts(
          profile,
          config[profile].filter((p) => p !== port),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the port list");
    } finally {
      setBusy(null);
    }
  }

  async function resetProfile(profile: ScanProfile) {
    setBusy(profile);
    setError(null);
    try {
      setConfig(await netscan.resetScanProfilePorts(profile));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset the port list");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Scan profile ports</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          See which TCP ports Quick, Standard and Deep scans probe, and add or remove ports per
          profile.
        </Typography>

        <Stack spacing={1}>
          {(Object.keys(SCAN_PROFILE_COPY) as ScanProfile[]).map((profile) => {
            const ports = config?.[profile] ?? [];
            const customized = config?.customized[profile] ?? false;
            return (
              <Accordion
                key={profile}
                disableGutters
                square
                elevation={0}
                sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" } }}
                expanded={expanded === profile}
                onChange={(_event, isExpanded) => setExpanded(isExpanded ? profile : null)}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: "center", flex: 1, minWidth: 0, pr: 1 }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1">
                        {SCAN_PROFILE_COPY[profile].label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {SCAN_PROFILE_COPY[profile].description}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={ports.length === 0 ? "ping only" : `${ports.length} ports`}
                    />
                    {customized ? <Chip size="small" color="primary" label="Custom" /> : null}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  {customized ? (
                    <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 1 }}>
                      <Tooltip title="Reset to the built-in port list">
                        <span>
                          <IconButton
                            size="small"
                            disabled={busy === profile}
                            onClick={() => resetProfile(profile)}
                          >
                            <RestartAltIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  ) : null}

                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {ports.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No ports — ping only.
                      </Typography>
                    ) : (
                      ports.map((port) => (
                        <Chip
                          key={port}
                          size="small"
                          label={
                            labels[String(port)]
                              ? `${port} · ${labels[String(port)]}`
                              : String(port)
                          }
                          onDelete={() => removePort(profile, port)}
                          disabled={busy === profile}
                        />
                      ))
                    )}
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center" }}>
                    <TextField
                      size="small"
                      placeholder="Add port…"
                      value={draft[profile]}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [profile]: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addPort(profile);
                      }}
                      sx={{ width: 140 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      disabled={!draft[profile].trim() || busy === profile}
                      onClick={() => addPort(profile)}
                    >
                      Add
                    </Button>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>

        {error ? (
          <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
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

const WEBHOOK_EVENTS: WebhookEvent[] = [
  "first_seen",
  "status_change",
  "ip_changed",
  "hostname_changed",
  "vendor_changed",
  "ports_changed",
];

function WebhookCard() {
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    netscan
      .getWebhookConfig()
      .then((loaded) => {
        setConfig(loaded);
        setUrl(loaded.url);
        setEnabled(loaded.enabled);
        setEvents(loaded.events);
      })
      .catch(() => null);
  }, []);

  function toggleEvent(event: WebhookEvent) {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await netscan.updateWebhookConfig({ url: url.trim(), enabled, events });
      setConfig(updated);
      setNotice("Saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the webhook settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      await netscan.testWebhook();
      setNotice("Test notification delivered.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not deliver the test notification");
    } finally {
      setTesting(false);
    }
  }

  const dirty =
    config !== null &&
    (url.trim() !== config.url ||
      enabled !== config.enabled ||
      events.length !== config.events.length ||
      events.some((e) => !config.events.includes(e)));

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography variant="h6">Webhook notifications</Typography>
            <Typography variant="caption" color="text.secondary">
              POST a summary of what changed to your own URL whenever a scan finishes — one call per
              scan, not per device.
            </Typography>
          </Box>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
            label={enabled ? "Enabled" : "Disabled"}
          />
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mt: 2 }}>
          <TextField
            label="Webhook URL"
            placeholder="https://example.com/hooks/netscan"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
          />
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 2, mb: 0.5 }}
        >
          Notify on
        </Typography>
        <Stack direction="row" spacing={0} useFlexGap sx={{ flexWrap: "wrap" }}>
          {WEBHOOK_EVENTS.map((event) => (
            <FormControlLabel
              key={event}
              sx={{ minWidth: 190 }}
              control={
                <Checkbox
                  size="small"
                  checked={events.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
              }
              label={<Typography variant="body2">{HISTORY_LABELS[event] || event}</Typography>}
            />
          ))}
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: "center" }}>
          <Button
            variant="contained"
            size="small"
            startIcon={saving ? <CircularProgress size={16} /> : <NotificationsActiveIcon />}
            disabled={saving || !dirty || !events.length}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={testing ? <CircularProgress size={16} /> : <SendIcon />}
            disabled={testing || !config?.url || dirty}
            onClick={sendTest}
          >
            {testing ? "Sending…" : "Send test"}
          </Button>
          {config?.updatedAt ? (
            <Typography variant="caption" color="text.secondary">
              Last saved {relativeTime(config.updatedAt)}
            </Typography>
          ) : null}
        </Stack>

        {notice ? (
          <Alert severity="success" sx={{ mt: 1.5 }} onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}
        {error ? (
          <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SettingsTab() {
  return (
    <Stack spacing={2.5}>
      <ScanProfilePortsCard />
      <VendorDatabaseCard />
      <WebhookCard />
    </Stack>
  );
}
