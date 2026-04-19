/**
Write a compressJSONSchema type, that compresses openapi schemas. 
- Remove any useless metadata like $schema, additionalProperties, 
- Use [] and {}, | notation to represent arrays, objects, and union respectively
- Remove "type", make it similar to typescript, so instead of "fieldName": { "type": "string" }, it will be { "fieldName": string }
- Remove quotations, example: "fieldName" to fieldName
- For non required properties, use the ? notation. Example, fieldName?
 */
type PrimitiveType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "object"
  | "array";

export interface JSONSchema {
  // Common metadata (stripped during compression)
  $schema?: string;
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  additionalProperties?: boolean | JSONSchema;

  // Core
  type?: PrimitiveType | PrimitiveType[];
  enum?: unknown[];
  const?: unknown;

  // Object
  properties?: Record<string, JSONSchema>;
  required?: string[];

  // Array
  items?: JSONSchema | JSONSchema[];
  prefixItems?: JSONSchema[];

  // Composition
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  not?: JSONSchema;

  // Reference
  $ref?: string;

  // OpenAPI extensions
  nullable?: boolean;
  discriminator?: { propertyName: string };

  [key: string]: unknown;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface CompressOptions {
  /** Indent nested objects/arrays. Default: false (inline) */
  indent?: boolean;
  /** Characters per indent level when indent:true. Default: 2 */
  indentSize?: number;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

export function compressJSONSchema(
  schema: Record<string, unknown>,
  options: CompressOptions = {}
): string {
  const { indent = false, indentSize = 2 } = options;
  return compress(schema, indent, indentSize, 0);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function compress(
  schema: JSONSchema,
  indent: boolean,
  indentSize: number,
  depth: number
): string {
  // $ref → use the definition name directly
  if (schema.$ref) {
    return refName(schema.$ref);
  }

  // const → literal type
  if (schema.const !== undefined) {
    return formatLiteral(schema.const);
  }

  // enum → union of literals
  if (schema.enum) {
    return schema.enum.map(formatLiteral).join(" | ");
  }

  // Nullable (OpenAPI 3.0 extension) — wrap in union with null
  const nullable = schema.nullable;

  // anyOf / oneOf → union  (treat the same for compression purposes)
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf ?? schema.oneOf)!;
    const union = variants
      .map((s) => compress(s, indent, indentSize, depth))
      .join(" | ");
    return nullable ? `${union} | null` : union;
  }

  // allOf → intersection
  if (schema.allOf) {
    const intersection = schema.allOf
      .map((s) => compress(s, indent, indentSize, depth))
      .join(" & ");
    return nullable ? `(${intersection}) | null` : intersection;
  }

  // not
  if (schema.not) {
    const inner = compress(schema.not, indent, indentSize, depth);
    const result = `not<${inner}>`;
    return nullable ? `${result} | null` : result;
  }

  // Resolve type (may be an array like ["string", "null"])
  const { types, hasNullType } = resolveTypes(schema);
  const isNullable = nullable || hasNullType;

  // Multi-type → recurse per type and union them
  if (types.length > 1) {
    const union = types
      .map((t) =>
        compress(
          { ...schema, type: t, nullable: false },
          indent,
          indentSize,
          depth
        )
      )
      .join(" | ");
    return isNullable ? `${union} | null` : union;
  }

  const type = types[0];
  let result: string;

  switch (type) {
    case "array":
      result = compressArray(schema, indent, indentSize, depth);
      break;
    case "object":
      result = compressObject(schema, indent, indentSize, depth);
      break;
    default:
      result = mapPrimitive(type);
  }

  return isNullable ? `${result} | null` : result;
}

// ─── Array ────────────────────────────────────────────────────────────────────

function compressArray(
  schema: JSONSchema,
  indent: boolean,
  indentSize: number,
  depth: number
): string {
  // Tuple (prefixItems or items[])
  const tuple =
    schema.prefixItems ?? (Array.isArray(schema.items) ? schema.items : null);
  if (tuple) {
    const inner = tuple
      .map((s) => compress(s, indent, indentSize, depth + 1))
      .join(", ");
    return `[${inner}]`;
  }

  if (schema.items && !Array.isArray(schema.items)) {
    const inner = compress(schema.items, indent, indentSize, depth + 1);
    // Wrap in parens if it's a union to keep it unambiguous: (A | B)[]
    const wrapped = inner.includes(" | ") ? `(${inner})` : inner;
    return `${wrapped}[]`;
  }

  return "unknown[]";
}

// ─── Object ───────────────────────────────────────────────────────────────────

function compressObject(
  schema: JSONSchema,
  indent: boolean,
  indentSize: number,
  depth: number
): string {
  const props = schema.properties;
  if (!props || Object.keys(props).length === 0) return "{}";

  const required = new Set(schema.required ?? []);
  const pad = indent ? " ".repeat(indentSize * (depth + 1)) : "";
  const closePad = indent ? " ".repeat(indentSize * depth) : "";
  const sep = indent ? "\n" : " ";
  const entrySep = indent ? ";\n" : "; ";

  const fields = Object.entries(props).map(([key, value]) => {
    const optional = required.has(key) ? "" : "?";
    const compressed = compress(value, indent, indentSize, depth + 1);
    return `${pad}${key}${optional}: ${compressed}`;
  });

  const inner = fields.join(entrySep);

  return indent ? `{${sep}${inner}${sep}${closePad}}` : `{ ${inner} }`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveTypes(schema: JSONSchema): {
  types: PrimitiveType[];
  hasNullType: boolean;
} {
  const raw = schema.type;

  if (!raw) {
    // Infer from shape
    if (schema.properties) return { types: ["object"], hasNullType: false };
    if (schema.items || schema.prefixItems)
      return { types: ["array"], hasNullType: false };
    return { types: ["unknown" as PrimitiveType], hasNullType: false };
  }

  const arr = Array.isArray(raw) ? raw : [raw];
  // Filter out "null" from type arrays — handled by nullable union logic above
  const hasNullType = arr.includes("null");
  const nonNull = arr.filter((t) => t !== "null") as PrimitiveType[];
  return { types: nonNull, hasNullType };
}

function mapPrimitive(type: PrimitiveType | "unknown"): string {
  switch (type) {
    case "integer":
      return "number";
    case "unknown":
      return "unknown";
    default:
      return type; // string | number | boolean | null | object | array
  }
}

function formatLiteral(v: unknown): string {
  if (typeof v === "string") return `'${v}'`;
  return JSON.stringify(v); // numbers, booleans, null stay as-is
}

function refName($ref: string): string {
  // "#/components/schemas/Foo" → "Foo"
  // "#/definitions/Foo"       → "Foo"
  return $ref.split("/").pop() ?? $ref;
}
