/**
 * Compares two OpenAPI documents (the contract in docs/openapi.yaml and the one generated from the Nest code)
 * on the parts clients depend on: operations, parameters, request bodies, response status codes and the SHAPE of
 * every schema (property names, required, types, nullability, enums, formats, array items).
 * Descriptions, examples and numeric bounds are deliberately ignored.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type OpenApiDoc = Record<string, Json>;

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

// ---------------------------------------------------------------- schema normalisation

/** A canonical, comparable form of a JSON schema. */
export interface NormSchema {
  type?: string;
  format?: string;
  nullable?: true;
  enum?: unknown[];
  properties?: Record<string, NormSchema>;
  required?: string[];
  items?: NormSchema;
  additionalProperties?: NormSchema;
  anyOf?: NormSchema[];
}

function resolveRef(doc: Obj, ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`Only local $refs are supported: ${ref}`);
  let current: unknown = doc;
  for (const part of ref.slice(2).split("/")) {
    if (!isObj(current)) throw new Error(`Cannot resolve ${ref}`);
    current = current[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  if (current === undefined) throw new Error(`Cannot resolve ${ref}`);
  return current;
}

const sortedUnique = <T>(values: T[]): T[] =>
  [...new Set(values)].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

export function normalizeSchema(schema: unknown, doc: Obj, depth = 0): NormSchema {
  if (depth > 25) throw new Error("Schema nesting too deep (circular $ref?)");
  if (schema === true || schema === undefined || schema === null) return {};
  if (!isObj(schema)) return {};

  if (typeof schema.$ref === "string") {
    return normalizeSchema(resolveRef(doc, schema.$ref), doc, depth + 1);
  }

  const result: NormSchema = {};

  // allOf: merge object parts.
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((part) => normalizeSchema(part, doc, depth + 1));
    const own = normalizeSchema({ ...schema, allOf: undefined }, doc, depth + 1);
    return mergeAllOf([...parts, own]);
  }

  // anyOf / oneOf: a nullable wrapper `X | null` collapses to X + nullable.
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union)) {
    const variants = union.map((variant) => normalizeSchema(variant, doc, depth + 1));
    const nonNull = variants.filter(
      (variant) => !(variant.type === "null" && Object.keys(variant).length === 1),
    );
    const hasNull = nonNull.length !== variants.length;
    if (nonNull.length === 1 && nonNull[0]) {
      return hasNull ? { ...nonNull[0], nullable: true } : nonNull[0];
    }
    result.anyOf = nonNull;
    if (hasNull) result.nullable = true;
    return result;
  }

  // type: "string" | ["string", "null"] | (3.0) nullable: true
  const rawType = schema.type;
  const types = (Array.isArray(rawType) ? rawType : rawType === undefined ? [] : [rawType]).filter(
    (item): item is string => typeof item === "string",
  );
  if (types.includes("null") || schema.nullable === true) result.nullable = true;
  const concrete = types.filter((item) => item !== "null");
  if (concrete.length === 1 && concrete[0]) result.type = concrete[0];
  else if (concrete.length === 0 && types.includes("null")) result.type = "null";

  if (typeof schema.format === "string") result.format = schema.format;

  if (Array.isArray(schema.enum)) result.enum = sortedUnique(schema.enum as unknown[]);
  else if ("const" in schema) result.enum = [schema.const];

  if (isObj(schema.properties)) {
    result.type ??= "object";
    result.properties = Object.fromEntries(
      Object.entries(schema.properties)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => [name, normalizeSchema(value, doc, depth + 1)]),
    );
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    result.required = [...(schema.required as string[])].sort();
  }
  if (schema.items !== undefined) {
    result.type ??= "array";
    result.items = normalizeSchema(schema.items, doc, depth + 1);
  }
  const extra = schema.additionalProperties;
  if (isObj(extra) && Object.keys(extra).length > 0) {
    const normalized = normalizeSchema(extra, doc, depth + 1);
    if (Object.keys(normalized).length > 0) result.additionalProperties = normalized;
  }
  return result;
}

