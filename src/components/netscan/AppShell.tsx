import DownloadIcon from "@mui/icons-material/Download";
import HubIcon from "@mui/icons-material/Hub";
import RefreshIcon from "@mui/icons-material/Refresh";
import StopIcon from "@mui/icons-material/Stop";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
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
  DeviceRow,
  HistoryRow,
  Info,
  NetworkRow,
  ScanProfile,
  ScanProgress,
  ScanRow,
  VaultStatus,
} from "@/lib/netscan-types";
import { theme } from "@/theme";
import { CredentialsTab } from "./CredentialsTab";
import { DashboardTab } from "./DashboardTab";
import { DevicesTab } from "./DevicesTab";
import { NetworksTab } from "./NetworksTab";
import { ScansTab } from "./ScansTab";
import { SettingsTab } from "./SettingsTab";
import { Mono, buildDashboard, deriveScanDeltas } from "./shared";

/** Sentinel option in the network filter's Select for "clear the selection". */
const ALL_NETWORKS = "__all__";

export function AppShell() {
  const [tab, setTab] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
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
  // Empty selection means "all networks" - the same convention used
  // throughout core/db.cjs's own networkId filters.
  const [networkFilter, setNetworkFilter] = useState<string[]>([]);
  const [status, setStatus] = useState<"all" | "online" | "offline">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deviceIdFilter, setDeviceIdFilter] = useState<string[] | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [
        nextNetworks,
        nextDevices,
        nextScans,
        nextHistory,
        status,
        nextCredentials,
        nextVaultStatus,
      ] = await Promise.all([
        netscan.listNetworks(),
        netscan.listDevices(),
        netscan.listScans(),
        netscan.listHistory(),
        netscan.getScanStatus(),
        netscan.listCredentials(),
        netscan.getVaultStatus(),
      ]);
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
      await getTransport();
      if (!active) return;
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

  const startScan = useCallback(async (networkId: string, profile: ScanProfile) => {
    setProgress({ running: true, percent: 0, networkId });
    try {
      await netscan.startScan(networkId, { profile, resolveHostnames: true });
    } catch {
      setProgress({ running: false });
    }
  }, []);

  const visibleDevices = useMemo(
    () =>
      networkFilter.length ? devices.filter((d) => networkFilter.includes(d.network_id)) : devices,
    [devices, networkFilter],
  );
  const visibleScans = useMemo(
    () =>
      networkFilter.length ? scans.filter((s) => networkFilter.includes(s.network_id)) : scans,
    [scans, networkFilter],
  );
  const visibleDeviceIds = useMemo(
    () => new Set(visibleDevices.map((d) => d.id)),
    [visibleDevices],
  );
  const visibleHistory = useMemo(
    () =>
      networkFilter.length ? history.filter((h) => visibleDeviceIds.has(h.device_id)) : history,
    [history, networkFilter, visibleDeviceIds],
  );
  const visibleCredentials = useMemo(
    () =>
      networkFilter.length
        ? credentials.filter((c) => visibleDeviceIds.has(c.device_id))
        : credentials,
    [credentials, networkFilter, visibleDeviceIds],
  );
  const dashboardData = useMemo(
    () =>
      buildDashboard(
        visibleDevices,
        visibleScans,
        visibleHistory,
        networkFilter.length || networks.length,
      ),
    [visibleDevices, visibleScans, visibleHistory, networkFilter, networks.length],
  );

  const latestScanId = dashboardData.recentScans[0]?.id ?? null;
  const { newDeviceIds, missingDeviceIds } = useMemo(
    () => deriveScanDeltas(visibleHistory, latestScanId),
    [visibleHistory, latestScanId],
  );

  const onStatusChange = useCallback((value: "all" | "online" | "offline") => {
    setStatus(value);
    setDeviceIdFilter(null);
  }, []);

  const onCategoryChange = useCallback((value: string) => {
    setCategoryFilter(value);
    setDeviceIdFilter(null);
  }, []);

  const onClearDeviceIdFilter = useCallback(() => setDeviceIdFilter(null), []);

  const onFilterDevices = useCallback(
    (filter: {
      status?: "all" | "online" | "offline";
      category?: string | null;
      deviceIds?: string[] | null;
    }) => {
      setStatus(filter.status ?? "all");
      setCategoryFilter(filter.category ?? "");
      setDeviceIdFilter(filter.deviceIds ?? null);
      setTab(1);
    },
    [],
  );

  const scanning = Boolean(progress.running);

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

            {networks.length > 1 ? (
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <InputLabel id="network-filter-label">Networks</InputLabel>
                <Select
                  labelId="network-filter-label"
                  multiple
                  value={networkFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    const values = typeof value === "string" ? value.split(",") : value;
                    setNetworkFilter(values.includes(ALL_NETWORKS) ? [] : values);
                  }}
                  input={<OutlinedInput label="Networks" />}
                  renderValue={(selected) =>
                    selected.length === 0
                      ? "All networks"
                      : selected.length === 1
                        ? (networks.find((n) => n.id === selected[0])?.name ?? selected[0])
                        : `${selected.length} networks`
                  }
                >
                  <MenuItem value={ALL_NETWORKS}>
                    <Checkbox size="small" checked={networkFilter.length === 0} />
                    <ListItemText primary="All networks" />
                  </MenuItem>
                  {networks.map((network) => (
                    <MenuItem key={network.id} value={network.id}>
                      <Checkbox size="small" checked={networkFilter.includes(network.id)} />
                      <ListItemText primary={network.name} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}

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
            <Tabs
              value={tab}
              onChange={(_event, value) => setTab(value as number)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
            >
              <Tab label="Overview" />
              <Tab label={`Devices (${visibleDevices.length})`} />
              <Tab label={`Networks (${networks.length})`} />
              <Tab label="Scans & changes" />
              <Tab label={`Credentials (${visibleCredentials.length})`} />
              <Tab label="Settings" />
            </Tabs>
          </Paper>

          {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}

          <Box sx={{ display: tab === 0 ? "block" : "none" }}>
            <DashboardTab
              data={dashboardData}
              devices={visibleDevices}
              newDeviceIds={newDeviceIds}
              missingDeviceIds={missingDeviceIds}
              onFilterDevices={onFilterDevices}
              onSelectDevice={setSelectedDeviceId}
            />
          </Box>
          <Box sx={{ display: tab === 1 ? "block" : "none" }}>
            <DevicesTab
              devices={visibleDevices}
              allDevices={devices}
              networks={networks}
              history={history}
              credentials={visibleCredentials}
              vaultStatus={vaultStatus}
              info={info}
              status={status}
              onStatusChange={onStatusChange}
              categoryFilter={categoryFilter}
              onCategoryChange={onCategoryChange}
              deviceIdFilter={deviceIdFilter}
              onClearDeviceIdFilter={onClearDeviceIdFilter}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
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
            <ScansTab
              scans={visibleScans}
              networks={networks}
              history={visibleHistory}
              devices={visibleDevices}
              onSelectDevice={setSelectedDeviceId}
            />
          </Box>
          <Box sx={{ display: tab === 4 ? "block" : "none" }}>
            <CredentialsTab
              credentials={visibleCredentials}
              devices={visibleDevices}
              vaultStatus={vaultStatus}
              onRefresh={refresh}
            />
          </Box>
          <Box sx={{ display: tab === 5 ? "block" : "none" }}>
            <SettingsTab />
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
