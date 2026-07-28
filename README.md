# vedur-cli

`vedur` is a small, agent-oriented CLI for selected public APIs from the Icelandic Met Office (Veðurstofa Íslands). It is intentionally not a generic HTTP proxy: it resolves stations, normalises the useful bits, and keeps a stable JSON envelope.

## Install and use

```sh
bun install
bun run dev stations find Reykjavík --active --json
bun run dev now Reykjavík --json
bun run dev now "Eyrarskógur 56, 301" --json
bun run dev forecast "Eyrarskógur 56, 301" --hours 24 --json
bun run dev warnings --json
bun run dev quakes --since 24h --min-magnitude 2 --json
```

Commands:

- `stations find <query>` searches station metadata.
- `now <place|address|station-id>`, `now --near lat,lon`, `now --station ID`, and `now --region ID` return latest 10-minute automatic observations. Places and addresses are geocoded within Iceland, then matched to a nearby active automatic station using both distance and elevation difference. The selected station and rationale are included in output; the address itself is never cached.
- `stations nearest <place|address>` (or `--near lat,lon`) shows the station selection without making an observation call.
- `forecast <place|address>` (or `--near lat,lon`) resolves the location and selects the closest virtual/spot-forecast point from Veður's public forecast map catalogue. `forecast --point ID` selects an exact point (for example, Melahverfi is `9054`). Both return the next 24 hours of modelled data; use `--hours N` for 1–240 hours. This is model output, not a live observation; Veður currently publishes it through `gottvedur.is`, outside the versioned `api.vedur.is` observations API. The public point catalogue is cached for 24 hours.

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

The CLI deliberately avoids a raw endpoint escape hatch. Forecast-point support exists because it fills the concrete gap between a local model forecast and the nearest physical observation station.
