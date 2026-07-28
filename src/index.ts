#!/usr/bin/env bun
import { stations, latest } from "./api/weather.ts";
import { warnings } from "./api/cap.ts";
import { quakes } from "./api/quakes.ts";
import { distanceKm } from "./lib/geo.ts";
import { fail } from "./lib/error.ts";
import { parseTime } from "./lib/time.ts";
import { printError, success } from "./format/output.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
function flag(name: string): string | undefined { const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`)); if (i < 0) return undefined; return args[i]!.includes("=") ? args[i]!.split("=").slice(1).join("=") : args[i + 1]; }
function has(name: string): boolean { return args.some(a => a === `--${name}` || a.startsWith(`--${name}=`)); }
function pos(): string[] { const consumed = new Set<number>(); for (let i = 0; i < args.length; i++) if (args[i]!.startsWith("--") && !args[i]!.includes("=") && !["json", "active", "all", "manual", "automatic"].includes(args[i]!.slice(2))) consumed.add(i + 1); return args.filter((a, i) => !a.startsWith("-") && !consumed.has(i)); }
function help(): void { console.log(`vedur — Icelandic Met Office CLI (CC BY attribution: vedur.is)

Commands:
  vedur stations find <query> [--active] [--limit N] [--json]
  vedur now <place|station-id> [--json]
  vedur now --station <id> | --region <1..12> [--json]
  vedur observations latest --station <id>|--region <id> [--aggregation 10min|hour|day|month|year] [--parameters basic|all] [--json]
  vedur warnings [--category <name>] [--json]
  vedur quakes [--since 24h] [--until ISO] [--near lat,lon] [--radius-km N] [--min-magnitude N] [--manual|--automatic] [--limit N] [--json]`); }
async function resolve(value: string): Promise<number> { if (/^\d+$/.test(value)) return Number(value); const candidates = await stations(value, true); const exact = candidates.filter(s => s.type === "sj" && s.name?.localeCompare(value, "is", { sensitivity: "accent" }) === 0); if (exact.length === 1) return exact[0]!.id; if (candidates.length === 0) fail("STATION_NOT_FOUND", `No active station matching '${value}'.`); fail("AMBIGUOUS_STATION", `Could not resolve '${value}' to one automatic station.`, candidates); }
async function main(): Promise<void> {
  const p = pos(); const command = p[0];
  if (!command || has("help") || command === "help") return help();
  if (command === "stations" && p[1] === "find") { const query = p.slice(2).join(" "); if (!query) fail("MISSING_QUERY", "Provide a station search query."); const data = await stations(query, has("active")); return success(data.slice(0, Number(flag("limit") || 10)), json, ["weather"]); }
  if (command === "observations" && p[1] === "latest") { const station = flag("station"), region = flag("region"); if (!station && !region) fail("MISSING_LOCATION", "Use --station or --region."); const aggregation = flag("aggregation") || "10min"; if (!/^(10min|hour|day|month|year)$/.test(aggregation)) fail("INVALID_AGGREGATION", "Use 10min, hour, day, month, or year."); return success(await latest({ stationId: station ? Number(station) : undefined, regionId: region ? Number(region) : undefined, aggregation, parameters: flag("parameters") || "basic" }), json, ["weather"]); }
  if (command === "now") { const station = flag("station"), region = flag("region"); const id = station ? Number(station) : region ? undefined : await resolve(p[1] || fail("MISSING_LOCATION", "Provide a place, --station, or --region.")); return success(await latest({ stationId: id, regionId: region ? Number(region) : undefined, aggregation: "10min", parameters: "basic" }), json, ["weather"]); }
  if (command === "warnings") return success(await warnings(flag("category")), json, ["cap"]);
  if (command === "quakes") { const since = parseTime(flag("since") || "24h"), until = flag("until") ? parseTime(flag("until")!) : new Date().toISOString(); const mode = has("manual") ? "manual" : has("automatic") ? "automatic" : undefined; const query: Record<string, string | number | string[]> = { start_time: since, end_time: until }; const minMagnitude = flag("min-magnitude"); if (minMagnitude) query.size_min = minMagnitude; if (mode) query.evaluation_mode = mode; let data = await quakes(query); const near = flag("near"); if (near) { const [lat, lon] = near.split(",").map(Number); const radius = Number(flag("radius-km") || 50); if (!Number.isFinite(lat) || !Number.isFinite(lon)) fail("INVALID_LOCATION", "--near must be latitude,longitude."); data = data.filter(q => distanceKm(lat!, lon!, q.latitude, q.longitude) <= radius); } return success(data.sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, Number(flag("limit") || 100)), json, ["quakes"]); }
  fail("UNKNOWN_COMMAND", `Unknown command '${command}'. Run vedur --help.`);
}
main().catch(error => { process.exitCode = printError(error, json); });
