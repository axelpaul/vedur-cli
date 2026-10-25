#!/usr/bin/env bun
import { warnings } from "./api/cap.ts";
import { fail } from "./lib/error.ts";
import { printError, success } from "./format/output.ts";
import { geocode } from "./lib/location.ts";
import { nearestForecastPoint } from "./api/forecast.ts";
import { addLocation, listLocations, removeLocation } from "./lib/locations.ts";
import { findStations, forecast, latestObservations, listQuakes, nearestStation, now } from "./lib/ops.ts";
import { VERSION } from "./version.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const BOOLEAN_FLAGS = ["json", "active", "all", "manual", "automatic", "help", "version"];
function flag(name: string): string | undefined { const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`)); if (i < 0) return undefined; return args[i]!.includes("=") ? args[i]!.split("=").slice(1).join("=") : args[i + 1]; }
function has(name: string): boolean { return args.some(a => a === `--${name}` || a.startsWith(`--${name}=`)); }
function num(name: string): number | undefined { const value = flag(name); if (value === undefined) return undefined; const n = Number(value); if (!Number.isFinite(n)) fail("INVALID_ARGUMENT", `--${name} must be a number.`); return n; }
function pos(): string[] { const consumed = new Set<number>(); for (let i = 0; i < args.length; i++) if (args[i]!.startsWith("--") && !args[i]!.includes("=") && !BOOLEAN_FLAGS.includes(args[i]!.slice(2))) consumed.add(i + 1); return args.filter((a, i) => !a.startsWith("-") && !consumed.has(i)); }
function help(): void { console.log(`vedur ${VERSION} — Icelandic Met Office CLI (CC BY attribution: vedur.is)

Commands:
  vedur now <place|address|saved-name|station-id> [--near lat,lon] [--json]
  vedur now --station <id> | --region <id> [--json]
  vedur forecast <place|address|saved-name> [--near lat,lon] [--hours N] [--json]
  vedur forecast --point <id> [--hours N] [--json]
  vedur stations find <query> [--active] [--limit N] [--json]
  vedur stations nearest <place|address> | --near lat,lon [--json]
  vedur observations latest --station <id>|--region <id> [--aggregation 10min|hour|day|month|year] [--parameters basic|all] [--json]
  vedur warnings [--category <name>] [--json]
  vedur quakes [--since 24h] [--until ISO] [--near lat,lon] [--radius-km N] [--min-magnitude N] [--manual|--automatic] [--limit N] [--json]
  vedur locations add <name> <place|address> [--point ID] [--json]
  vedur locations list [--json]
  vedur locations remove <name> [--json]
  vedur serve                 Start the MCP server over stdio
  vedur --version             Print the version`); }

async function main(): Promise<void> {
  if (args[0] === "--version" || args[0] === "-v" || args[0] === "version") return void console.log(VERSION);
  const p = pos(); const command = p[0];
  if (!command || has("help") || args.includes("-h") || command === "help") return help();
  if (command === "serve") { const { serve } = await import("./mcp/server.ts"); return serve(); }
  if (command === "stations" && p[1] === "find") return success(await findStations(p.slice(2).join(" "), has("active"), num("limit") ?? 10), json, ["weather"]);
  if (command === "stations" && p[1] === "nearest") return success(await nearestStation({ place: p.slice(2).join(" "), near: flag("near") }), json, ["weather"]);
  if (command === "locations") {
    const action = p[1];
    if (action === "list") return success(await listLocations(), json, []);
    if (action === "remove") { const name = p[2]; if (!name) fail("MISSING_LOCATION_NAME", "Provide the saved location name to remove."); await removeLocation(name); return success({ removed: name }, json, []); }
    if (action === "add") {
      const name = p[2], query = p.slice(3).join(" ");
      if (!name || !query) fail("MISSING_LOCATION", "Use: vedur locations add <name> <place|address>.");
      const location = await geocode(query);
      const explicitPoint = flag("point");
      if (explicitPoint && !/^\d+$/.test(explicitPoint)) fail("INVALID_FORECAST_POINT", "--point must be a numeric Veður forecast-point ID.");
      const forecastPointId = explicitPoint ? Number(explicitPoint) : (await nearestForecastPoint(location.latitude, location.longitude)).station.id;
      return success(await addLocation(name, location, forecastPointId), json, []);
    }
    fail("UNKNOWN_COMMAND", "Use locations add, list, or remove.");
  }
  if (command === "observations" && p[1] === "latest") return success(await latestObservations({ stationId: num("station"), regionId: num("region"), aggregation: flag("aggregation"), parameters: flag("parameters") }), json, ["weather"]);
  if (command === "now") {
    const stationId = num("station") ?? (/^\d+$/.test(p[1] || "") ? Number(p[1]) : undefined);
    return success(await now({ stationId, regionId: num("region"), place: p.slice(1).join(" "), near: flag("near") }), json, ["weather"]);
  }
  if (command === "forecast") {
    const point = flag("point");
    if (point !== undefined && !/^\d+$/.test(point)) fail("INVALID_FORECAST_POINT", "--point must be a numeric Veður forecast-point ID.");
    return success(await forecast({ pointId: point ? Number(point) : undefined, hours: num("hours"), place: p.slice(1).join(" "), near: flag("near") }), json, []);
  }
  if (command === "warnings") return success(await warnings(flag("category")), json, ["cap"]);
  if (command === "quakes") {
    const mode = has("manual") ? "manual" : has("automatic") ? "automatic" : undefined;
    return success(await listQuakes({ since: flag("since"), until: flag("until"), near: flag("near"), radiusKm: num("radius-km"), minMagnitude: num("min-magnitude"), mode, limit: num("limit") }), json, ["quakes"]);
  }
  fail("UNKNOWN_COMMAND", `Unknown command '${command}'. Run vedur --help.`);
}
main().catch(error => { process.exitCode = printError(error, json); });
