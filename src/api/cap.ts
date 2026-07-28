import { getJson } from "./client.ts";
export type Warning = { identifier: string; sentAt: string; severity?: string; certainty?: string; urgency?: string; category?: string[]; event?: string; headline?: string; description?: string; onsetAt?: string; expiresAt?: string; areas: Array<{ name?: string; polygon?: string }>; language: "en"; raw: unknown };
type Raw = Record<string, unknown>;
export async function warnings(category?: string): Promise<Warning[]> {
  const items = await getJson<Raw[]>("cap", "/cap/capbroker/active/detailed/all");
  return items.map(raw => ({ identifier: String(raw.identifier), sentAt: String(raw.sent), severity: raw.severity as string | undefined, certainty: raw.certainty as string | undefined, urgency: raw.urgency as string | undefined, category: raw.category as string[] | undefined, event: raw.event_en as string | undefined, headline: raw.headline_en as string | undefined, description: raw.description_en as string | undefined, onsetAt: raw.onset as string | undefined, expiresAt: raw.expires as string | undefined, areas: (raw.polygon as string[] | undefined)?.map(polygon => ({ polygon })) ?? [{ name: raw.area_id as string | undefined }], language: "en" as const, raw })).filter(w => !category || w.category?.some(c => c.toLowerCase() === category.toLowerCase()));
}
