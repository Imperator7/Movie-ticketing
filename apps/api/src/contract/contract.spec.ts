import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { AppModule } from "../app.module.js";
import {
  APP_CREATE_OPTIONS,
  GLOBAL_PREFIX,
  buildOpenApiDocument,
  configureApp,
} from "../app.setup.js";
import { IMPLEMENTED_OPERATIONS } from "./implemented-operations.js";
import { compareOperations, type OpenApiDoc } from "./openapi-compare.js";

const CONTRACT_PATH = fileURLToPath(new URL("../../../../docs/openapi.yaml", import.meta.url));
const PREFIX = `/${GLOBAL_PREFIX}`;

const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  JOBS_ENABLED: "false",
  // Never connects: the document is generated from decorators only.
  DATABASE_URL: "postgresql://app_user:unused@localhost:1/unused",
  JWT_SECRET: "contract_test_jwt_secret_0123456789abcdef0123",
  REFRESH_TOKEN_PEPPER: "contract_test_pepper_0123456789abcdef0123",
  TICKET_QR_SECRET: "contract_test_qr_secret_0123456789abcdef01",
};

const clone = <T>(value: T): T => structuredClone(value);

type Obj = Record<string, unknown>;

/** Walks a dotted path (keys may contain `/` and `{}`) and returns the object there. */
function obj(doc: OpenApiDoc, path: string): Obj {
  let current: unknown = doc;
  for (const key of path.split(".")) {
    current = (current as Obj)[key];
  }
  if (typeof current !== "object" || current === null) throw new Error(`No object at ${path}`);
  return current as Obj;
}

describe("API contract (docs/openapi.yaml vs the Nest code)", () => {
  let contract: OpenApiDoc;
  let generated: OpenApiDoc;
  let app: NestExpressApplication;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    contract = parse(readFileSync(CONTRACT_PATH, "utf8")) as OpenApiDoc;
    Object.assign(process.env, TEST_ENV);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init(); // builds the routes; nothing listens on a port
    generated = clone(buildOpenApiDocument(app)) as unknown as OpenApiDoc;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    process.env = previousEnv;
  });

  const drift = (doc: OpenApiDoc = contract, ids: readonly string[] = IMPLEMENTED_OPERATIONS) =>
    compareOperations(doc, generated, ids, PREFIX).join("\n");

  it("has no drift for the implemented operations", () => {
    expect(drift()).toBe("");
  });

  it("only lists operations that exist in the contract", () => {
    const paths = obj(contract, "paths");
    const ids = Object.values(paths).flatMap((item) =>
      Object.values(item as Obj).map((op) => (op as { operationId?: string }).operationId),
    );
    for (const id of IMPLEMENTED_OPERATIONS) expect(ids).toContain(id);
  });

  describe("detects drift (the check fails when either side changes)", () => {
    // Each case edits a copy of the CONTRACT; the generated document stays as the code produced it, which is
    // the same situation as someone editing the code instead.
    const cases: [string, (doc: OpenApiDoc) => void, RegExp][] = [
      [
        "a renamed response property",
        (d) => {
          const props = obj(d, "components.schemas.Genre.properties");
          props.label = props.slug;
          delete props.slug;
        },
        /Genre|listGenres|slug|label/,
      ],
      [
        "a property that stops being required",
        (d) => {
          const schema = obj(d, "components.schemas.MovieSummary");
          schema.required = (schema.required as string[]).filter((n) => n !== "genres");
        },
        /required/,
      ],
      [
        "a changed enum",
        (d) => {
          (obj(d, "components.schemas.MovieStatus").enum as string[]).push("CANCELLED");
        },
        /enum/,
      ],
      [
        "a nullable that is not nullable",
        (d) => {
          obj(d, "components.schemas.MovieSummary.properties").posterUrl = {
            type: "string",
            format: "uri",
          };
        },
        /nullable/,
      ],
      [
        "a different property type",
        (d) => {
          obj(d, "components.schemas.MovieSummary.properties.durationMin").type = "string";
        },
        /durationMin/,
      ],
      [
        "a removed response status",
        (d) => {
          delete obj(d, "paths./movies/{slug}.get.responses")["404"];
        },
        /response 404/,
      ],
      [
        "an extra response status",
        (d) => {
          obj(d, "paths./genres.get.responses")["500"] = { description: "x" };
        },
        /response 500/,
      ],
      [
        "a query parameter that becomes required",
        (d) => {
          const params = obj(d, "paths./movies.get") as { parameters: Obj[] };
          params.parameters[1] = {
            name: "genre",
            in: "query",
            required: true,
            schema: { type: "string" },
          };
        },
        /query:genre required/,
      ],
      [
        "a renamed query parameter",
        (d) => {
          const params = obj(d, "paths./movies.get") as { parameters: Obj[] };
          const second = params.parameters[1];
          if (second) second.name = "category";
        },
        /query:genre|query:category/,
      ],
      [
        "a changed security scheme",
        (d) => {
          obj(d, "paths./auth/me.get").security = [{ refreshCookie: [] }];
        },
        /security/,
      ],
      [
        "a changed operationId",
        (d) => {
          obj(d, "paths./genres.get").operationId = "listAllGenres";
        },
        /listGenres|listAllGenres/,
      ],
      [
        "a removed request body property",
        (d) => {
          delete obj(d, "components.schemas.LoginRequest.properties").password;
        },
        /requestBody.*password/,
      ],
      [
        "a moved path",
        (d) => {
          const paths = obj(d, "paths");
          paths["/genres-v2"] = paths["/genres"];
          delete paths["/genres"];
        },
        /listGenres/,
      ],
      [
        "a changed nested array item type",
        (d) => {
          obj(d, "components.schemas.MovieShowtimes.properties.availableDates").items = {
            type: "integer",
          };
        },
        /availableDates/,
      ],
    ];

    it.each(cases)("catches %s", (_name, mutate, expected) => {
      const mutated = clone(contract);
      mutate(mutated);

      const report = drift(mutated);

      expect(report).not.toBe("");
      expect(report).toMatch(expected);
    });

    it("catches an operation implemented in code but missing from the allowlist, and the reverse", () => {
      const withoutGenres = IMPLEMENTED_OPERATIONS.filter((id) => id !== "listGenres");

      expect(drift(contract, withoutGenres)).toMatch(
        /listGenres.*missing from IMPLEMENTED_OPERATIONS/,
      );
      expect(drift(contract, [...IMPLEMENTED_OPERATIONS, "createPaymentIntent"])).toMatch(
        /createPaymentIntent.*not implemented in code/,
      );
    });

    it("catches an endpoint that exists in code but was removed from the contract", () => {
      const mutated = clone(contract);
      delete obj(mutated, "paths")["/cinemas"];

      expect(drift(mutated)).toMatch(/listCinemas.*not defined in the contract/);
    });
  });
});
