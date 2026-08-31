# NetScan add-on

## Configuration

| Option             | Default | Description                                                                      |
| ------------------- | ------- | --------------------------------------------------------------------------------- |
| `port`              | `8099`  | Port the web UI listens on (host networking, so this is the port on the HA host). |
| `default_subnet`     | _(empty)_ | CIDR auto-seeded as a network on first boot, e.g. `192.168.1.0/24`.             |
| `interval_minutes`   | `0`     | Enables scheduled automatic scans on this interval. `0` disables scheduling.     |

Scan data (networks, devices, scan history) persists in the add-on's `/data` volume, which
Supervisor manages automatically — it survives add-on restarts and updates.

## Accessing the UI

Click "OPEN WEB UI" on the add-on's Info page, or browse directly to
`http://<home-assistant-host>:<port>/`. There is no Ingress support yet (see below), so the UI
is not embedded in the Home Assistant sidebar — it opens as its own page/tab.

## Requirements

- Home Assistant OS or Supervised, with the host actually on the LAN you want to scan.
- Not supported on HA Cloud, or on Supervised installs where the underlying Docker host doesn't
  have real host networking (e.g. Docker Desktop on macOS/Windows) — real ARP-table reads need
  a real Linux host network.

## Known limitations

- **No Ingress.** The frontend calls its API with root-relative paths (`/api/...`), which
  doesn't survive Supervisor's per-add-on Ingress path prefix without a frontend change to make
  those calls path-relative. Until that's done, the add-on exposes its port directly instead.
- **No Home Assistant entities.** This add-on does not create HA sensors/device_trackers from
  scan results — it's a standalone inventory UI, not an integration. That would be a separate,
  larger feature (a custom integration reading from NetScan's API/DB).
