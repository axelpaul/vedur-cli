export const API_VERSIONS = {
  weather: "2026-02-17",
  cap: "2026-04-14",
  quakes: "2026-07-01",
} as const;

export type Service = keyof typeof API_VERSIONS;

export function versionFor(service: Service): string {
  return process.env[`VEDUR_API_VERSION_${service.toUpperCase()}`] || API_VERSIONS[service];
}
