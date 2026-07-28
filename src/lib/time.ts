import { fail } from "./error.ts";
export function parseTime(value: string, now = new Date()): string {
  const duration = /^(\d+)(m|h|d|w)$/.exec(value);
  if (duration) {
    const amount = Number(duration[1]); const unit = duration[2];
    const multiplier = ({ m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 } as Record<string, number>)[unit!];
    if (multiplier === undefined) fail("INVALID_TIME", `Invalid duration '${value}'.`);
    const ms = amount * multiplier;
    return new Date(now.getTime() - ms).toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail("INVALID_TIME", `Invalid time '${value}'. Use ISO 8601 or a duration such as 24h.`);
  return date.toISOString();
}
