/** RFC4180-ish CSV parser (UTF-8 / BOM). No simple split(','). */

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 5_000;
export const CSV_MAX_QTY_PER_ROW = 100;
export const CSV_MAX_VOUCHERS_PER_BATCH = 10_000;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const input = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // skip trailing empty line
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      pushField();
      pushRow();
      i += 1;
      if (input[i] === '\n') i += 1;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
    pushRow();
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = rows[0]!.map((h) => h.trim());
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

/** Excel formula injection guard for CSV cells */
export function sanitizeCsvCell(value: string): string {
  const v = value ?? '';
  if (/^[=+\-@]/.test(v) || /^[\t\r]/.test(v)) {
    return `'${v}`;
  }
  return v;
}

export function buildCsvWithBom(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => {
    const s = sanitizeCsvCell(cell);
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const r of rows) {
    lines.push(r.map((c) => escape(c ?? '')).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}
