import { getJson } from "./client.ts";
import type { Quake } from "../domain/models.ts";
type Feature = { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> };
export async function quakes(query: Record<string, string | number | string[]>): Promise<Quake[]> {
  const body = await getJson<{ features?: Feature[] }>("quakes", "/quakes/events", { format: "json", system: "seiscomp", ...query });
  if (!Array.isArray(body.features)) throw new Error("Unexpected earthquakes payload.");
  return body.features.map(feature => { const p = feature.properties ?? {}; const c = feature.geometry?.coordinates ?? []; return { id: String(p.event_id), occurredAt: String(p.time), updatedAt: p.updated_time as string | undefined, magnitude: Number(p.magnitude), depthKm: Number(p.depth), longitude: Number(c[0]), latitude: Number(c[1]), region: p.region as string | undefined, type: p.type as string | undefined, evaluationMode: p.evaluation_mode as string | undefined }; });
}
