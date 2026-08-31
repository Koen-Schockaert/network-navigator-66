# NetScan

LAN device inventory & scanner for Home Assistant. Discovers hosts on your local network
(ICMP/ARP/TCP), records IP, hostname, MAC + vendor, online status and open ports, and keeps
scan history for comparison — all from a dedicated web UI, no Home Assistant entities involved.

This add-on runs the exact same engine as the project's [Docker image](../Dockerfile) and
[Electron desktop app](../electron) — see the [main project README](../README.md) for how the
scanner itself works.

## Installation

1. Settings → Add-ons → Add-on Store → ⋮ → Repositories → add this repository's URL.
2. Find "NetScan" in the store and click Install.
3. Set the `default_subnet` option (optional) and start the add-on.
4. Open NetScan from the Home Assistant sidebar, or via the "OPEN WEB UI" button on the add-on's
   Info page — it runs embedded through Ingress, no separate port or login needed.

## Why host networking + NET_RAW/NET_ADMIN

Real host discovery needs to send raw ICMP pings and read the kernel's ARP table for the actual
LAN the Home Assistant host is on — not an isolated container network. That's what
`host_network: true` and the `NET_RAW`/`NET_ADMIN` capabilities are for. This only works on
Home Assistant OS / Supervised installs with real LAN access (not HA Cloud, and not a
Docker-Desktop-hosted Supervised install where host networking is limited).

See [DOCS.md](DOCS.md) for configuration details.
