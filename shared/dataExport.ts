/**
 * One shape for anything a member can pull out of the app (a report, their
 * bet history), and the file formats it can leave in: CSV, JSON, XML and
 * Markdown.
 *
 * Every format carries the same things: what the data is, when it was
 * generated, and a description of each column. That makes a file readable on
 * its own, by a person or by an AI assistant reading it through a connector,
 * without having to guess what "bar" or "decided_at_utc" means.
 */

export const EXPORT_FORMATS = ["csv", "json", "xml", "md"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return (EXPORT_FORMATS as readonly unknown[]).includes(value);
}

export type DatasetValue = string | number | boolean | null;

export type DatasetColumn = {
  /** snake_case, stable across exports: the field name in JSON and XML. */
  key: string;
  /** Column heading for people (Markdown tables, the on-screen grid). */
  label: string;
  type: "string" | "number" | "boolean" | "datetime";
  description: string;
};

export type Dataset = {
  /** snake_case identifier, e.g. "bet_history" or "league_standings". */
  name: string;
  title: string;
  description: string;
  /** ISO 8601, UTC. */
  generatedAt: string;
  /** What the data was narrowed to (league, season, …), for the reader. */
  scope?: Record<string, DatasetValue>;
  columns: DatasetColumn[];
  rows: Record<string, DatasetValue>[];
};

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

function csvCell(value: DatasetValue): string {
  let s = value == null ? "" : String(value);
  // A cell starting with = + - @ runs as a formula in Excel/Sheets. Lines and
  // odds legitimately start with + or -, so only guard non-numeric text.
  if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Header row of column keys, then the rows. The BOM makes Excel read UTF-8. */
export function datasetToCsv(data: Dataset): string {
  const lines = [
    data.columns.map((c) => c.key),
    ...data.rows.map((r) => data.columns.map((c) => csvCell(r[c.key] ?? null))),
  ];
  return "﻿" + lines.map((l) => l.join(",")).join("\r\n") + "\r\n";
}

export function datasetToJson(data: Dataset): string {
  return JSON.stringify(
    {
      dataset: data.name,
      title: data.title,
      description: data.description,
      generated_at: data.generatedAt,
      scope: data.scope ?? {},
      row_count: data.rows.length,
      columns: data.columns.map((c) => ({ key: c.key, label: c.label, type: c.type, description: c.description })),
      rows: data.rows.map((r) => Object.fromEntries(data.columns.map((c) => [c.key, r[c.key] ?? null]))),
    },
    null,
    2,
  ) + "\n";
}

function xmlEscape(value: DatasetValue): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters XML 1.0 doesn't allow.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/**
 * <dataset> with a <columns> dictionary and one <row> per record. Each field
 * is an element named for its column key; an empty value is an empty element.
 */
export function datasetToXml(data: Dataset): string {
  const attrs = [
    `name="${xmlEscape(data.name)}"`,
    `generated_at="${xmlEscape(data.generatedAt)}"`,
    `row_count="${data.rows.length}"`,
  ].join(" ");
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<dataset ${attrs}>`,
    `  <title>${xmlEscape(data.title)}</title>`,
    `  <description>${xmlEscape(data.description)}</description>`,
    `  <scope>`,
    ...Object.entries(data.scope ?? {}).map(([k, v]) => `    <${k}>${xmlEscape(v)}</${k}>`),
    `  </scope>`,
    `  <columns>`,
    ...data.columns.map((c) =>
      `    <column key="${xmlEscape(c.key)}" label="${xmlEscape(c.label)}" type="${c.type}">${xmlEscape(c.description)}</column>`),
    `  </columns>`,
    `  <rows>`,
    ...data.rows.flatMap((r) => [
      `    <row>`,
      ...data.columns.map((c) => `      <${c.key}>${xmlEscape(r[c.key] ?? null)}</${c.key}>`),
      `    </row>`,
    ]),
    `  </rows>`,
    `</dataset>`,
  ];
  return lines.join("\n") + "\n";
}

const mdCell = (value: DatasetValue) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** A titled Markdown document: what it is, the table, then a column glossary. */
export function datasetToMarkdown(data: Dataset): string {
  const scope = Object.entries(data.scope ?? {}).filter(([, v]) => v != null && v !== "");
  const lines = [
    `# ${data.title}`,
    "",
    data.description,
    "",
    `- Generated: ${data.generatedAt}`,
    ...scope.map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`),
    `- Rows: ${data.rows.length}`,
    "",
    `| ${data.columns.map((c) => mdCell(c.label)).join(" | ")} |`,
    `| ${data.columns.map((c) => (c.type === "number" ? "---:" : "---")).join(" | ")} |`,
    ...data.rows.map((r) => `| ${data.columns.map((c) => mdCell(r[c.key] ?? null)).join(" | ")} |`),
    "",
    "## Columns",
    "",
    ...data.columns.map((c) => `- **${c.label}** (\`${c.key}\`, ${c.type}): ${c.description}`),
  ];
  return lines.join("\n") + "\n";
}

export function serializeDataset(data: Dataset, format: ExportFormat): string {
  switch (format) {
    case "json": return datasetToJson(data);
    case "xml": return datasetToXml(data);
    case "md": return datasetToMarkdown(data);
    default: return datasetToCsv(data);
  }
}

/** "league-standings-2026-10-07.json" */
export function exportFilename(name: string, format: ExportFormat, now: Date = new Date()): string {
  return `${name.replace(/_/g, "-")}-${now.toISOString().slice(0, 10)}.${format}`;
}
