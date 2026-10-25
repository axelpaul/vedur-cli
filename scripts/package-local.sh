#!/bin/sh
# Lay out a local release directory (same asset names as the Release workflow)
# from dist/vedur, for testing scripts/install.sh with --base-url file://...
set -eu
output="${1:-dist/release}"
case "$(uname -s)" in Linux) os=linux ;; Darwin) os=darwin ;; *) exit 2 ;; esac
case "$(uname -m)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) exit 2 ;; esac
asset="vedur-${os}-${arch}"
mkdir -p "$output/latest/download"
cp dist/vedur "$output/latest/download/$asset"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$output/latest/download" && sha256sum "$asset" > SHA256SUMS)
else
  (cd "$output/latest/download" && shasum -a 256 "$asset" > SHA256SUMS)
fi
echo "$output/latest/download/$asset"
