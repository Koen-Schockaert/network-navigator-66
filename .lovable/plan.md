# Network Device Scanner — Desktop Electron App

A local desktop app that scans your network, keeps a history of every discovered device, and shows you what changed between scans.

## What we are building

- An Electron desktop app with a React + Material UI frontend (built from the existing TanStack Start project).
- The heavy scanning work runs in the Node.js main process, so it has real network access (ICMP, ARP, TCP ports, MAC addresses).
- A local SQLite database in the main process stores networks, scan runs, devices, and a full history.
- The same scanner engine also ships as a Docker container with a web UI, for always-on scanning on a server or NAS.
- Users can add networks by typing a CIDR/subnet, picking the auto-detected local network, or uploading a list of IPs.
- The dashboard shows the current scan, device details (IP, hostname, MAC, vendor, online status, open ports), and a history comparison (new, missing, status changes).

## Why local SQLite instead of Lovable Cloud

Because this app scans your local network, the data naturally lives on that machine. SQLite keeps everything offline, private, and fast. Lovable Cloud can be added later if cloud sync or multi-device access is needed.

## Technical architecture

One shared scanner + database core, two shells around it.

```text
        ┌──────────────────────────────┐
        │  React + Material UI frontend │  ← UI, DataGrid, charts, controls
        └───────┬───────────────┬───────┘
        IPC     │               │   HTTP
        ┌───────▼──────┐  ┌─────▼─────────────┐
        │ Electron main │  │ Docker: Node server│
        └───────┬──────┘  └─────┬─────────────┘
                └───────┬───────┘
                ┌───────▼────────┐
                │  Shared core   │  ← ping / arp / port scan + SQLite
                └────────────────┘
```


## Database schema

- `networks` — name, CIDR, created/updated at
- `scan_runs` — which network, started/finished, status, summary
- `devices` — IP, hostname, MAC, vendor, first seen, last seen, online status
- `scan_results` — per-scan result: device, online?, response time, ports JSON
- `device_history` — events: `first_seen`, `last_seen`, `status_change`, `ports_changed`, `hostname_changed`, `vendor_changed`

## Build steps

1. **Electron setup**
   - Install `electron` and `@electron/packager` as dev dependencies.
   - Create `electron/main.cjs` (CommonJS) with `BrowserWindow`, `contextIsolation: true`, `nodeIntegration: false`, and a preload script.
   - Create `electron/preload.cjs` to expose a safe `window.electronAPI` for IPC.
   - Set Vite `base: "./"` and build output to `dist/` so Electron can load it from `file://`.
   - Add npm scripts: `build`, `electron:dev`, `electron:pack`.

2. **Local database**
   - Add `better-sqlite3` or `sqlite3` in the main process.
   - Initialize schema on first run, store the DB in the user's app data folder.
   - Expose IPC methods: `getNetworks`, `createNetwork`, `updateNetwork`, `deleteNetwork`, `getScans`, `getDevices`, `getDeviceHistory`, `exportData`.

3. **Scanner engine (main process)**
   - Auto-detect local interfaces with `os.networkInterfaces()`.
   - Parse CIDR or uploaded IP lists.
   - ICMP ping using a system-ping wrapper to avoid raw sockets.
   - Read ARP table to get MAC addresses.
   - Resolve MAC vendors with a bundled OUI database.
   - Reverse DNS for hostnames.
   - TCP port checks on a configurable set of common ports.
   - Emit progress events to the renderer while scanning.

4. **Frontend UI (Material UI)**
   - Use MUI (`@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`) as the component library.
   - Add `@mui/x-data-grid` for the device tables (sorting, filtering, column resize, CSV export built in).
   - Define one central MUI theme (dark palette, typography, component defaults) and use theme tokens everywhere — no hardcoded colors in components.
   - **Networks page**: list existing networks, add new (manual / auto-detect / file upload), edit, delete.
   - **Scan page**: pick a network, start/stop scan, live progress bar, real-time device list.
   - **Results page**: DataGrid of devices, status chips, search, export.
   - **Device details**: MUI Timeline of history, port list, vendor, last seen.
   - **Dashboard**: stat cards for total devices, online now, newly discovered, missing since last scan, plus simple charts.

5. **Design direction**
   - Dark, technical, command-center aesthetic built on a custom MUI dark theme.
   - High-contrast status colors (online green, offline gray, alert amber) defined as theme palette entries.
   - Clean dense data tables, monospace for IP/MAC addresses, compact spacing.

6. **Packaging: Electron desktop app**
   - Build the frontend and package with `@electron/packager`.
   - Produce Linux x64 first; macOS and Windows can follow the same flow.
   - Archive the result to `/mnt/documents/` for download.

7. **Packaging: Docker container**
   - A headless variant of the same app: the scanner engine plus a small web server serving the React UI, no Electron shell.
   - Multi-stage `Dockerfile`: stage 1 builds the React frontend, stage 2 runs a slim Node image with the scanner and server.
   - Install `iputils-ping` and `iproute2` in the image so ping and ARP lookups work.
   - Run with `--network host` (or `--cap-add=NET_RAW --cap-add=NET_ADMIN`) so the container can actually see your LAN.
   - Persist the SQLite database through a named volume mounted at `/data`.
   - Provide a `docker-compose.yml` with host networking, the volume, a port mapping, and env vars for scan interval and default subnet.
   - Shared code layout so the scanner and database modules are used by both the Electron main process and the Docker server — one engine, two shells.


## First milestone

Get the Electron shell running, the SQLite schema in place, and a simple manual-subnet scan that returns a list of online IPs with hostnames. Everything else builds on top of that.

## Open questions for later

- Should the app run scheduled scans in the background (e.g., every 15 minutes)?
- Should scan results be exportable as CSV/JSON?
- Should we add a cloud-sync option with Lovable Cloud for multi-device access?
