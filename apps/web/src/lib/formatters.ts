const PT_BR_LOCALE = "pt-BR";

function titleCaseSegment(segment: string) {
  if (!segment) return "";
  const lower = segment.toLocaleLowerCase(PT_BR_LOCALE);
  const chars = Array.from(lower);
  const first = chars[0];
  if (!first) return "";
  const rest = chars.slice(1).join("");
  return `${first.toLocaleUpperCase(PT_BR_LOCALE)}${rest}`;
}

export function toTitleCase(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const normalized = raw.replace(/\s+/g, " ");
  return normalized
    .split(" ")
    .map((token) =>
      token
        .split("-")
        .map((segment) => titleCaseSegment(segment))
        .join("-"),
    )
    .join(" ");
}
