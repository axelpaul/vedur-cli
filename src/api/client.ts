import { USER_AGENT } from "../version.ts";
import { VedurError } from "../lib/error.ts";
import { type Service, versionFor } from "./versions.ts";

const BASE = process.env.VEDUR_BASE_URL || "https://api.vedur.is";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getJson<T>(service: Service, path: string, query: Record<string, string | number | undefined | string[]> = {}): Promise<T> {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key, v));
    else url.searchParams.set(key, String(value));
  }
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "x-vi-api-version": versionFor(service), "User-Agent": USER_AGENT } });
      if (response.status === 204) return [] as T;
      if (response.ok) return await response.json() as T;
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      last = new VedurError("UPSTREAM_HTTP_ERROR", `Icelandic Met Office returned HTTP ${response.status}.`, 3, { status: response.status }, retryable);
      if (!retryable) throw last;
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 250 * 2 ** attempt + Math.random() * 100);
    } catch (error) {
      last = error;
      if (error instanceof VedurError && !error.retryable) throw error;
      if (attempt < 2) await delay(250 * 2 ** attempt + Math.random() * 100);
    } finally { clearTimeout(timeout); }
  }
  throw new VedurError("UPSTREAM_UNAVAILABLE", "Could not reach the Icelandic Met Office after 3 attempts.", 3, undefined, true);
}
