import { expect, test } from "bun:test";
import { distanceKm } from "../src/lib/geo.ts";
import { parseTime } from "../src/lib/time.ts";
import { normaliseObservation } from "../src/api/weather.ts";
import { forecastPoint, nearestForecastPoint } from "../src/api/forecast.ts";
test("parses relative duration", () => expect(parseTime("24h", new Date("2026-01-02T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z"));
test("distance is zero at a point", () => expect(distanceKm(64.1, -21.9, 64.1, -21.9)).toBe(0));
test("normalises string readings without inventing values", () => { const x = normaliseObservation({ station: 1, time: "2026-01-01T00:00:00", t: "4.2", f: "2.1", unknown: null }, "10min"); expect(x.temperatureC).toBe(4.2); expect(x.values.unknown).toBeNull(); });
test("forecast point rejects invalid identifiers before a request", async () => { await expect(forecastPoint(0)).rejects.toMatchObject({ code: "INVALID_FORECAST_POINT" }); });
test("forecast lookup rejects invalid coordinates before a request", async () => { await expect(nearestForecastPoint(NaN, 0)).rejects.toMatchObject({ code: "INVALID_LOCATION" }); });
test("observations reject unknown aggregation before a request", async () => {
  const { latestObservations } = await import("../src/lib/ops.ts");
  await expect(latestObservations({ stationId: 1, aggregation: "week" })).rejects.toMatchObject({ code: "INVALID_AGGREGATION" });
  await expect(latestObservations({})).rejects.toMatchObject({ code: "MISSING_LOCATION" });
});
test("version comes from package.json", async () => {
  const { VERSION } = await import("../src/version.ts");
  expect(VERSION).toBe((await Bun.file("package.json").json()).version);
});