function mergeAllOf(parts: NormSchema[]): NormSchema {
  const merged: NormSchema = {};
  for (const part of parts) {
    if (Object.keys(part).length === 0) continue;
    if (part.type) merged.type = part.type;
    if (part.format) merged.format = part.format;
    if (part.nullable) merged.nullable = true;
    if (part.enum) merged.enum = part.enum;
    if (part.items) merged.items = part.items;
    if (part.additionalProperties) merged.additionalProperties = part.additionalProperties;
    if (part.properties) merged.properties = { ...merged.properties, ...part.properties };
    if (part.required)
      merged.required = sortedUnique([...(merged.required ?? []), ...part.required]);
    if (part.anyOf) merged.anyOf = part.anyOf;
  }
  if (merged.properties) {
    merged.properties = Object.fromEntries(
      Object.entries(merged.properties).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return merged;
}

// ---------------------------------------------------------------- operations

export interface NormParameter {
  name: string;
  in: string;
  required: boolean;
  schema: NormSchema;
}

export interface NormOperation {
  operationId: string;
  tags: string[];
  security: string[];
  parameters: Record<string, NormParameter>;
  requestBody: NormSchema | null;
  responses: Record<string, NormSchema | null>;
}

function deref(value: unknown, doc: Obj): Obj {
  if (isObj(value) && typeof value.$ref === "string")
    return deref(resolveRef(doc, value.$ref), doc);
  return isObj(value) ? value : {};
}

function jsonSchemaOf(content: unknown): unknown {
  if (!isObj(content)) return undefined;
  const json = content["application/json"];
  return isObj(json) ? json.schema : undefined;
}

/** `METHOD /path` (without the server prefix) -> comparable operation. */
export function collectOperations(doc: Obj, pathPrefix = ""): Record<string, NormOperation> {
  const result: Record<string, NormOperation> = {};
  const paths = isObj(doc.paths) ? doc.paths : {};
  const globalSecurity = doc.security;

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!isObj(pathItem)) continue;
    const path =
      pathPrefix && rawPath.startsWith(pathPrefix) ? rawPath.slice(pathPrefix.length) : rawPath;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!isObj(operation)) continue;

      const parameters: Record<string, NormParameter> = {};
      const rawParameters = [
        ...(Array.isArray(pathItem.parameters) ? (pathItem.parameters as unknown[]) : []),
        ...(Array.isArray(operation.parameters) ? (operation.parameters as unknown[]) : []),
      ];
      for (const rawParameter of rawParameters) {
        const parameter = deref(rawParameter, doc);
        const location = String(parameter.in);
        const name = String(parameter.name);
        parameters[`${location}:${name}`] = {
          name,
          in: location,
          required: location === "path" ? true : parameter.required === true,
          schema: normalizeSchema(parameter.schema, doc),
        };
      }

      const responses: Record<string, NormSchema | null> = {};
      const rawResponses = isObj(operation.responses) ? operation.responses : {};
      for (const [status, rawResponse] of Object.entries(rawResponses)) {
        const schema = jsonSchemaOf(deref(rawResponse, doc).content);
        responses[status] = schema === undefined ? null : normalizeSchema(schema, doc);
      }

      const body = deref(operation.requestBody, doc);
      const bodySchema = jsonSchemaOf(body.content);

      const securityRaw = (operation.security ?? globalSecurity ?? []) as unknown;
      const security = (Array.isArray(securityRaw) ? securityRaw : [])
        .flatMap((requirement) => (isObj(requirement) ? Object.keys(requirement) : []))
        .sort();

      result[`${method.toUpperCase()} ${path}`] = {
        operationId: typeof operation.operationId === "string" ? operation.operationId : "",
        tags: sortedUnique(Array.isArray(operation.tags) ? (operation.tags as string[]) : []),
        security,
        parameters,
        requestBody: bodySchema === undefined ? null : normalizeSchema(bodySchema, doc),
        responses,
      };
    }
  }
  return result;
}

// ---------------------------------------------------------------- diff

const show = (value: unknown): string => (value === undefined ? "none" : JSON.stringify(value));

function diffValue(path: string, contract: unknown, actual: unknown, out: string[]): void {
  if (JSON.stringify(contract) !== JSON.stringify(actual)) {
    out.push(`${path}: contract ${show(contract)} vs code ${show(actual)}`);
  }
}

