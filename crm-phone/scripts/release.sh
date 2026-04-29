#!/usr/bin/env bash
#
# Build + ship a softphone release in a single atomic command.
#
#   ./scripts/release.sh                  # build, upload to VM, create GitHub release
#   ./scripts/release.sh --no-github      # build, upload to VM only (skip GH release)
#   ./scripts/release.sh --no-vm          # build only (don't ship anywhere — debug)
#
# Why "atomic": the previous workflow was `pnpm run pack` followed by a
# separate manual SCP step. The SCP kept getting skipped, so operators on
# older versions saw "up to date" forever. This script bundles both steps
# so it's structurally impossible to ship a build to GitHub but forget
# the VM (or vice-versa).
#
# Auto-update reads from the VM (https://crm28.asg.ge/downloads/phone/),
# not from GitHub releases — see docs/SOFTPHONE_RELEASE_PROCEDURE.md for
# why. The GitHub release step here is for changelog / audit trail only;
# operators don't fetch from it.

set -euo pipefail

# Resolve repo root regardless of where the script is invoked from
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR/.."

VERSION=$(node -p "require('./package.json').version")
INSTALLER="release/CRM28-Phone-Setup-${VERSION}.exe"
BLOCKMAP="${INSTALLER}.blockmap"
LATEST_YML="release/latest.yml"

VM_USER="${SOFTPHONE_VM_USER:-Administrator}"
VM_HOST="${SOFTPHONE_VM_HOST:-192.168.65.110}"
VM_PATH="${SOFTPHONE_VM_PATH:-C:/crm/downloads/phone/}"
SSH_KEY="${SOFTPHONE_SSH_KEY:-$HOME/.ssh/id_ed25519_vm}"

SKIP_GH=0
SKIP_VM=0
for arg in "$@"; do
  case "$arg" in
    --no-github) SKIP_GH=1 ;;
    --no-vm)     SKIP_VM=1 ;;
    -h|--help)
      cat <<EOF
Usage: ./scripts/release.sh [flags]

Build + ship a softphone release in a single atomic command.

Flags:
  --no-github   skip the GitHub release step (still uploads to VM)
  --no-vm       skip the VM upload step (build only — debug)
  -h, --help    show this message

Env var overrides (defaults sufficient for production):
  SOFTPHONE_VM_USER   ssh user on the VM            (default: Administrator)
  SOFTPHONE_VM_HOST   VM IP / hostname              (default: 192.168.65.110)
  SOFTPHONE_VM_PATH   target dir on VM (must end /) (default: C:/crm/downloads/phone/)
  SOFTPHONE_SSH_KEY   path to private key           (default: ~/.ssh/id_ed25519_vm)

See docs/SOFTPHONE_RELEASE_PROCEDURE.md for the full procedure.
EOF
      exit 0
      ;;
    *) echo "Unknown flag: $arg (try --help)" >&2; exit 2 ;;
  esac
done

echo "==> Building softphone v${VERSION}"
pnpm run build
pnpm exec electron-builder --win

# Verify electron-builder produced what we expect at the names we expect.
# If artifactName drifted, the upload step would silently 404 operators.
test -f "$INSTALLER"  || { echo "ERROR: $INSTALLER missing — check artifactName in electron-builder.yml" >&2; exit 1; }
test -f "$BLOCKMAP"   || { echo "ERROR: $BLOCKMAP missing"  >&2; exit 1; }
test -f "$LATEST_YML" || { echo "ERROR: $LATEST_YML missing" >&2; exit 1; }

# Cross-check: latest.yml's `path:` field must match the installer file
# we're about to upload. If they disagree, the auto-updater downloads
# garbage. Catches drift between electron-builder.yml's artifactName and
# the actual artifact electron-builder produced.
LATEST_PATH=$(awk -F': ' '/^path:/ { print $2; exit }' "$LATEST_YML" | tr -d '\r"')
EXPECTED_PATH="CRM28-Phone-Setup-${VERSION}.exe"
if [ "$LATEST_PATH" != "$EXPECTED_PATH" ]; then
  echo "ERROR: latest.yml says path=$LATEST_PATH but expected $EXPECTED_PATH" >&2
  exit 1
fi

if [ "$SKIP_VM" = "1" ]; then
  echo "==> Skipping VM upload (--no-vm)"
