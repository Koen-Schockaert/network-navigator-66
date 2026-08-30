# Releasing

How to cut an alpha, beta, or stable release of the NetScan desktop app.

## Channels

Three long-lived branches map to three release channels:

| Branch  | Channel | Tag pattern     | GitHub Release marked as |
| ------- | ------- | --------------- | ------------------------- |
| `alpha` | Alpha   | `vX.Y.Z-alpha.N` | prerelease                |
| `beta`  | Beta    | `vX.Y.Z-beta.N`  | prerelease                |
| `main`  | Stable  | `vX.Y.Z`         | latest release            |

Work flows `alpha` → `beta` → `main` via pull requests. Cut a release from whichever branch
you're promoting — the tag itself (not the branch) is what triggers a build.

## Cutting a release

From the target branch, with a clean working tree:

```bash
git checkout alpha              # or beta / main
git pull --ff-only

npm run release:alpha           # bump to next X.Y.Z-alpha.N, commit, tag, push
npm run release:beta            # bump to next X.Y.Z-beta.N, commit, tag, push
npm run release:patch           # stable: X.Y.(Z+1)  — also: release:minor, release:major
```

These wrap `npm version`, which:

1. bumps the `version` field in `package.json`,
2. commits it (`chore: release vX.Y.Z`),
3. creates an annotated tag `vX.Y.Z`,
4. and via the `postversion` script, pushes the commit and the tag to `origin`.

The tag push is what matters — pushing `vX.Y.Z` (matching `.github/workflows/release.yml`'s
`v*.*.*` trigger) kicks off the build.

To cut a specific version instead of the next semver bump, run `npm version 1.2.3 -m "chore:
release v%s"` directly (same commit/tag/push behavior).

## What CI does

`.github/workflows/release.yml` runs two stages:

1. **`create-release`** — creates the GitHub Release for the pushed tag up front (empty, no
   assets yet), marked prerelease if the tag contains `-alpha` or `-beta`.
2. **`build`** — a matrix of `ubuntu-latest` / `windows-latest` / `macos-latest`, each running
   `npm run package:linux` / `package:win` / `package:mac` (electron-builder), then uploading
   its installers **directly to the GitHub Release** as release assets.

A finished release has 7 assets: `.AppImage` + `.deb` (Linux), `.exe` NSIS installer
(Windows), and `.dmg` + `.zip` for both `arm64` and `x64` (macOS).

Installer builds upload straight to the release rather than through GitHub Actions'
build-artifact storage — that storage has its own, much smaller quota, and Electron
installers (100–200MB+ each) blow through it fast. Uploading as release assets sidesteps
that entirely.

`.github/workflows/ci.yml` runs lint + a desktop-SPA build on every push/PR to `main`,
`beta`, and `alpha` — a quick sanity check, independent of the release pipeline.

## Checking on a release

```bash
gh run list --workflow=release.yml     # build status
gh release view vX.Y.Z                 # published assets
```

## Fixing a bad tag

If a release build fails and you need to move a tag to a fixed commit instead of burning the
next version number: **`git push origin :refs/tags/vX.Y.Z` followed by re-pushing the tag can
report success locally without the change actually landing on GitHub** (seen in practice —
`git ls-remote` kept showing the old commit after a "successful" delete+push). Always verify
with `git ls-remote --tags origin | grep vX.Y.Z` after. If it's still wrong, move the ref
directly through the GitHub API instead of `git push`:

```bash
git push origin :refs/tags/vX.Y.Z                                   # delete
gh api -X DELETE repos/<owner>/<repo>/git/refs/tags/vX.Y.Z          # verify/force-delete if needed
gh api repos/<owner>/<repo>/git/refs -f ref="refs/tags/vX.Y.Z" -f sha="<commit-sha>"
```

Then re-check `gh run list --workflow=release.yml` to confirm a new run started for the
moved tag, and cancel any stale/duplicate runs from the earlier attempts with
`gh run cancel <run-id>`.

## Packaging notes

- Packaging config lives in `electron-builder.yml`. `core/` has zero npm runtime dependencies
  (Node builtins only — see `CLAUDE.md`), so the packaged app ships only `electron/`, `core/`,
  and the built `dist-app/` SPA — no `node_modules`.
- `package.json`'s `author` field must be in `"Name <email>"` form — electron-builder's Linux
  `.deb` target fails the build without an email in it.
- No code signing is configured. Windows builds are unsigned (SmartScreen will warn). macOS
  builds are unsigned and unnotarized, which on current macOS means Gatekeeper outright refuses
  to open them ("NetScan is damaged and can't be opened. Move it to the Trash.") rather than
  showing the older "unidentified developer" bypass prompt. This isn't corruption — it's the
  `com.apple.quarantine` flag macOS stamps on anything downloaded via a browser. Clear it after
  installing: `xattr -cr /Applications/NetScan.app`. Add signing certificates as GitHub Actions
  secrets and wire them into `electron-builder.yml`'s `mac.identity` / `win.certificateFile` /
  notarization config to remove this step entirely.
- Every macOS artifact name always carries its arch (`-arm64` / `-x64`, forced via
  `artifactName` in `electron-builder.yml`) — installing the wrong one for your Mac's chip
  still runs, just under Rosetta 2 translation, which makes the whole app uniformly slow
  (confirmed in practice via `sample <pid>` on a running instance showing near-100% CPU
  entirely in Rosetta runtime routines).
