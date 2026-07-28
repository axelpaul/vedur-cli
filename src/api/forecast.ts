import { VedurError } from "../lib/error.ts";

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
    response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "vedur-cli/0.1.0" } });
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
