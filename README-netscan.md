# NetScan

Local network device inventory: discovers hosts on your LAN, records IP, hostname,
MAC + vendor, online status and open ports, and keeps a history so you can compare scans.

The same React/Material UI frontend runs in three modes:

| Mode | Scanning | How to run |
| --- | --- | --- |
| Web preview | demo data only (browsers cannot open raw sockets) | the Lovable preview |
| Desktop (Electron) | real ICMP / ARP / TCP | `npm run electron` |
| Container (Docker) | real, on the host network | `npm run docker:up` |

## Desktop app

```bash
npm run electron          # build UI + launch
npm run package:linux     # -> electron-release/NetScan-linux-x64
npm run package:win       # Windows x64
npm run package:mac       # macOS arm64
```

## Docker

```bash
docker compose up -d --build
# UI + API on http://localhost:8099
```

`network_mode: host` plus `NET_RAW`/`NET_ADMIN` are required so the scanner can
reach your LAN and read the host ARP table (works best on Linux hosts).
Scan data persists in the `netscan-data` volume (`/data/netscan.db`).

## Headless server without Docker

```bash
npm run server            # builds the UI, serves API + UI on :8099
```

Environment: `NETSCAN_PORT`, `NETSCAN_HOST`, `NETSCAN_DATA_DIR`, `NETSCAN_STATIC_DIR`.

## Layout

- `core/` — scanner engine, OUI vendor lookup, storage (SQLite with JSON fallback), service layer
- `electron/` — main + preload (IPC bridge exposed as `window.netscan`)
- `server/` — HTTP/SSE server used by Docker and headless mode
- `app/` — standalone SPA entry for the packaged shells
- `src/components/netscan/` — the UI, shared by every mode