else
  echo "==> Uploading to VM (${VM_HOST}:${VM_PATH})"
  test -f "$SSH_KEY" || { echo "ERROR: SSH key not found at $SSH_KEY" >&2; exit 1; }

  scp -i "$SSH_KEY" -o ConnectTimeout=15 \
    "$INSTALLER" "$BLOCKMAP" "$LATEST_YML" \
    "${VM_USER}@${VM_HOST}:${VM_PATH}"

  # Refresh the version-less stable filename. The website's "Download
  # Phone App" buttons (settings dropdown + the bridge-unreachable
  # banner) point at this URL so they don't need a code change every
  # release. nginx rewrites Content-Disposition so the browser saves
  # it with the version-less name.
  echo "==> Refreshing stable filename CRM28-Phone-Setup.exe -> v${VERSION}"
  ssh -i "$SSH_KEY" -o ConnectTimeout=15 "${VM_USER}@${VM_HOST}" \
    "Copy-Item -Force 'C:\\crm\\downloads\\phone\\CRM28-Phone-Setup-${VERSION}.exe' 'C:\\crm\\downloads\\phone\\CRM28-Phone-Setup.exe'"

  # Verify the public URLs serve the new version. Catches: (a) the VM
  # path was wrong, (b) nginx isn't serving from where we uploaded,
  # (c) we uploaded to a stale clone. Cache-buster query string + no-cache
  # headers prevent any reverse proxy from serving a stale copy of
  # `latest.yml` for a few seconds after upload (would falsely fail).
  echo "==> Verifying https://crm28.asg.ge/downloads/phone/latest.yml"
  REMOTE_VERSION=$(curl -fsSL \
    -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
    "https://crm28.asg.ge/downloads/phone/latest.yml?cb=$$$(date +%s)" \
    | awk -F': ' '/^version:/ { print $2; exit }' | tr -d '\r"' || true)
  if [ "$REMOTE_VERSION" != "$VERSION" ]; then
    echo "ERROR: VM serves version='$REMOTE_VERSION' after upload — expected $VERSION" >&2
    echo "       Auto-update will not work for this release." >&2
    exit 1
  fi
  echo "    OK — auto-update feed serves v${VERSION}"

  # Cross-check stable filename — its Content-Length must match the
  # versioned installer we uploaded. If the SSH Copy-Item silently
  # failed (or someone manually pinned an old file), the site
  # download button serves a stale build while auto-update serves
  # the new one — two URLs out of sync, hardest class of bug to
  # diagnose later.
  echo "==> Verifying https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup.exe"
  STABLE_SIZE=$(curl -fsSI \
    -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
    "https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup.exe?cb=$$$(date +%s)" \
    | awk 'tolower($1) == "content-length:" { print $2; exit }' | tr -d '\r')
  EXPECTED_SIZE=$(stat -c %s "$INSTALLER" 2>/dev/null || stat -f %z "$INSTALLER")
  if [ "$STABLE_SIZE" != "$EXPECTED_SIZE" ]; then
    echo "ERROR: stable URL serves ${STABLE_SIZE} bytes — expected ${EXPECTED_SIZE} (matching v${VERSION})" >&2
    echo "       Website download button will give users a stale installer." >&2
    exit 1
  fi
  echo "    OK — stable download URL serves v${VERSION} (${STABLE_SIZE} bytes)"
fi

if [ "$SKIP_GH" = "1" ]; then
  echo "==> Skipping GitHub release (--no-github)"
elif ! command -v gh > /dev/null 2>&1; then
  echo "==> Skipping GitHub release (gh CLI not installed)"
elif ! gh auth status > /dev/null 2>&1; then
  echo "==> Skipping GitHub release (gh not authenticated)"
else
  TAG="v${VERSION}"
  if gh release view "$TAG" > /dev/null 2>&1; then
    echo "==> Skipping GitHub release ($TAG already exists)"
  else
    echo "==> Creating GitHub release $TAG"
    gh release create "$TAG" "$INSTALLER" "$BLOCKMAP" "$LATEST_YML" \
      --title "CRM28 Phone v${VERSION}" \
      --notes "Auto-update is served from https://crm28.asg.ge/downloads/phone/. Operators get this release automatically on next launch — no manual download needed."
  fi
fi

echo
echo "Done. v${VERSION} is live."
echo "  Auto-update feed:  https://crm28.asg.ge/downloads/phone/latest.yml"
echo "  Direct download:   https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup-${VERSION}.exe"
