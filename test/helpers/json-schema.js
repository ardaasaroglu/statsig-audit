// A small JSON Schema validator for the subset docs/report.schema.json uses:
// type, const, enum, properties, required, additionalProperties, items, oneOf, anyOf,
// minimum, maximum, pattern and local $ref. Enough to keep the documented schema honest
// without a dependency.

export function validate(schema, value, root = schema, path = "$") {
  const errors = [];
  const fail = (msg) => errors.push(`${path}: ${msg}`);

  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, "").split("/").reduce((node, key) => node?.[key], root);
    if (!target) return [`${path}: unresolved $ref ${schema.$ref}`];
    return validate(target, value, root, path);
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s) => validate(s, value, root, path).length === 0).length;
    if (passing !== 1) fail(`matches ${passing} of the oneOf branches, expected exactly 1`);
    return errors;
  }
  if (schema.anyOf && !schema.anyOf.some((s) => validate(s, value, root, path).length === 0)) fail("matches no anyOf branch");

  if ("const" in schema && value !== schema.const) fail(`expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const ok = types.some((t) => t === actual || (t === "integer" && Number.isInteger(value)) || (t === "number" && typeof value === "number"));
    if (!ok) {
      fail(`expected ${types.join(" or ")}, got ${actual}`);
      return errors;
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`above maximum ${schema.maximum}`);
  }
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`does not match ${schema.pattern}`);

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) fail(`missing required "${key}"`);
    const props = schema.properties || {};
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) errors.push(...validate(props[key], v, root, `${path}.${key}`));
      else if (schema.additionalProperties === false) fail(`unexpected property "${key}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...validate(schema.additionalProperties, v, root, `${path}.${key}`));
      }
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, root, `${path}[${i}]`)));
  return errors;
}
