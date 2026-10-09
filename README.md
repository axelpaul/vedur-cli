# vedur-cli

`vedur` is a small, agent-oriented CLI for selected public APIs from the Icelandic Met Office (Veðurstofa Íslands). It is intentionally not a generic HTTP proxy: it resolves stations, normalises the useful bits, and keeps a stable JSON envelope.

## Install and use

```sh
bun install
bun run dev stations find Reykjavík --active --json
bun run dev now Reykjavík --json
bun run dev now "Eyrarskógur 56, 301" --json
bun run dev forecast "Eyrarskógur 56, 301" --hours 24 --json
bun run dev locations add cabin "Eyrarskógur 56, 301"
bun run dev forecast cabin --json
bun run dev warnings --json
bun run dev quakes --since 24h --min-magnitude 2 --json
```

## MCP server (local stdio)

The same CLI also serves four read-only MCP tools: `forecast`, `now`,
`stations_find`, and `warnings`. The tools use the same API and location
resolution code as the CLI. They never request credentials or change an account.

Build a standalone executable and register its absolute path with your MCP
client, passing `serve` as the argument:

```sh
bun install --frozen-lockfile
bun run check
bun run build:binary
realpath dist/vedur
```

For example, a client that accepts JSON MCP configuration can use:

```json
{
  "mcpServers": {
    "vedur": {
      "command": "/absolute/path/to/vedur",
      "args": ["serve"]
    }
  }
}
```

The path must be replaced with the actual absolute path. MCP uses stdout for
the protocol, so do not redirect human-facing logs there. Upstream weather text
is data, not instructions. This source-build path is the pilot. A
checksum-verifying installer has been tested locally on Linux, but no release
binaries or public catalogue entry have been published yet.

The MCP server also offers `locations_list`. Local write tools `location_add`
and `location_remove` appear only when launched with
`VEDUR_MCP_ENABLE_WRITES=1`. They require the exact location name repeated in
`confirmName`; adding will not overwrite an existing name unless `replace=true`.
This is an accident guard, not a substitute for the MCP client obtaining the
user's permission. A compiled-binary add/list/remove round trip passed using
an isolated temporary configuration directory; no saved household locations
were changed.

Commands:

- `stations find <query>` searches station metadata.
- `now <place|address|station-id>`, `now --near lat,lon`, `now --station ID`, and `now --region ID` return latest 10-minute automatic observations. Places and addresses are geocoded within Iceland, then matched to a nearby active automatic station using both distance and elevation difference. The selected station and rationale are included in output; the address itself is never cached.
- `stations nearest <place|address>` (or `--near lat,lon`) shows the station selection without making an observation call.
- `forecast <place|address>` (or `--near lat,lon`) resolves the location and selects the closest virtual/spot-forecast point from Veður's public forecast map catalogue. `forecast --point ID` selects an exact point (for example, Melahverfi is `9054`). Both return the next 24 hours of modelled data; use `--hours N` for 1–240 hours. This is model output, not a live observation; Veður currently publishes it through `gottvedur.is`, outside the versioned `api.vedur.is` observations API. The public point catalogue is cached for 24 hours.
- `locations add <name> <place|address>` saves a local named location, including its resolved coordinates and preferred forecast point. `locations list` and `locations remove <name>` inspect and manage them. `now <name>` and `forecast <name>` then work without another geocoder lookup. Saved locations live only in `$XDG_CONFIG_HOME/vedur-cli/locations.json` (or `~/.config/vedur-cli/locations.json`); they are never sent anywhere except when a weather lookup requires their coordinates.

Address lookup defaults to Nominatim/OpenStreetMap (restricted to Iceland; attribution: © OpenStreetMap contributors). Set `VEDUR_GEOCODER_URL` to use another GeoJSON or ArcGIS-compatible address endpoint.
- `observations latest --station ID|--region ID` supports `--aggregation 10min|hour|day|month|year` and `--parameters basic|all`.
- `warnings [--category name]` returns active CAP warnings.
- `quakes` supports `--since`, `--until`, `--near lat,lon`, `--radius-km`, `--min-magnitude`, `--manual`, `--automatic`, and `--limit`.

Place-name matching never silently chooses a fuzzy station: it exits with `STATION_NOT_FOUND` or `AMBIGUOUS_STATION` and candidates. JSON successes always use:

```json
{"source":"Icelandic Met Office","retrievedAt":"…","apiVersions":{"weather":"2026-02-17"},"data":[]}
```

Errors use JSON on stderr with `--json`. Exit code `2` means invalid input/resolution, `3` network/upstream failure, and `4` an unexpected upstream schema. The CLI retries transient GET failures up to three times. It has no authentication, telemetry, or write operations.

## API compatibility

The header-pinned versions are Weather `2026-02-17`, CAP `2026-04-14`, and Quakes `2026-07-01`. Override an individual pin only while migrating with `VEDUR_API_VERSION_WEATHER`, `VEDUR_API_VERSION_CAP`, or `VEDUR_API_VERSION_QUAKES`. `VEDUR_BASE_URL` exists for tests.

Data is supplied by the [Icelandic Met Office API](https://api.vedur.is/), which is credited in every JSON response. Check its terms and attribution requirements before redistributing derived data.

## Development

```sh
bun install
bun run check
bun run build
```

For a local packaging smoke test, compile the binary (`bun run build:binary`),
then run `sh scripts/package-local.sh v0.1.0 /tmp/vedur-release-test` and
`sh scripts/install.sh --version v0.1.0 --base-url
file:///tmp/vedur-release-test --dest /tmp/vedur-install-test`. The installer
downloads a version-specific binary and SHA-256 file and checks the digest
before moving the binary into the destination. The default URL expects matching
tagged GitHub release assets; it will not work until such a release exists.

The CLI deliberately avoids a raw endpoint escape hatch. Forecast-point support exists because it fills the concrete gap between a local model forecast and the nearest physical observation station.
