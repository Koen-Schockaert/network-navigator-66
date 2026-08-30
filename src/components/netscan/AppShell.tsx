import DownloadIcon from "@mui/icons-material/Download";
import HubIcon from "@mui/icons-material/Hub";
import RefreshIcon from "@mui/icons-material/Refresh";
import StopIcon from "@mui/icons-material/Stop";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { ThemeProvider } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTransport, netscan } from "@/lib/netscan-api";
import type {
  CredentialRow,
  Dashboard,
  DeviceRow,
  HistoryRow,
  Info,
  NetworkRow,
  ScanProgress,
  ScanRow,
  TransportMode,
  VaultStatus,
} from "@/lib/netscan-types";
import { statusColors, theme } from "@/theme";
import { CredentialsTab } from "./CredentialsTab";
import { DashboardTab } from "./DashboardTab";
import { DevicesTab } from "./DevicesTab";
import { NetworksTab } from "./NetworksTab";
import { ScansTab } from "./ScansTab";
import { Mono } from "./shared";

const TRANSPORT_COPY: Record<TransportMode, { label: string; hint: string }> = {
  desktop: {
    label: "Desktop engine",
    hint: "Live ICMP, ARP and TCP scanning through the Electron main process.",
  },
  server: {
    label: "Container engine",
    hint: "Scanning through the Docker container on the host network.",
  },
  demo: {
    label: "Demo data",
    hint: "Browsers cannot open raw sockets — run the desktop app or container for real scans.",
  },
};

export function AppShell() {
  const [tab, setTab] = useState(0);
  const [transport, setTransport] = useState<TransportMode>("demo");
  const [info, setInfo] = useState<Info | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [networks, setNetworks] = useState<NetworkRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({
    configured: false,
    unlocked: false,
  });
  const [progress, setProgress] = useState<ScanProgress>({ running: false });
  const [networkFilter, setNetworkFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [
        nextDashboard,
        nextNetworks,
        nextDevices,
        nextScans,
        nextHistory,
        status,
        nextCredentials,
        nextVaultStatus,
      ] = await Promise.all([
        netscan.getDashboard(),
        netscan.listNetworks(),
        netscan.listDevices(),
        netscan.listScans(),
        netscan.listHistory(),
        netscan.getScanStatus(),
        netscan.listCredentials(),
        netscan.getVaultStatus(),
      ]);
      setDashboard(nextDashboard);
      setNetworks(nextNetworks);
      setDevices(nextDevices);
      setScans(nextScans);
      setHistory(nextHistory);
      setProgress(status);
      setCredentials(nextCredentials);
      setVaultStatus(nextVaultStatus);
    } catch (error) {
      console.error("netscan: failed to load data", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const mode = await getTransport();
      if (!active) return;
      setTransport(mode);
      setInfo(await netscan.getInfo());
      await refresh();
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    return netscan.subscribe((event) => {
      if (event.type === "scan:progress") {
        setProgress({ ...(event as unknown as ScanProgress), running: true });
        return;
      }
      if (event.type === "scan:started") {
        setProgress({ running: true, percent: 0 });
        return;
      }
      if (event.type === "scan:finished" || event.type === "scan:error") {
        setProgress({ running: false });
        void refresh();
        return;
      }
      if (event.type === "device:updated" && event.device) {
        const updated = event.device;
        setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        return;
      }
      if (event.type.startsWith("vault:") || event.type.startsWith("credential:")) {
        void refresh();
      }
    });
  }, [refresh]);

  const startScan = useCallback(async (networkId: string) => {
    setProgress({ running: true, percent: 0, networkId });
    try {
      await netscan.startScan(networkId, { scanPorts: true, resolveHostnames: true });
    } catch {
      setProgress({ running: false });
    }
  }, []);

  const visibleDevices = useMemo(
    () => (networkFilter ? devices.filter((d) => d.network_id === networkFilter) : devices),
    [devices, networkFilter],
  );

  const scanning = Boolean(progress.running);
  const copy = TRANSPORT_COPY[transport];

  return (
    <ThemeProvider theme={theme} defaultMode="dark">
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", pb: 6 }}>
        <AppBar
          position="sticky"
          color="transparent"
          elevation={0}
          sx={{ backdropFilter: "blur(12px)", borderBottom: 1, borderColor: "divider" }}
        >
          <Toolbar sx={{ gap: 2 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flex: 1 }}>
              <HubIcon color="primary" />
              <Box>
                <Typography variant="h6" component="h1" sx={{ lineHeight: 1.1 }}>
                  NetScan
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Network device inventory
                </Typography>
              </Box>
            </Stack>

            <Tooltip title={copy.hint}>
              <Chip
                size="small"
                variant="outlined"
                label={copy.label}
                sx={{
                  color: transport === "demo" ? statusColors.alert : statusColors.online,
                  borderColor: transport === "demo" ? statusColors.alert : statusColors.online,
                }}
              />
            </Tooltip>

            {scanning ? (
              <Button
                color="error"
                variant="outlined"
                startIcon={<StopIcon />}
                onClick={() => netscan.stopScan()}
              >
                Stop scan
              </Button>
            ) : (
              <Tooltip title="Reload data">
                <Button startIcon={<RefreshIcon />} onClick={() => refresh()}>
                  Refresh
                </Button>
              </Tooltip>
            )}
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => netscan.exportData()}
            >
              Export
            </Button>
          </Toolbar>

          {scanning ? (
            <Box sx={{ px: 3, pb: 1.25 }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Sweeping {progress.currentIp ? <Mono>{progress.currentIp}</Mono> : "network"} ·{" "}
                  {progress.completed ?? 0}/{progress.total ?? 0} hosts · {progress.found ?? 0}{" "}
                  responding
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {progress.percent ?? 0}%
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress.percent ?? 0} />
            </Box>
          ) : null}
        </AppBar>

        <Container maxWidth="xl" sx={{ pt: 3 }}>
          <Paper sx={{ mb: 3, px: 1 }}>
            <Tabs value={tab} onChange={(_event, value) => setTab(value as number)}>
              <Tab label="Overview" />
              <Tab label={`Devices (${visibleDevices.length})`} />
              <Tab label={`Networks (${networks.length})`} />
              <Tab label="Scans & changes" />
              <Tab label={`Credentials (${credentials.length})`} />
            </Tabs>
          </Paper>

          {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}

          <Box sx={{ display: tab === 0 ? "block" : "none" }}>
            <DashboardTab data={dashboard} />
          </Box>
          <Box sx={{ display: tab === 1 ? "block" : "none" }}>
            <DevicesTab
              devices={visibleDevices}
              networks={networks}
              history={history}
              credentials={credentials}
              vaultStatus={vaultStatus}
              info={info}
              networkFilter={networkFilter}
              onNetworkFilter={setNetworkFilter}
              onRefresh={refresh}
            />
          </Box>
          <Box sx={{ display: tab === 2 ? "block" : "none" }}>
            <NetworksTab
              networks={networks}
              info={info}
              scanning={scanning}
              onRefresh={refresh}
              onScan={startScan}
            />
          </Box>
          <Box sx={{ display: tab === 3 ? "block" : "none" }}>
            <ScansTab scans={scans} networks={networks} history={history} />
          </Box>
          <Box sx={{ display: tab === 4 ? "block" : "none" }}>
            <CredentialsTab
              credentials={credentials}
              devices={devices}
              vaultStatus={vaultStatus}
              onRefresh={refresh}
            />
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 4, textAlign: "center" }}
          >
            {copy.hint}
            {info?.dbFile ? ` · storage: ${info.dbFile}` : ""}
          </Typography>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
