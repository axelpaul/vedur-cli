import { expect, test } from "bun:test";
import { distanceKm } from "../src/lib/geo.ts";
import { parseTime } from "../src/lib/time.ts";
import { normaliseObservation } from "../src/api/weather.ts";
import { forecastPoint } from "../src/api/forecast.ts";
test("parses relative duration", () => expect(parseTime("24h", new Date("2026-01-02T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z"));
test("distance is zero at a point", () => expect(distanceKm(64.1, -21.9, 64.1, -21.9)).toBe(0));
test("normalises string readings without inventing values", () => { const x = normaliseObservation({ station: 1, time: "2026-01-01T00:00:00", t: "4.2", f: "2.1", unknown: null }, "10min"); expect(x.temperatureC).toBe(4.2); expect(x.values.unknown).toBeNull(); });
test("forecast point rejects invalid identifiers before a request", async () => { await expect(forecastPoint(0)).rejects.toMatchObject({ code: "INVALID_FORECAST_POINT" }); });
