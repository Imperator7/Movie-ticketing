---
name: api-contract-change
description: Use when adding or changing an API endpoint, request/response field, error code or header, or when the web needs data the API doesn't return yet. The contract-first steps across docs/openapi.yaml, the Nest code, the contract and conformance tests, the generated web client and the mock API.
---

# Changing the API contract

`docs/openapi.yaml` is the source of truth (owned by the lead). Code and docs disagree → the docs win unless they're shown wrong.

## Order of work

1. **Spec** (lead, or proposed in a subagent's report): edit `docs/openapi.yaml`; `npm run lint:openapi`. Every error uses the `Error` schema with an `ErrorCode` enum value; add new codes to the enum and translate them in `apps/web/messages/{th,en}.json` (`errors.<CODE>`).
2. **API** (`apps/api/src/<module>/`): strict nestjs-zod DTOs, `@Public()` only for public routes, `ApiErrors(...)` listing exactly the spec's error statuses, authorization inside the query (another user's resource → 404), server-computed prices/totals/statuses. Cache headers: public catalog GETs use `@CacheControl(...)`; everything else stays `no-store`.
3. **Contract allowlist**: add the operationId to `apps/api/src/contract/implemented-operations.ts`. The contract test (in `npm run check`) then compares the Nest document to the spec for that operation, and fails if you implement an endpoint without listing it.
4. **Conformance**: `apps/api/test/conformance.int-spec.ts` calls the real endpoint and validates the response against the spec. Add success and error cases for the new operation. `npm run test:int -w api`.
5. **Web client**: `npm run api:generate -w web` (orval → `src/api/generated/`, formatted; never hand-edit). Extend the generated Zod schemas for forms instead of duplicating them.
6. **Mock API** (`apps/web/src/mocks/`): keep handlers faithful to the spec, so `dev:mock` and the real API behave the same.
7. **Report / test report**: `npm run test:report` → `/test-report` shows conformance per operation.

## Gotchas

- API is ESM: relative imports need `.js`; Nest DI needs value imports, not `import type`.
- Validation errors: `details.fields = { "<path>": ["<zod issue code>"] }`, `_root` for whole-body, `unrecognized_key` for extra fields.
- nestjs-zod renders a nullable top-level string oddly; see the `.meta({ type: "string", nullable: true })` workaround in `auth.dto.ts`.
- nestjs-zod peer range: if `npm install -w api …` hits ERESOLVE, rerun with `--legacy-peer-deps` (that command only).
- Public catalog responses are cacheable (CloudFront later); never add `public` caching to anything user-specific.
