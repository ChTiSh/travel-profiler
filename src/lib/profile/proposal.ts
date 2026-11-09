import {
  TravelProfileSchema,
  isSingleValueField,
  type ProfileField,
  type ProfileUpdateItem,
  type ProfileUpdateProposal,
} from "@/lib/contracts";

export type ParsedUpdate =
  | { ok: true; proposal: ProfileUpdateProposal }
  | { ok: false; field: ProfileField; reason: string };

/**
 * Runtime boundary for LLM output: turns one loosely-typed `updateProfile`
 * item into a proposal whose value matches the field's schema.
 *
 * Lenient where a model's intent is unambiguous (a one-item array for a
 * single-value field, "$1,500" for a number), strict everywhere else. A
 * rejection carries a reason the model can act on, e.g. the allowed options.
 */
export function parseUpdateItem(item: ProfileUpdateItem): ParsedUpdate {
  const { field, op, evidence } = item;
  const schema = TravelProfileSchema.shape[field];
  const reject = (reason: string): ParsedUpdate => ({ ok: false, field, reason });

  if (isSingleValueField(field)) {
    if (op !== "set") return reject(`"${field}" holds a single value; use op "set".`);

    let value = item.value;
    if (Array.isArray(value)) {
      if (value.length !== 1) return reject(`"${field}" holds a single value, not a list.`);
      value = value[0]!;
    }
    if (field === "dailyBudgetUSD" && typeof value === "string") {
      const n = Number(value.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n)) return reject(`"${field}" must be a number of US dollars per day.`);
      value = n;
    }
    if (field === "homeAirport" && typeof value === "string" && /^[a-z]{3}$/i.test(value.trim())) {
      value = value.trim().toUpperCase();
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success || parsed.data === undefined || Array.isArray(parsed.data)) {
      return reject(issueMessage(field, parsed.error));
    }
    return { ok: true, proposal: { field, op: "set", value: parsed.data, evidence } };
  }

  const items = Array.isArray(item.value) ? item.value : [item.value];
  const parsed = schema.safeParse(items.map(String));
  if (!parsed.success || !Array.isArray(parsed.data)) return reject(issueMessage(field, parsed.error));
  if (parsed.data.length === 0) return reject(`No items given for "${field}".`);
  return { ok: true, proposal: { field, op, items: parsed.data, evidence } };
}

function issueMessage(field: ProfileField, error: { issues: { message: string }[] } | undefined): string {
  return `Invalid value for "${field}": ${error?.issues[0]?.message ?? "unexpected shape"}.`;
}
