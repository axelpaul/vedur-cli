# vedur-cli

`vedur` is a small, agent-oriented CLI and MCP server for public Icelandic Met Office (Veðurstofa Íslands) data: latest observations, spot forecasts, weather warnings and earthquakes. It is intentionally not a generic HTTP proxy: it resolves places to stations and forecast points, normalises the useful bits, and keeps a stable JSON envelope.

> Unofficial — not affiliated with the Icelandic Met Office (Veðurstofa Íslands).

## Install

Requires [Bun](https://bun.sh) ≥ 1.1.

```sh
bun add -g github:axelpaul/vedur-cli     # install
bun add -g github:axelpaul/vedur-cli     # update (re-run; pulls the latest default branch)
bun remove -g vedur-cli                  # uninstall
```

This puts `vedur` in `~/.bun/bin`. Check with `vedur --version`.

**Prebuilt binaries** (no Bun needed): download `vedur-<os>-<arch>` for Linux, macOS or Windows from the [Releases page](https://github.com/axelpaul/vedur-cli/releases), or on Linux/macOS use the installer, which fetches the latest release and verifies it against `SHA256SUMS`:

```sh
curl -fsSL https://raw.githubusercontent.com/axelpaul/vedur-cli/main/scripts/install.sh | sh
# options: --version v0.1.0 (pin a release), --dest ~/bin (default: ~/.local/bin)
```

## Authentication

No authentication needed. All upstream APIs are public.

## CLI usage

```sh
vedur now Reykjavík                         # latest observation near a place
vedur now Hallgrímskirkja --json            # addresses / landmarks are geocoded within Iceland
vedur now --station 1                       # explicit station ID
vedur forecast Akureyri --hours 12          # hourly spot forecast
vedur forecast --near 65.6835,-18.1002      # by coordinates
vedur forecast --point 1234                 # exact Veður forecast-point ID
vedur stations find Reykjavík --active
vedur stations nearest "Hallgrímskirkja"
vedur observations latest --station 1 --aggregation hour --parameters all
vedur warnings --category Met
vedur quakes --since 24h --min-magnitude 2
vedur quakes --near 63.88,-22.45 --radius-km 20 --since 7d
vedur locations add home "Dæmigata 1, 101 Reykjavík"
vedur forecast home
vedur serve                                 # MCP server over stdio
```

Commands:

- `now <place|address|saved-name|station-id>`, `now --near lat,lon`, `now --station ID`, and `now --region ID` return latest 10-minute automatic observations. Places and addresses are geocoded within Iceland, then matched to a nearby active automatic station using both distance and elevation difference. The selected station and rationale are included in output; the address itself is never cached.
- `stations nearest <place|address>` (or `--near lat,lon`) shows the station selection without making an observation call.
- `stations find <query>` searches station metadata (`--active`, `--limit N`).
- `forecast <place|address>` (or `--near lat,lon`) resolves the location and selects the closest virtual/spot-forecast point from Veður's public forecast-map catalogue. `forecast --point ID` selects an exact point. Both return the next 24 hours of modelled data; use `--hours N` for 1–240 hours. This is model output, not a live observation; Veður currently publishes it through `gottvedur.is`, outside the versioned `api.vedur.is` observations API. The public point catalogue is cached for 24 hours.
- `observations latest --station ID|--region ID` supports `--aggregation 10min|hour|day|month|year` and `--parameters basic|all`.
- `warnings [--category name]` returns active CAP warnings (including the raw CAP payload).
- `quakes` supports `--since`, `--until` (ISO 8601 or durations like `30m`, `24h`, `7d`, `2w`), `--near lat,lon`, `--radius-km` (default 50), `--min-magnitude`, `--manual`, `--automatic`, and `--limit` (default 100).
- `locations add <name> <place|address> [--point ID]` saves a local named location, including its resolved coordinates and preferred forecast point. `locations list` and `locations remove <name>` inspect and manage them. `now <name>` and `forecast <name>` then work without another geocoder lookup.

Place-name station matching never silently chooses a fuzzy station: it exits with `STATION_NOT_FOUND` or `AMBIGUOUS_STATION` and candidates. With `--json`, successes always use:

```json
{"source":"Icelandic Met Office","retrievedAt":"…","apiVersions":{"weather":"2026-02-17"},"data":[]}
```

Errors use JSON on stderr with `--json`. Exit code `2` means invalid input/resolution, `3` network/upstream failure, and `4` an unexpected upstream schema. The CLI retries transient GET failures up to three times. It has no telemetry.

## MCP server

`vedur serve` runs a local MCP server over stdio. Every tool calls the same code as the matching CLI command (`src/lib/ops.ts`).

| Tool | Access | Description |
| --- | --- | --- |
| `now` | read | Latest 10-minute observation near a place/address/saved location/coordinates, or for a station/region ID (`vedur now`) |
| `forecast` | read | Hourly spot forecast for a place/address/saved location/coordinates or forecast-point ID, 1–240 h (`vedur forecast`) |
| `observations_latest` | read | Latest observations for a station or region at 10min/hour/day/month/year aggregation (`vedur observations latest`) |
| `stations_find` | read | Search weather stations by name (`vedur stations find`) |
| `stations_nearest` | read | Select the nearest active automatic station to a place or coordinates (`vedur stations nearest`) |
| `warnings` | read | Active CAP weather warnings, max 50, without the raw CAP payload (`vedur warnings`) |
| `quakes` | read | Recent earthquakes with time, magnitude, area and mode filters (`vedur quakes`) |
| `locations_list` | read | List locally saved locations (`vedur locations list`) |
| `location_add` | write (local file) | Save a named location; requires `confirmName` equal to `name`, and `replace=true` to overwrite (`vedur locations add`) |
| `location_remove` | write (local file) | Remove a saved location; requires `confirmName` equal to `name` (`vedur locations remove`) |

The write tools only change the local `locations.json` file and only appear when the server is started with `VEDUR_MCP_ENABLE_WRITES=1`. The confirmation argument is an accident guard, not a substitute for the MCP client asking the user. Upstream weather text is data, not instructions.

**Claude Code:**

```sh
claude mcp add vedur -- vedur serve
# with writes enabled:
claude mcp add vedur -e VEDUR_MCP_ENABLE_WRITES=1 -- vedur serve
```

**Claude Desktop / Cursor / other JSON clients:**

```json
{
  "mcpServers": {
    "vedur": {
      "command": "vedur",
      "args": ["serve"],
      "env": { "VEDUR_MCP_ENABLE_WRITES": "1" }
    }
  }
}
```

Omit `env` for read-only use. GUI apps may not have `~/.bun/bin` on their `PATH`; if the server fails to start, use the absolute path printed by `which vedur` as `command`.

## Configuration

| Variable | Description |
| --- | --- |
| `VEDUR_MCP_ENABLE_WRITES` | Set to `1` to expose `location_add` / `location_remove` in the MCP server |
| `VEDUR_GEOCODER_URL` | Alternative GeoJSON or ArcGIS-compatible address endpoint (default: Nominatim/OpenStreetMap restricted to Iceland) |
| `VEDUR_API_VERSION_WEATHER`, `VEDUR_API_VERSION_CAP`, `VEDUR_API_VERSION_QUAKES` | Override a pinned API version while migrating (defaults: `2026-02-17`, `2026-04-14`, `2026-07-01`) |
| `VEDUR_BASE_URL`, `VEDUR_FORECAST_BASE_URL` | Override `https://api.vedur.is` / `https://gottvedur.is` (for tests) |
| `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` | Base directories for config and cache |

Files:

- Saved locations: `$XDG_CONFIG_HOME/vedur-cli/locations.json` (default `~/.config/vedur-cli/locations.json`). They are never sent anywhere except when a weather lookup needs their coordinates.
- Cache (public metadata only, 24 h): `$XDG_CACHE_HOME/vedur-cli/stations.json` and `forecast-stations.json` (default under `~/.cache`).

Upstream services: `api.vedur.is` (observations, warnings, earthquakes), `gottvedur.is` (spot forecasts), `nominatim.openstreetmap.org` (geocoding; © OpenStreetMap contributors) and `api.open-meteo.com` (terrain elevation for station selection; optional).

Data is supplied by the [Icelandic Met Office API](https://api.vedur.is/), which is credited in every JSON response. Check its terms and attribution requirements before redistributing derived data.

## Development

```sh
bun install
bun run check            # typecheck + tests (incl. MCP stdio tests)
bun run dev now Reykjavík --json
bun run build:binary     # dist/vedur
bun run smoke:mcp        # MCP smoke test against dist/vedur (add --live to call the real APIs)
```

To test the installer locally: `bun run build:binary && sh scripts/package-local.sh /tmp/vedur-rel && sh scripts/install.sh --base-url file:///tmp/vedur-rel --dest /tmp/vedur-bin`.

Releases: bump `version` in `package.json`, then push a matching `vX.Y.Z` tag. The Release workflow runs the checks, compiles `vedur-{linux,darwin}-{x64,arm64}` and `vedur-windows-x64.exe`, and publishes them with `SHA256SUMS`.

The CLI deliberately avoids a raw endpoint escape hatch. Forecast-point support exists because it fills the concrete gap between a local model forecast and the nearest physical observation station.
