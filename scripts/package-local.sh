#!/bin/sh
set -eu

version="${1:-}"
output="${2:-dist/release}"
if ! printf '%s\n' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Usage: package-local.sh vX.Y.Z [output-dir]" >&2
  exit 2
fi
case "$(uname -s)" in Linux) platform=linux ;; Darwin) platform=darwin ;; *) exit 2 ;; esac
case "$(uname -m)" in x86_64|amd64) architecture=x64 ;; arm64|aarch64) architecture=arm64 ;; *) exit 2 ;; esac
artifact="vedur-${version}-${platform}-${architecture}"
mkdir -p "$output/$version"
cp dist/vedur "$output/$version/$artifact"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$output/$version" && sha256sum "$artifact" > "$artifact.sha256")
else
  (cd "$output/$version" && shasum -a 256 "$artifact" > "$artifact.sha256")
fi
echo "$output/$version/$artifact"
