# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NetScan: a local network device inventory app. It discovers hosts on a LAN (ICMP/ARP/TCP), records IP,
hostname, MAC + vendor, online status and open ports, and keeps a scan history for comparison. The
project originated from a Lovable-generated TanStack Start template (`.lovable/`), then had the actual
scanner product built on top — the web preview is a demo shell; real scanning only happens in the
Electron and Docker builds.

## The three shells, one core

The same React/MUI frontend (`src/components/netscan/`) runs in three modes, switched at runtime by
`src/lib/netscan-api.ts` (`getTransport()` probes for `window.netscan` first, then `/api/info`, then
falls back to demo data):

| Mode                  | Scanning                                         | Entry point                                  | Run with            |
| --------------------- | ------------------------------------------------ | -------------------------------------------- | ------------------- |
| Web preview (Lovable) | demo data only — browsers can't open raw sockets | `src/routes/` (TanStack Start)               | `npm run dev`       |
| Desktop (Electron)    | real ICMP/ARP/TCP                                | `electron/main.cjs` + `electron/preload.cjs` | `npm run electron`  |
| Container (Docker)    | real, on host network                            | `server/index.cjs`                           | `npm run docker:up` |

There's also a fourth distribution path riding on top of the Docker one: the `netscan/` folder
at repo root is a **Home Assistant add-on** manifest (`config.yaml`, `DOCS.md`, etc.), paired
with `repository.yaml` at repo root so the whole repo can be added as an HA add-on repository.
It doesn't build its own image — `netscan/config.yaml`'s `image:` field points at
`ghcr.io/<owner>/netscan`, the same multi-arch image the `docker` job in
`.github/workflows/release.yml` publishes from the root `Dockerfile` on every tagged release.
`docker/entrypoint.sh` is what makes one image serve both consumers: it reads
`/data/options.json` when Supervisor mounts it (translating add-on options into the usual
`NETSCAN_*` env vars) and otherwise falls through to whatever env vars a plain
docker-compose deployment already set. The add-on runs behind Home Assistant Ingress (embedded
sidebar panel, `netscan/config.yaml`'s `ingress: true`/`ingress_port: 8099`) — that's why
`src/lib/netscan-api.ts`'s `fetch`/`EventSource` calls use relative (`api/...`), not
root-absolute (`/api/...`), paths: a leading slash would resolve against the origin root and
miss Supervisor's per-add-on Ingress path prefix. See `netscan/DOCS.md` for known limitations
(no HA entities).

Electron and Docker both load the **same static SPA** (`app/` entry, built by `vite.app.config.mts`
into `dist-app/`) and the **same `core/` engine** — they differ only in how the frontend talks to it:
Electron uses `contextBridge`-exposed IPC (`window.netscan`, wired in `electron/preload.cjs`), Docker
uses a plain HTTP+SSE API (`server/index.cjs`). `core/service.cjs` is the single brain shared by both:
it owns the database, the scan lifecycle, and progress broadcasting, so main-process and server code
are thin adapters around it, never duplicate business logic.

Because of this split, there are **two Vite configs**:

- `vite.config.ts` — TanStack Start dev/build for the Lovable web preview (`src/routes/` file-based
  routing; do not create `src/pages/` or `app/layout.tsx`, see `src/routes/README.md`). This config is
  built on `@lovable.dev/vite-tanstack-config`, which already wires TanStack devtools, `tanstackStart`,
  `viteReact`, `tailwindcss`, `tsConfigPaths`, `nitro`, and the `@` alias — do not re-add any of those
  plugins manually or the app breaks with duplicates.
- `vite.app.config.mts` — a plain static SPA build (`app/` root, `base: "./"` for `file://` loading,
  output to `dist-app/`) consumed by both Electron and Docker.

## `core/` engine

- `core/scanner.cjs` — ping/ARP/TCP port scanning, target expansion (CIDR/range/list parsing), local
  interface detection. Also defines `SCAN_PROFILES` (`quick`/`standard`/`deep`, resolved by
  `resolveScanProfile()`) — named presets over `scanNetwork()`'s own options, so a caller passes
  `{ profile: "deep" }` instead of assembling `{ scanPorts, ports, timeout }` by hand. `standard` is
  deliberately `{}`: it inherits `scanNetwork()`'s defaults rather than restating them, so the two can
  never drift apart.
- `core/db.cjs` — storage layer with two interchangeable backends behind one repository API:
  `node:sqlite` when available, otherwise an atomic JSON-file store. Callers never need to know which
  is active. Tables: `networks`, `scan_runs`, `devices`, `scan_results`, `device_history`.
- `core/hostname.cjs` — hostname resolution.
- `core/oui.cjs` — MAC vendor (OUI) lookup.
- `core/service.cjs` — orchestrates the above; the only module Electron's main process and
  `server/index.cjs` call into.

When changing scan behavior, storage schema, or adding an API operation, change it once in `core/`
and it's automatically available to both shells — don't add shell-specific logic for something the
core can do.

## Frontend data flow

`src/lib/netscan-api.ts` exports the `netscan` object — the single API surface every UI component uses
(`src/components/netscan/DashboardTab.tsx`, `DevicesTab.tsx`, `NetworksTab.tsx`, `ScansTab.tsx`). Every
method branches on transport (desktop bridge → server fetch → demo fallback in `netscan-demo.ts`), so
adding a new operation means adding it in four places: the `DesktopBridge` type, `electron/preload.cjs`

- an IPC handler in `electron/main.cjs`, `server/index.cjs`'s route switch, `core/service.cjs`, and a
  demo fallback. Types shared across all of this live in `src/lib/netscan-types.ts`. Live scan progress
  comes through `netscan.subscribe()`, backed by Electron IPC events, SSE (`/api/events`), or a simulated
  demo emitter.

## Commands

```bash
npm run dev              # Lovable web preview (demo data), TanStack Start dev server
npm run build             # TanStack Start production build
npm run lint               # eslint .
npm run format             # prettier --write .

npm run electron           # build the static SPA + launch the Electron app (real scanning)
npm run electron:dev       # Electron pointed at a running dev server (NETSCAN_DEV_SERVER)
npm run package:linux       # electron-packager build → electron-release/NetScan-linux-x64
npm run package:win
npm run package:mac

npm run server              # build the static SPA, then serve API+UI on :8099 (no Docker)
npm run docker:build        # docker compose build
npm run docker:up            # docker compose up -d, http://localhost:8099
```

There is no test suite configured in `package.json`.

Server env vars: `NETSCAN_PORT`, `NETSCAN_HOST`, `NETSCAN_DATA_DIR`, `NETSCAN_STATIC_DIR`,
`NETSCAN_DEFAULT_SUBNET` (auto-seeds a network on first boot), `NETSCAN_INTERVAL_MINUTES` (enables
scheduled scans), `NETSCAN_API_TOKEN` (opt-in; when set, every `/api/*` route except `/api/info` and
the SSE stream require it as `Authorization: Bearer <token>` or `?token=` — open the UI once with
`?token=<value>` and `src/lib/netscan-api.ts` stores it in `localStorage` and scrubs it from the URL).
Unset by default so a bare `npm run server`/`docker compose up` still works without a login step; set
it for any standalone deployment reachable by more than just you, since credentials created through
the vault feature are otherwise gated only by the master password, not by network access. Docker
requires `network_mode: host` plus `NET_RAW`/`NET_ADMIN` for real LAN access
and ARP table reads (works best on Linux hosts); scan data persists in the `netscan-data` volume at
`/data/netscan.db`.

## Conventions

- Path alias `@/*` → `src/*` (both Vite configs and `tsconfig.json`).
- `core/`, `server/`, `electron/` are CommonJS (`.cjs`) and run directly under Node — no build step for
  them. Only the frontend (`src/`, `app/`) goes through Vite/TypeScript.
- TypeScript is strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — expect
  to handle `undefined` from indexed/optional access explicitly.
- This repo is connected to Lovable: commits pushed to the connected branch sync back into the Lovable
  editor. Avoid force-pushing or rewriting published history (rebase/amend/squash of pushed commits),
  since that rewrites history on Lovable's side and can lose project history there.
