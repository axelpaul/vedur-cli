import { getJson } from "./client.ts";
import type { Observation, Station } from "../domain/models.ts";

type RawStation = { station: number; name?: string | null; abbr?: string; type?: string; lat?: number; lon?: number; ele?: number; owner?: string; ending?: string | null };
export async function stations(query: string, active = false): Promise<Station[]> {
  const rows = await getJson<RawStation[]>("weather", "/weather/stations", { keyword: query, active: active ? "true" : undefined });
  return rows.map(s => ({ id: s.station, name: s.name ?? null, abbreviation: s.abbr ?? "", type: s.type ?? null, active: s.ending == null, latitude: s.lat ?? null, longitude: s.lon ?? null, elevationM: s.ele ?? null, owner: s.owner ?? null }));
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
