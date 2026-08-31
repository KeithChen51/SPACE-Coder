import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { validateVisualVerification } from "./visual-route-contract.mjs";

export const ADOPTION_PLAN_SCHEMA_DIGEST = "7f4a94ed4d2eb53685a338047d03ec6611116dd0ef914b3a4421bcf7cc32263c";

export function adoptionPlanValidationErrors(plan, schema) {
  let validate;
  try {
    validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(schema);
  } catch (error) {
    return [`schema could not be compiled: ${error.message}`];
  }
  const errors = [];
  if (!validate(plan)) {
    errors.push(...validate.errors.map((error) => `${error.instancePath || "/"} ${error.message}`));
  }
  try {
    validateVisualVerification(plan?.visualVerification);
  } catch (error) {
    errors.push(`/visualVerification ${error.message}`);
  }
  return [...new Set(errors)];
}

export function adoptionPlanBinding(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  return {
    path: "adoption/adoption-plan.json",
    bytes: bytes.byteLength,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function exactAdoptionPlanBinding(value, raw) {
  const expected = adoptionPlanBinding(raw);
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "bytes,digest,path"
    && value.path === expected.path
    && value.bytes === expected.bytes
    && value.digest === expected.digest;
}
