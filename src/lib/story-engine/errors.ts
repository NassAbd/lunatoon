import type { FailureDiagnostics } from "./contracts";
export class EngineError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409, public diagnostics?: FailureDiagnostics) { super(message); }
}
