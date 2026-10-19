/** The Polish plural form a count takes: "one" (1), "few" (2-4, 22-24, ..., but not 12-14) or "many" (the rest). */
export type PluralForm = "one" | "few" | "many";

export function pluralForm(count: number): PluralForm {
  if (count === 1) return "one";
  const units = count % 10;
  const tens = count % 100;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? "few" : "many";
}
