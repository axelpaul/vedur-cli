/**
 * Shared read operations used by both the CLI (src/index.ts) and the MCP server
 * (src/mcp/server.ts), so the two surfaces cannot drift apart.
 */
import { latest, stations } from "../api/weather.ts";
import { quakes } from "../api/quakes.ts";
import { forecastPoint, nearestForecastPoint } from "../api/forecast.ts";
import type { Quake } from "../domain/models.ts";
import { distanceKm } from "./geo.ts";
import { fail } from "./error.ts";
import { parseTime } from "./time.ts";
import { geocode, parseNear, selectNearestStation, type ResolvedLocation } from "./location.ts";
import { asResolvedLocation, savedLocation } from "./locations.ts";

export const AGGREGATIONS = ["10min", "hour", "day", "month", "year"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export type PlaceInput = { place?: string; near?: string };

/** Resolve a saved location name, an Icelandic place/address, or "lat,lon". */
export async function resolvePlace({ place, near }: PlaceInput): Promise<ResolvedLocation> {
  if (near) return parseNear(near);
  const query = place?.trim();
  if (!query) fail("MISSING_LOCATION", "Provide a place/address or near (lat,lon).");
  const saved = await savedLocation(query);
  return saved ? asResolvedLocation(saved) : geocode(query);
}

export async function findStations(query: string, activeOnly: boolean, limit = 10) {
  if (!query.trim()) fail("MISSING_QUERY", "Provide a station search query.");
  return (await stations(query, activeOnly)).slice(0, limit);
}

export async function nearestStation(input: PlaceInput) {
  const location = await resolvePlace(input);
  const selected = await selectNearestStation(location);
  return { location, station: selected.station, distanceKm: Number(selected.distanceKm.toFixed(1)), rationale: selected.rationale };
}

export async function latestObservations(options: { stationId?: number; regionId?: number; aggregation?: string; parameters?: string }) {
  if (options.stationId === undefined && options.regionId === undefined) fail("MISSING_LOCATION", "Use --station or --region.");
  for (const [name, value] of [["station", options.stationId], ["region", options.regionId]] as const)
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) fail("INVALID_ID", `${name} must be a positive integer ID.`);
  const aggregation = options.aggregation || "10min";
  if (!(AGGREGATIONS as readonly string[]).includes(aggregation)) fail("INVALID_AGGREGATION", "Use 10min, hour, day, month, or year.");
  const parameters = options.parameters || "basic";
  if (parameters !== "basic" && parameters !== "all") fail("INVALID_PARAMETERS", "Use basic or all.");
  return latest({ stationId: options.stationId, regionId: options.regionId, aggregation, parameters });
}

/** Latest 10-minute observation for an explicit station/region, or the station selected near a place. */
export async function now(input: PlaceInput & { stationId?: number; regionId?: number }) {
  if (input.stationId !== undefined || input.regionId !== undefined) return latestObservations({ stationId: input.stationId, regionId: input.regionId });
  const selected = await nearestStation(input);
  const observation = await latestObservations({ stationId: selected.station.id });
  return { location: selected.location, selectedStation: { ...selected.station, distanceKm: selected.distanceKm, rationale: selected.rationale }, observation };
}

export async function forecast(input: PlaceInput & { pointId?: number; hours?: number }) {
  const hours = input.hours ?? 24;
  if (input.pointId !== undefined) {
    if (!Number.isInteger(input.pointId) || input.pointId <= 0) fail("INVALID_FORECAST_POINT", "point must be a numeric Veður forecast-point ID.");
    return { point: { id: input.pointId, source: "explicit" }, forecast: await forecastPoint(input.pointId, hours) };
  }
  const saved = input.near || !input.place ? undefined : await savedLocation(input.place);
  const location = saved ? asResolvedLocation(saved) : await resolvePlace(input);
  const selected = saved?.forecastPointId
    ? { station: { id: saved.forecastPointId, name: "saved preference", latitude: location.latitude, longitude: location.longitude, isVirtual: true }, distanceKm: 0 }
    : await nearestForecastPoint(location.latitude, location.longitude);
  return { location, selectedForecastPoint: { ...selected.station, distanceKm: Number(selected.distanceKm.toFixed(1)) }, forecast: await forecastPoint(selected.station.id, hours) };
}

export type QuakeOptions = { since?: string; until?: string; near?: string; radiusKm?: number; minMagnitude?: number; mode?: "manual" | "automatic"; limit?: number };

export async function listQuakes(options: QuakeOptions): Promise<Quake[]> {
  const since = parseTime(options.since || "24h");
  const until = options.until ? parseTime(options.until) : new Date().toISOString();
  const query: Record<string, string | number | string[]> = { start_time: since, end_time: until };
  if (options.minMagnitude !== undefined) {
    if (!Number.isFinite(options.minMagnitude)) fail("INVALID_MAGNITUDE", "min-magnitude must be a number.");
    query.size_min = options.minMagnitude;
  }
  if (options.mode) query.evaluation_mode = options.mode;
  let data = await quakes(query);
  if (options.near) {
    const centre = parseNear(options.near);
    const radius = options.radiusKm ?? 50;
    if (!Number.isFinite(radius) || radius <= 0) fail("INVALID_RADIUS", "radius-km must be a positive number.");
    data = data.filter(q => distanceKm(centre.latitude, centre.longitude, q.latitude, q.longitude) <= radius);
  }
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit <= 0) fail("INVALID_LIMIT", "limit must be a positive integer.");
  return data.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}
