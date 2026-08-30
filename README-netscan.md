# NetScan

Local network device inventory: discovers hosts on your LAN, records IP, hostname,
MAC + vendor, online status and open ports, and keeps a history so you can compare scans.

The same React/Material UI frontend runs in three modes:

| Mode               | Scanning                                          | How to run          |
| ------------------ | ------------------------------------------------- | ------------------- |
| Web preview        | demo data only (browsers cannot open raw sockets) | the Lovable preview |
| Desktop (Electron) | real ICMP / ARP / TCP                             | `npm run electron`  |
| Container (Docker) | real, on the host network                         | `npm run docker:up` |

## Desktop app

```bash
npm run electron          # build UI + launch
npm run package:linux     # -> electron-release/*.AppImage, *.deb
npm run package:win       # -> electron-release/*.exe (NSIS installer)
npm run package:mac       # -> electron-release/*.dmg, *.zip
```

Packaging uses [electron-builder](https://www.electron.build/) (config in `electron-builder.yml`).
`core/` has no npm runtime dependencies (Node builtins only), so the packaged app ships
`electron/`, `core/` and the built `dist-app/` SPA with no `node_modules`.

## Releases (alpha / beta / stable)

Three long-lived branches map to release channels:

| Branch  | Channel | Tag pattern       |
| ------- | ------- | ------------------ |
| `alpha` | Alpha   | `vX.Y.Z-alpha.N`   |
| `beta`  | Beta    | `vX.Y.Z-beta.N`    |
| `main`  | Stable  | `vX.Y.Z`           |

Work flows `alpha` → `beta` → `main` via PRs. Pushing a version tag on any branch triggers
`.github/workflows/release.yml`, which builds Windows/macOS/Linux installers and publishes a
GitHub Release (marked as a prerelease for `-alpha`/`-beta` tags).

To cut a release, from the target branch:

```bash
npm run release:alpha   # bump to next X.Y.Z-alpha.N, commit, tag, push
npm run release:beta    # bump to next X.Y.Z-beta.N, commit, tag, push
npm run release:patch   # stable patch bump (also: release:minor, release:major)
```

These wrap `npm version`, which commits the `package.json` bump and creates the tag; the
`postversion` script pushes the commit and tag. `.github/workflows/ci.yml` runs lint + a
desktop-SPA build on every push/PR to `main`, `beta`, and `alpha`.

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
