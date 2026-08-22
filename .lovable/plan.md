# Network Device Scanner — Desktop Electron App

A local desktop app that scans your network, keeps a history of every discovered device, and shows you what changed between scans.

## What we are building

- An Electron desktop app with a React frontend (built from the existing TanStack Start project).
- The heavy scanning work runs in the Node.js main process, so it has real network access (ICMP, ARP, TCP ports, MAC addresses).
- A local SQLite database in the main process stores networks, scan runs, devices, and a full history.
- Users can add networks by typing a CIDR/subnet, picking the auto-detected local network, or uploading a list of IPs.
- The dashboard shows the current scan, device details (IP, hostname, MAC, vendor, online status, open ports), and a history comparison (new, missing, status changes).

## Why local SQLite instead of Lovable Cloud

Because this is a desktop app that scans the user's local network, the data naturally lives on that machine. SQLite keeps everything offline, private, and fast. Lovable Cloud can be added later if cloud sync or multi-device access is needed.

## Technical architecture

```text
┌──────────────────────────────┐
│  React frontend (TanStack)   │  ← UI, tables, charts, controls
│  talks to main process via IPC │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  Electron main process (Node)│  ← scanning, SQLite, file I/O
│  - ping / arp / port scan    │
│  - SQLite database           │
└──────────────────────────────┘
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

4. **Frontend UI**
   - **Networks page**: list existing networks, add new (manual / auto-detect / file upload), edit, delete.
   - **Scan page**: pick a network, start/stop scan, live progress, real-time device list.
   - **Results page**: sortable/filterable device table, status badges, search, export.
   - **Device details**: full history timeline, port list, vendor, last seen.
   - **Dashboard**: total devices, online now, newly discovered, missing since last scan, simple charts.

5. **Design direction**
   - Dark, technical, command-center aesthetic.
   - High-contrast status colors (online green, offline gray, alert amber).
   - Clean data tables, monospace for IP/MAC addresses, compact spacing.

6. **Packaging**
   - Build the frontend and package with `@electron/packager`.
   - Produce Linux x64 first; macOS and Windows can follow the same flow.
   - Archive the result to `/mnt/documents/` for download.

## First milestone

Get the Electron shell running, the SQLite schema in place, and a simple manual-subnet scan that returns a list of online IPs with hostnames. Everything else builds on top of that.

## Open questions for later

- Should the app run scheduled scans in the background (e.g., every 15 minutes)?
- Should scan results be exportable as CSV/JSON?
- Should we add a cloud-sync option with Lovable Cloud for multi-device access?
