export class VedurError extends Error {
  constructor(public code: string, message: string, public exitCode = 2, public details?: unknown, public retryable?: boolean) { super(message); }
}

export function fail(code: string, message: string, details?: unknown): never {
  throw new VedurError(code, message, 2, details);
}
