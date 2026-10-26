#!/usr/bin/env bun
import pkg from "../package.json";
import { stations, latest } from "./api/weather.ts";
import { warnings } from "./api/cap.ts";
import { quakes } from "./api/quakes.ts";
import { distanceKm } from "./lib/geo.ts";
import { fail } from "./lib/error.ts";
import { parseTime } from "./lib/time.ts";
import { printError, success } from "./format/output.ts";
import { geocode, parseNear, selectNearestStation } from "./lib/location.ts";
import { forecastPoint, nearestForecastPoint } from "./api/forecast.ts";
import { addLocation, asResolvedLocation, listLocations, removeLocation, savedLocation } from "./lib/locations.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
function flag(name: string): string | undefined { const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`)); if (i < 0) return undefined; return args[i]!.includes("=") ? args[i]!.split("=").slice(1).join("=") : args[i + 1]; }
function has(name: string): boolean { return args.some(a => a === `--${name}` || a.startsWith(`--${name}=`)); }
function pos(): string[] { const consumed = new Set<number>(); for (let i = 0; i < args.length; i++) if (args[i]!.startsWith("--") && !args[i]!.includes("=") && !["json", "active", "all", "manual", "automatic"].includes(args[i]!.slice(2))) consumed.add(i + 1); return args.filter((a, i) => !a.startsWith("-") && !consumed.has(i)); }
function help(): void { console.log(`vedur — Icelandic Met Office CLI (CC BY attribution: vedur.is)

Commands:
  vedur stations find <query> [--active] [--limit N] [--json]
  vedur now <place|address|station-id> [--near lat,lon] [--json]
  vedur now --station <id> | --region <1..12> [--json]
  vedur forecast <place|address> [--near lat,lon] [--hours N] [--json]
  vedur forecast --point <id> [--hours N] [--json]
  vedur locations add <name> <place|address> [--point ID] [--json]
  vedur locations list [--json]
  vedur locations remove <name> [--json]
  vedur stations nearest <place|address> | --near lat,lon [--json]
  vedur observations latest --station <id>|--region <id> [--aggregation 10min|hour|day|month|year] [--parameters basic|all] [--json]
  vedur warnings [--category <name>] [--json]
  vedur serve  # local MCP server over stdio
  vedur quakes [--since 24h] [--until ISO] [--near lat,lon] [--radius-km N] [--min-magnitude N] [--manual|--automatic] [--limit N] [--json]`); }
async function resolve(value: string): Promise<number> { if (/^\d+$/.test(value)) return Number(value); const candidates = await stations(value, true); const exact = candidates.filter(s => s.type === "sj" && s.name?.localeCompare(value, "is", { sensitivity: "accent" }) === 0); if (exact.length === 1) return exact[0]!.id; if (candidates.length === 0) fail("STATION_NOT_FOUND", `No active station matching '${value}'.`); fail("AMBIGUOUS_STATION", `Could not resolve '${value}' to one automatic station.`, candidates); }
async function nearestLocation(query?: string) {
  const near = flag("near");
  if (near) { const location = parseNear(near); return { location, selected: await selectNearestStation(location) }; }
  if (!query) fail("MISSING_LOCATION", "Provide a place/address, --near, --station, or --region.");
  const saved = await savedLocation(query);
  const location = saved ? asResolvedLocation(saved) : await geocode(query);
  return { location, selected: await selectNearestStation(location) };
}
async function main(): Promise<void> {
  const p = pos(); const command = p[0];
  if (has("version") || command === "version") { console.log(json ? JSON.stringify({ version: pkg.version }) : `vedur ${pkg.version}`); return; }
  if (!command || has("help") || command === "help") return help();
  if (command === "serve") { const { serve } = await import("./mcp/server.ts"); return serve(); }
  if (command === "stations" && p[1] === "find") { const query = p.slice(2).join(" "); if (!query) fail("MISSING_QUERY", "Provide a station search query."); const data = await stations(query, has("active")); return success(data.slice(0, Number(flag("limit") || 10)), json, ["weather"]); }
  if (command === "stations" && p[1] === "nearest") { const result = await nearestLocation(p.slice(2).join(" ")); const selected = result.selected; return success({ location: result.location, station: selected.station, distanceKm: Number(selected.distanceKm.toFixed(1)), rationale: selected.rationale }, json, ["weather"]); }
  if (command === "locations") { const action = p[1]; if (action === "list") return success(await listLocations(), json, []); if (action === "remove") { const name = p[2]; if (!name) fail("MISSING_LOCATION_NAME", "Provide the saved location name to remove."); await removeLocation(name); return success({ removed: name }, json, []); } if (action === "add") { const name = p[2], query = p.slice(3).join(" "); if (!name || !query) fail("MISSING_LOCATION", "Use: vedur locations add <name> <place|address>."); const location = await geocode(query); const explicitPoint = flag("point"); if (explicitPoint && !/^\d+$/.test(explicitPoint)) fail("INVALID_FORECAST_POINT", "--point must be a numeric Veður forecast-point ID."); const forecastPointId = explicitPoint ? Number(explicitPoint) : (await nearestForecastPoint(location.latitude, location.longitude)).station.id; return success(await addLocation(name, location, forecastPointId), json, []); } fail("UNKNOWN_COMMAND", "Use locations add, list, or remove."); }
  if (command === "observations" && p[1] === "latest") { const station = flag("station"), region = flag("region"); if (!station && !region) fail("MISSING_LOCATION", "Use --station or --region."); const aggregation = flag("aggregation") || "10min"; if (!/^(10min|hour|day|month|year)$/.test(aggregation)) fail("INVALID_AGGREGATION", "Use 10min, hour, day, month, or year."); return success(await latest({ stationId: station ? Number(station) : undefined, regionId: region ? Number(region) : undefined, aggregation, parameters: flag("parameters") || "basic" }), json, ["weather"]); }
  if (command === "now") { const station = flag("station"), region = flag("region"); if (station || region) return success(await latest({ stationId: station ? Number(station) : undefined, regionId: region ? Number(region) : undefined, aggregation: "10min", parameters: "basic" }), json, ["weather"]); if (/^\d+$/.test(p[1] || "")) return success(await latest({ stationId: Number(p[1]), aggregation: "10min", parameters: "basic" }), json, ["weather"]); const result = await nearestLocation(p.slice(1).join(" ")); const selected = result.selected; const observation = await latest({ stationId: selected.station.id, aggregation: "10min", parameters: "basic" }); return success({ location: result.location, selectedStation: { ...selected.station, distanceKm: Number(selected.distanceKm.toFixed(1)), rationale: selected.rationale }, observation }, json, ["weather"]); }
  if (command === "forecast") { const point = flag("point"); const hours = Number(flag("hours") || 24); if (point) { if (!/^\d+$/.test(point)) fail("INVALID_FORECAST_POINT", "--point must be a numeric Veður forecast-point ID."); return success({ point: { id: Number(point), source: "explicit" }, forecast: await forecastPoint(Number(point), hours) }, json, []); } const near = flag("near"); const query = p.slice(1).join(" "); if (!near && !query) fail("MISSING_LOCATION", "Provide a place/address, --near, or --point."); const saved = near ? undefined : await savedLocation(query); const location = near ? parseNear(near) : saved ? asResolvedLocation(saved) : await geocode(query); const selected = saved?.forecastPointId ? { station: { id: saved.forecastPointId, name: "saved preference", latitude: location.latitude, longitude: location.longitude, isVirtual: true }, distanceKm: 0 } : await nearestForecastPoint(location.latitude, location.longitude); return success({ location, selectedForecastPoint: { ...selected.station, distanceKm: Number(selected.distanceKm.toFixed(1)) }, forecast: await forecastPoint(selected.station.id, hours) }, json, []); }
  if (command === "warnings") return success(await warnings(flag("category")), json, ["cap"]);
  if (command === "quakes") { const since = parseTime(flag("since") || "24h"), until = flag("until") ? parseTime(flag("until")!) : new Date().toISOString(); const mode = has("manual") ? "manual" : has("automatic") ? "automatic" : undefined; const query: Record<string, string | number | string[]> = { start_time: since, end_time: until }; const minMagnitude = flag("min-magnitude"); if (minMagnitude) query.size_min = minMagnitude; if (mode) query.evaluation_mode = mode; let data = await quakes(query); const near = flag("near"); if (near) { const [lat, lon] = near.split(",").map(Number); const radius = Number(flag("radius-km") || 50); if (!Number.isFinite(lat) || !Number.isFinite(lon)) fail("INVALID_LOCATION", "--near must be latitude,longitude."); data = data.filter(q => distanceKm(lat!, lon!, q.latitude, q.longitude) <= radius); } return success(data.sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, Number(flag("limit") || 100)), json, ["quakes"]); }
  fail("UNKNOWN_COMMAND", `Unknown command '${command}'. Run vedur --help.`);
}
main().catch(error => { process.exitCode = printError(error, json); });
