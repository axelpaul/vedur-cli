#!/bin/sh
set -eu

# Install a pinned release only after verifying its SHA-256 digest.
version=""
destination="${XDG_BIN_HOME:-$HOME/.local/bin}"
base_url="https://github.com/axelpaul/vedur-cli/releases/download"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) version="${2:-}"; shift 2 ;;
    --dest) destination="${2:-}"; shift 2 ;;
    --base-url) base_url="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! printf '%s\n' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Specify a pinned release, e.g. --version v1.2.3" >&2
  exit 2
fi

case "$(uname -s)" in
  Linux) platform=linux ;;
  Darwin) platform=darwin ;;
  *) echo "Unsupported operating system" >&2; exit 2 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) architecture=x64 ;;
  arm64|aarch64) architecture=arm64 ;;
  *) echo "Unsupported architecture" >&2; exit 2 ;;
esac

artifact="vedur-${version}-${platform}-${architecture}"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

curl --fail --location --silent --show-error "${base_url}/${version}/${artifact}" --output "$temporary/$artifact"
curl --fail --location --silent --show-error "${base_url}/${version}/${artifact}.sha256" --output "$temporary/$artifact.sha256"
expected=$(awk -v name="$artifact" '$2 == name { print $1 }' "$temporary/$artifact.sha256")
if [ -z "$expected" ]; then echo "Missing checksum for $artifact" >&2; exit 1; fi
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$temporary/$artifact" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$temporary/$artifact" | awk '{ print $1 }')
fi
if [ "$actual" != "$expected" ]; then echo "Checksum mismatch for $artifact" >&2; exit 1; fi

mkdir -p "$destination"
chmod 755 "$temporary/$artifact"
mv "$temporary/$artifact" "$destination/vedur"
echo "Installed vedur $version to $destination/vedur"
