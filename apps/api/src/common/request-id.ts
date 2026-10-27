import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

export const REQUEST_ID_HEADER = "x-request-id";

const uuid = z.uuid();

/** Accepts a valid incoming UUID, otherwise generates a fresh one. Untrusted input is never echoed unvalidated. */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const parsed = uuid.safeParse(candidate);
  return parsed.success ? parsed.data : randomUUID();
}

/** pino-http `genReqId`: resolves the id and echoes it in the response header. */
export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  res.setHeader("X-Request-Id", id);
  return id;
}
