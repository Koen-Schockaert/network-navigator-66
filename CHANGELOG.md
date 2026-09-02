# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.9] - 2026-09-02

### Added

- Export a network's device inventory as JSON.
- Webhook notifications (e.g. for scan completion / device status changes).
- Online update of the OUI (MAC vendor) database.
- Quick / Standard / Deep scan profiles.
- API token support for the Docker/server deployment (`NETSCAN_API_TOKEN`).
- Per-profile port configuration: view, add, remove or reset the TCP ports
  probed by the Quick / Standard / Deep scan profiles.
- Rescan a single device's ports on demand from its details panel, choosing
  the Quick / Standard / Deep profile.

### Changed

- Moved vendor database and webhook settings out of the Networks tab into a
  new Settings tab, which also houses the scan profile port configuration in
  collapsible sections.

## [1.0.8] - 2026-08-31

### Fixed

- Live scan progress events could be lost due to a race condition in `subscribe()`.

## [1.0.7] - 2026-08-31

### Added

- Home Assistant Ingress support for the NetScan add-on.

### Fixed

- Incorrect webui URL format in the Home Assistant add-on config.

## [1.0.6] - 2026-08-31

### Added

- Home Assistant add-on support.

## [1.0.5] - 2026-08-31

### Added

- Ping a device directly from its details view.

## [1.0.4] - 2026-08-31

### Added

- Improved device details view, with an accompanying README.

## [1.0.3] - 2026-08-31

### Added

- Enhanced overview dashboard.

### Docs

- Documented the macOS Gatekeeper quarantine workaround for unsigned builds.
- README updates.

## [1.0.2] - 2026-08-30

### Fixed

- Release artifacts are always suffixed with their architecture, preventing
  Rosetta installs on Apple Silicon.

## [1.0.1] - 2026-08-30

### Fixed

- Stopped rebuilding DataGrid columns and remounting tabs on every render.

### Docs

- Added `RELEASING.md` describing the release process.

## [1.0.0] - 2026-08-30

### Added

- Initial release of NetScan: LAN device discovery (ICMP/ARP/TCP), device
  inventory with hostname, MAC + vendor lookup, online status and open
  ports, and scan history.
- Three deployment shells: Lovable web preview (demo data), Electron desktop
  app, and Docker/server build with a shared `core/` scanning engine.
- Password vault feature.
- GitHub release workflow using electron-builder for desktop packages.

[Unreleased]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.9...HEAD
[1.0.9]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Koen-Schockaert/network-navigator-66/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Koen-Schockaert/network-navigator-66/releases/tag/v1.0.0
