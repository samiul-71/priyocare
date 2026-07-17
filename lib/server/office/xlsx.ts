import "server-only";

/**
 * A tiny, dependency-free `.xlsx` writer (§ customer export).
 *
 * WHY HAND-ROLLED: an `.xlsx` is a ZIP of a handful of XML parts, and this repo
 * keeps its dependency list short on purpose (argon2, drizzle, jose, next,
 * postgres, react, zod — nothing else). Pulling in a spreadsheet library and its
 * transitive tree to emit six small XML files would be out of character and a
 * supply-chain surface for a report nobody's security depends on. This writes
 * the OOXML by hand: a bold header row, real number cells, and real date cells.
 *
 * Scope is deliberately narrow — one sheet, three cell types (string, number,
 * date), STORE (uncompressed) entries. It is an export format, not a document
 * editor; if we ever need formulas or multiple sheets, reach for a library then.
 */

export type XlsxCellType = "string" | "number" | "date";
export interface XlsxColumn {
  header: string;
  /** Key into each row object. */
  key: string;
  type: XlsxCellType;
}
export type XlsxRow = Record<string, string | number | Date | null | undefined>;

/* --------------------------------------------------------------- XML helpers */

// Control chars XML 1.0 forbids outright (everything below 0x20 except tab,
// newline, carriage return). A stray one from the database would corrupt the file.
const XML_FORBIDDEN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

function esc(s: string): string {
  return s
    .replace(XML_FORBIDDEN, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 1 → "A", 27 → "AA". */
function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Excel's serial date: whole days since 1899-12-30. Computed from the date's
 * calendar components (UTC) so the value written is exactly the day passed in,
 * with no timezone drift — the caller decides which calendar day a timestamp
 * belongs to before handing it over.
 */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function excelSerial(d: Date): number {
  const dayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dayUtc - EXCEL_EPOCH) / 86_400_000);
}

/* ----------------------------------------------------------------- XML parts */

function sheetXml(columns: XlsxColumn[], rows: XlsxRow[]): string {
  const headerCells = columns
    .map((c, i) => `<c r="${colLetter(i + 1)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${esc(c.header)}</t></is></c>`)
    .join("");

  const bodyRows = rows
    .map((row, r) => {
      const rowNum = r + 2; // row 1 is the header
      const cells = columns
        .map((col, i) => {
          const ref = `${colLetter(i + 1)}${rowNum}`;
          const v = row[col.key];
          if (v === null || v === undefined || v === "") return `<c r="${ref}"/>`;
          if (col.type === "number") {
            const n = typeof v === "number" ? v : Number(v);
            return Number.isFinite(n) ? `<c r="${ref}"><v>${n}</v></c>` : `<c r="${ref}"/>`;
          }
          if (col.type === "date") {
            const d = v instanceof Date ? v : new Date(String(v));
            return Number.isNaN(d.getTime())
              ? `<c r="${ref}"/>`
              : `<c r="${ref}" s="2"><v>${excelSerial(d)}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNum}">${cells}</row>`;
    })
    .join("");

  // Column widths: a rough autosize from the widest value seen, clamped.
  const cols = columns
    .map((c, i) => {
      let w = c.header.length;
      for (const row of rows) {
        const v = row[c.key];
        if (v != null) w = Math.max(w, String(v).length);
      }
      const width = Math.min(Math.max(w + 2, 8), 50);
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${cols}</cols>` +
    `<sheetData><row r="1">${headerCells}</row>${bodyRows}</sheetData>` +
    `</worksheet>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// s=0 default, s=1 bold (header), s=2 date (numFmt 164 = yyyy-mm-dd).
const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function workbookXml(sheetName: string): string {
  // Sheet names: ≤31 chars, and none of : \ / ? * [ ].
  const safe = sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet1";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${esc(safe)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

/* ------------------------------------------------------------------- the ZIP */

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (CRC_TABLE = t);
}
function crc32(buf: Buffer): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Assemble a ZIP with STORE (uncompressed) entries — the smallest correct container. */
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const size = e.data.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0x0800, 6); // flag bit 11: filenames are UTF-8
    lfh.writeUInt16LE(0, 8); // method 0 = STORE
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0x21, 12); // mod date (1980-01-01, any valid value)
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18);
    lfh.writeUInt32LE(size, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    local.push(lfh, nameBuf, e.data);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0x0800, 8);
    cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(size, 20);
    cdh.writeUInt32LE(size, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra
    cdh.writeUInt16LE(0, 32); // comment
    cdh.writeUInt16LE(0, 34); // disk number
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(offset, 42);
    central.push(cdh, nameBuf);

    offset += 30 + nameBuf.length + size;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...local, centralBuf, eocd]);
}

/**
 * Build a single-sheet `.xlsx` workbook. Returns the file bytes ready to stream
 * with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
 */
export function buildXlsx(sheetName: string, columns: XlsxColumn[], rows: XlsxRow[]): Buffer {
  const enc = (s: string) => Buffer.from(s, "utf8");
  return zip([
    { name: "[Content_Types].xml", data: enc(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc(ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc(workbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: enc(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheetXml(columns, rows)) },
  ]);
}
