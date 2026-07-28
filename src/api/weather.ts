import { getJson } from "./client.ts";
import type { Observation, Station } from "../domain/models.ts";

type RawStation = { station: number; name?: string | null; abbr?: string; type?: string; lat?: number; lon?: number; ele?: number; owner?: string; ending?: string | null };
export async function stations(query: string, active = false): Promise<Station[]> {
  const rows = await getJson<RawStation[]>("weather", "/weather/stations", { keyword: query || undefined, active: active ? "true" : undefined });
  return rows.map(s => ({ id: s.station, name: s.name ?? null, abbreviation: s.abbr ?? "", type: s.type ?? null, active: s.ending == null, latitude: s.lat ?? null, longitude: s.lon ?? null, elevationM: s.ele ?? null, owner: s.owner ?? null }));
}

/** The station list changes slowly.  Cache only public station metadata, never locations a user searched for. */
export async function activeAutomaticStations(): Promise<Station[]> {
  const cacheFile = stationCacheFile();
  try {
    const cached = await Bun.file(cacheFile).json() as { savedAt: string; stations: Station[] };
    if (Date.now() - Date.parse(cached.savedAt) < 24 * 60 * 60 * 1000 && Array.isArray(cached.stations)) return cached.stations;
  } catch { /* missing/corrupt cache is harmless */ }
  const fresh = (await stations("", true)).filter(s => s.type === "sj" && s.latitude !== null && s.longitude !== null);
  try {
    await Bun.write(cacheFile, JSON.stringify({ savedAt: new Date().toISOString(), stations: fresh }));
  } catch { /* a read-only cache directory must not prevent a weather lookup */ }
  return fresh;
}

function stationCacheFile(): string {
  const root = process.env.XDG_CACHE_HOME || `${process.env.HOME || "."}/.cache`;
  return `${root}/vedur-cli/stations.json`;
}

function numberOrUndefined(value: unknown): number | undefined { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
export function normaliseObservation(raw: Record<string, unknown>, aggregation: string): Observation {
  if (typeof raw.station !== "number" || typeof raw.time !== "string") throw new Error("Unexpected observation payload.");
  const values: Record<string, number | string | null> = {};
  for (const [key, value] of Object.entries(raw)) if (!["station", "time", "created_time"].includes(key) && (typeof value === "string" || typeof value === "number" || value === null)) values[key] = value as number | string | null;
  return { stationId: raw.station, observedAt: raw.time, aggregation, temperatureC: numberOrUndefined(raw.t), windDirectionDeg: numberOrUndefined(raw.d), windSpeedMps: numberOrUndefined(raw.f), windGustMps: numberOrUndefined(raw.fg), pressureHPa: numberOrUndefined(raw.ps), relativeHumidityPct: numberOrUndefined(raw.rh), values };
}
export async function latest(options: { stationId?: number; regionId?: number; aggregation: string; parameters: string }): Promise<Observation[]> {
  const path = options.aggregation === "10min" ? "/weather/observations/aws/raw/10min/latest" : `/weather/observations/aws/${options.aggregation}/latest`;
  const raw = await getJson<Record<string, unknown> | Record<string, unknown>[]>("weather", path, { station_id: options.stationId, region_id: options.regionId, parameters: options.parameters });
  return (Array.isArray(raw) ? raw : [raw]).map(row => normaliseObservation(row, options.aggregation));
}
