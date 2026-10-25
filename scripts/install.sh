#!/bin/sh
# Install the prebuilt vedur binary from GitHub Releases, verifying its SHA-256.
#   curl -fsSL https://raw.githubusercontent.com/axelpaul/vedur-cli/main/scripts/install.sh | sh
#   sh install.sh [--version vX.Y.Z] [--dest DIR] [--base-url URL]
# Defaults: latest release, installed to ${XDG_BIN_HOME:-$HOME/.local/bin}.
set -eu

version=""
destination="${XDG_BIN_HOME:-$HOME/.local/bin}"
base_url="https://github.com/axelpaul/vedur-cli/releases"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) version="${2:-}"; shift 2 ;;
    --dest) destination="${2:-}"; shift 2 ;;
    --base-url) base_url="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ -n "$version" ]; then
  if ! printf '%s\n' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "--version must look like v1.2.3" >&2; exit 2
  fi
  download="${base_url}/download/${version}"
else
  download="${base_url}/latest/download"
fi

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "Unsupported operating system; on Windows download vedur-windows-x64.exe from ${base_url}" >&2; exit 2 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) echo "Unsupported architecture" >&2; exit 2 ;;
esac

asset="vedur-${os}-${arch}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

curl --fail --location --silent --show-error "${download}/${asset}" --output "$tmp/$asset"
curl --fail --location --silent --show-error "${download}/SHA256SUMS" --output "$tmp/SHA256SUMS"
expected=$(awk -v name="$asset" '$2 == name || $2 == "*" name { print $1 }' "$tmp/SHA256SUMS")
if [ -z "$expected" ]; then echo "No checksum for $asset in SHA256SUMS" >&2; exit 1; fi
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$tmp/$asset" | awk '{ print $1 }')
fi
if [ "$actual" != "$expected" ]; then echo "Checksum mismatch for $asset" >&2; exit 1; fi

mkdir -p "$destination"
chmod 755 "$tmp/$asset"
mv "$tmp/$asset" "$destination/vedur"
echo "Installed vedur $("$destination/vedur" --version) to $destination/vedur"
case ":$PATH:" in *":$destination:"*) ;; *) echo "Note: $destination is not on your PATH." ;; esac
