# vedur-cli

`vedur` is a small, agent-oriented CLI for selected public APIs from the Icelandic Met Office (Veðurstofa Íslands). It is intentionally not a generic HTTP proxy: it resolves stations, normalises the useful bits, and keeps a stable JSON envelope.

## Install and use

```sh
bun install
bun run dev stations find Reykjavík --active --json
bun run dev now Reykjavík --json
bun run dev warnings --json
bun run dev quakes --since 24h --min-magnitude 2 --json
```

Commands:

- `stations find <query>` searches station metadata.
- `now <place|station-id>`, `now --station ID`, and `now --region ID` return latest 10-minute automatic observations.
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

The first release deliberately covers observations, warnings, and earthquakes. Forecasts and a raw endpoint escape hatch are non-goals until a concrete use case warrants them.
