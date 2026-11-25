/**
 * RFC 4180 CSV serialization with UTF-8 BOM (Excel compatibility) and
 * spreadsheet formula-injection neutralization.
 */

const UTF8_BOM = "\uFEFF";

/**
 * Matches dangerous spreadsheet formula triggers at the start of a cell,
 * including after leading whitespace or control whitespace (`\t`, `\r`, spaces).
 */
const FORMULA_TRIGGER_RE = /^[\s]*[=+\-@\t\r]|^[\t\r]/;

/**
 * Neutralizes potential spreadsheet formula injection (`=`, `+`, `-`, `@`,
 * `\t`, `\r`, including after leading spaces) and applies RFC 4180 quoting.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);
  if (str.length === 0) {
    return "";
  }

  if (FORMULA_TRIGGER_RE.test(str)) {
    str = `'${str}`;
  }

  const needsQuoting =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsQuoting) {
    return `"${str.replaceAll('"', '""')}"`;
  }

  return str;
}

/**
 * Builds a UTF-8 BOM-prefixed, RFC 4180-compliant CSV string using CRLF line
 * endings so it opens cleanly in Microsoft Excel, Google Sheets, and Numbers.
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell)).join(","),
  );
  const body =
    dataLines.length > 0
      ? `${headerLine}\r\n${dataLines.join("\r\n")}\r\n`
      : `${headerLine}\r\n`;

  return `${UTF8_BOM}${body}`;
}

/**
 * Builds a deterministic, date-stamped CSV attachment filename in Africa/Nairobi
 * (EAT) calendar date format.
 */
export function buildExportFilename(
  reportType: string,
  now: Date = new Date(),
): string {
  const safeType = reportType
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const datePart = formatter.format(now);
  return `mwaila-graduation-${safeType}-${datePart}.csv`;
}
