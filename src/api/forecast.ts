import { USER_AGENT } from "../version.ts";
import { VedurError } from "../lib/error.ts";
import { distanceKm } from "../lib/geo.ts";

const BASE = process.env.VEDUR_FORECAST_BASE_URL || "https://gottvedur.is";

export type ForecastPoint = {
  pointId: number;
  forecastTime: string;
  temperatureC?: number;
  windSpeedMps?: number;
  windDirectionDeg?: number;
  windGustMps?: number;
  precipitationMm?: number;
  pressureHPa?: number;
  humidityPct?: number;
  icon?: string;
};

export type ForecastStation = { id: number; name: string; latitude: number; longitude: number; isVirtual: boolean };

function numberOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Fetch Veður's public web forecast feed for a virtual (spot-forecast) station.
 * This is deliberately separate from api.vedur.is: point forecasts are currently
 * published by gottvedur.is, not in the versioned observations OpenAPI surface.
 */
export async function forecastPoint(pointId: number, hours = 24): Promise<ForecastPoint[]> {
  if (!Number.isInteger(pointId) || pointId <= 0) throw new VedurError("INVALID_FORECAST_POINT", "Forecast point ID must be a positive integer.", 2);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 240) throw new VedurError("INVALID_HOURS", "--hours must be between 1 and 240.", 2);
  const url = new URL("/api/map/forecast/detailByStationId", BASE);
  url.searchParams.set("stationId", String(pointId));
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  } catch {
    throw new VedurError("UPSTREAM_UNAVAILABLE", "Could not reach Veður's point-forecast feed.", 3, undefined, true);
  }
  if (!response.ok) throw new VedurError("UPSTREAM_HTTP_ERROR", `Veður's point-forecast feed returned HTTP ${response.status}.`, 3, { status: response.status }, response.status >= 500 || response.status === 429);
  let raw: unknown;
  try { raw = await response.json(); } catch { throw new VedurError("UPSTREAM_SCHEMA", "Veður's point-forecast feed did not return JSON.", 4); }
  if (!Array.isArray(raw)) throw new VedurError("UPSTREAM_SCHEMA", "Unexpected point-forecast payload.", 4);
  const until = Date.now() + hours * 60 * 60 * 1000;
  const rows = raw.flatMap((entry): ForecastPoint[] => {
    if (!entry || typeof entry !== "object") return [];
    const x = entry as Record<string, unknown>;
    if (typeof x.forecastTime !== "string" || !Number.isFinite(Date.parse(x.forecastTime))) return [];
    return [{ pointId, forecastTime: x.forecastTime, temperatureC: numberOrUndefined(x.temperature), windSpeedMps: numberOrUndefined(x.windSpeed), windDirectionDeg: numberOrUndefined(x.windDirection), windGustMps: numberOrUndefined(x.windGust), precipitationMm: numberOrUndefined(x.precipitation), pressureHPa: numberOrUndefined(x.pressure), humidityPct: numberOrUndefined(x.humidity), icon: typeof x.icon === "string" ? x.icon : undefined }];
  }).filter(x => Date.parse(x.forecastTime) >= Date.now() && Date.parse(x.forecastTime) <= until);
  return rows.sort((a, b) => a.forecastTime.localeCompare(b.forecastTime));
}

/** Public forecast-map metadata, cached like ordinary station metadata. */
export async function forecastStations(): Promise<ForecastStation[]> {
  const cacheFile = forecastCacheFile();
  try {
    const cached = await Bun.file(cacheFile).json() as { savedAt: string; stations: ForecastStation[] };
    if (Date.now() - Date.parse(cached.savedAt) < 24 * 60 * 60 * 1000 && Array.isArray(cached.stations)) return cached.stations;
  } catch { /* cache miss is harmless */ }
  const url = new URL("/api/map/forecast/boundary", BASE);
  // Veður's map serves a progressively denser, public catalogue by zoom level.
  url.search = new URLSearchParams({ x1: "-25", x2: "-13", y1: "63", y2: "67.5", zoom: "13" }).toString();
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  } catch {
    throw new VedurError("UPSTREAM_UNAVAILABLE", "Could not reach Veður's forecast-station catalogue.", 3, undefined, true);
  }
  if (!response.ok) throw new VedurError("UPSTREAM_HTTP_ERROR", `Veður's forecast-station catalogue returned HTTP ${response.status}.`, 3, { status: response.status }, response.status >= 500 || response.status === 429);
  const raw = await response.json() as { features?: unknown[] };
  if (!Array.isArray(raw.features)) throw new VedurError("UPSTREAM_SCHEMA", "Unexpected forecast-station catalogue payload.", 4);
  const stations = raw.features.flatMap((feature): ForecastStation[] => {
    if (!feature || typeof feature !== "object") return [];
    const f = feature as { geometry?: { coordinates?: unknown }; properties?: { station?: Record<string, unknown> } };
    const coordinates = f.geometry?.coordinates;
    const station = f.properties?.station;
    if (!Array.isArray(coordinates) || !station || typeof station.id !== "number" || typeof station.name !== "string") return [];
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ id: station.id, name: station.name, longitude, latitude, isVirtual: station.isVirtual === true }];
  });
  try { await Bun.write(cacheFile, JSON.stringify({ savedAt: new Date().toISOString(), stations })); } catch { /* read-only cache is fine */ }
  return stations;
}

export async function nearestForecastPoint(latitude: number, longitude: number): Promise<{ station: ForecastStation; distanceKm: number }> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new VedurError("INVALID_LOCATION", "Forecast lookup requires finite latitude and longitude.", 2);
  const candidates = (await forecastStations()).filter(s => s.isVirtual);
  if (!candidates.length) throw new VedurError("FORECAST_POINT_NOT_FOUND", "Veður's forecast-point catalogue contains no virtual points.", 3);
  const station = candidates.reduce((best, candidate) => distanceKm(latitude, longitude, candidate.latitude, candidate.longitude) < distanceKm(latitude, longitude, best.latitude, best.longitude) ? candidate : best);
  return { station, distanceKm: distanceKm(latitude, longitude, station.latitude, station.longitude) };
}

function forecastCacheFile(): string {
  const root = process.env.XDG_CACHE_HOME || `${process.env.HOME || "."}/.cache`;
  return `${root}/vedur-cli/forecast-stations.json`;
}
