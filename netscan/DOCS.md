# NetScan add-on

## Configuration

| Option             | Default | Description                                                                  |
| ------------------- | ------- | ----------------------------------------------------------------------------- |
| `default_subnet`     | _(empty)_ | CIDR auto-seeded as a network on first boot, e.g. `192.168.1.0/24`.         |
| `interval_minutes`   | `0`     | Enables scheduled automatic scans on this interval. `0` disables scheduling. |

The web UI always listens on port 8099 internally (fixed — see `netscan/config.yaml`'s
`ingress_port`); it's not user-configurable.

Scan data (networks, devices, scan history) persists in the add-on's `/data` volume, which
Supervisor manages automatically — it survives add-on restarts and updates.

## Accessing the UI

NetScan appears as its own panel in the Home Assistant sidebar (via Ingress) — click it, or use
"OPEN WEB UI" on the add-on's Info page. The panel is admin-only (`panel_admin: true`), matching
who could already reach the add-on's Info page. Ingress means Home Assistant proxies the UI
through its own authenticated session — no separate login, and port 8099 isn't exposed outside
that proxy.

## Requirements

- Home Assistant OS or Supervised, with the host actually on the LAN you want to scan.
- Not supported on HA Cloud, or on Supervised installs where the underlying Docker host doesn't
  have real host networking (e.g. Docker Desktop on macOS/Windows) — real ARP-table reads need
  a real Linux host network.

## Known limitations

- **No Home Assistant entities.** This add-on does not create HA sensors/device_trackers from
  scan results — it's a standalone inventory UI, not an integration. That would be a separate,
  larger feature (a custom integration reading from NetScan's API/DB).