export function diffSchemas(
  path: string,
  contract: NormSchema | null | undefined,
  actual: NormSchema | null | undefined,
  out: string[],
): void {
  if (!contract || !actual) {
    if (contract || actual) {
      out.push(
        `${path}: contract ${contract ? "has a body schema" : "has no body"}, code ${actual ? "has a body schema" : "has no body"}`,
      );
    }
    return;
  }
  diffValue(`${path} type`, contract.type, actual.type, out);
  diffValue(`${path} format`, contract.format, actual.format, out);
  diffValue(`${path} nullable`, contract.nullable ?? false, actual.nullable ?? false, out);
  diffValue(`${path} enum`, contract.enum, actual.enum, out);
  diffValue(`${path} required`, contract.required ?? [], actual.required ?? [], out);

  const names = sortedUnique([
    ...Object.keys(contract.properties ?? {}),
    ...Object.keys(actual.properties ?? {}),
  ]);
  for (const name of names) {
    const left = contract.properties?.[name];
    const right = actual.properties?.[name];
    if (!left) out.push(`${path}.${name}: property exists in code but not in the contract`);
    else if (!right) out.push(`${path}.${name}: property exists in the contract but not in code`);
    else diffSchemas(`${path}.${name}`, left, right, out);
  }
  if (contract.items || actual.items) diffSchemas(`${path}[]`, contract.items, actual.items, out);
  if (contract.additionalProperties || actual.additionalProperties) {
    diffSchemas(`${path}{*}`, contract.additionalProperties, actual.additionalProperties, out);
  }
  if (contract.anyOf || actual.anyOf) diffValue(`${path} anyOf`, contract.anyOf, actual.anyOf, out);
}

/** Drift between the contract and the generated document for the given operation ids. Empty = in sync. */
export function compareOperations(
  contractDoc: OpenApiDoc,
  actualDoc: OpenApiDoc,
  implementedOperationIds: readonly string[],
  pathPrefix: string,
): string[] {
  const out: string[] = [];
  const contract = collectOperations(contractDoc);
  const actual = collectOperations(actualDoc, pathPrefix);

  const contractById = new Map(Object.entries(contract).map(([key, op]) => [op.operationId, key]));
  const actualById = new Map(Object.entries(actual).map(([key, op]) => [op.operationId, key]));

  // The allowlist must be exactly the set of operations the code implements.
  for (const [id, key] of actualById) {
    if (!contractById.has(id))
      out.push(`${key} (${id}): implemented in code but not defined in the contract`);
    else if (!implementedOperationIds.includes(id)) {
      out.push(
        `${id}: implemented in code but missing from IMPLEMENTED_OPERATIONS (add it so it is checked)`,
      );
    }
  }
  for (const id of implementedOperationIds) {
    if (!contractById.has(id))
      out.push(`${id}: listed in IMPLEMENTED_OPERATIONS but not in the contract`);
    if (!actualById.has(id))
      out.push(`${id}: listed in IMPLEMENTED_OPERATIONS but not implemented in code`);
  }

  for (const id of implementedOperationIds) {
    const contractKey = contractById.get(id);
    const actualKey = actualById.get(id);
    if (!contractKey || !actualKey) continue;
    const left = contract[contractKey];
    const right = actual[actualKey];
    if (!left || !right) continue;
    const at = `${id} [${contractKey}]`;

    if (contractKey !== actualKey)
      out.push(`${id}: contract is ${contractKey} but code serves ${actualKey}`);
    diffValue(`${at} tags`, left.tags, right.tags, out);
    diffValue(`${at} security`, left.security, right.security, out);

    for (const key of sortedUnique([
      ...Object.keys(left.parameters),
      ...Object.keys(right.parameters),
    ])) {
      const a = left.parameters[key];
      const b = right.parameters[key];
      if (!a) out.push(`${at} parameter ${key}: in code but not in the contract`);
      else if (!b) out.push(`${at} parameter ${key}: in the contract but not in code`);
      else {
        diffValue(`${at} parameter ${key} required`, a.required, b.required, out);
        diffSchemas(`${at} parameter ${key}`, a.schema, b.schema, out);
      }
    }

    diffSchemas(`${at} requestBody`, left.requestBody, right.requestBody, out);

    for (const status of sortedUnique([
      ...Object.keys(left.responses),
      ...Object.keys(right.responses),
    ])) {
      if (!(status in left.responses))
        out.push(`${at} response ${status}: in code but not in the contract`);
      else if (!(status in right.responses))
        out.push(`${at} response ${status}: in the contract but not in code`);
      else
        diffSchemas(
          `${at} response ${status}`,
          left.responses[status],
          right.responses[status],
          out,
        );
    }
  }
  return out;
}
