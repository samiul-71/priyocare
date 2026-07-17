import { test } from "node:test";
import assert from "node:assert/strict";
import { customerFilterSchema } from "../lib/shared/office-schemas.ts";
import { buildXlsx, type XlsxColumn } from "../lib/server/office/xlsx.ts";

/*
 * Admin customer directory (§6) + its .xlsx export. The filters come straight
 * off the URL, so a hand-edited query must degrade to "show everything", never
 * throw. The export is hand-rolled OOXML (no spreadsheet dependency); because
 * its ZIP entries are STORED uncompressed, the XML is literally in the bytes and
 * these tests can read it back without a reader library.
 */

/* ------------------------------------------------------------ the filters */

test("an empty query is valid and means 'everyone', page 1", () => {
  const f = customerFilterSchema.parse({});
  assert.equal(f.page, 1);
  assert.equal(f.q, undefined);
  assert.equal(f.locale, undefined);
  assert.equal(f.hasBookings, undefined);
});

test("page coerces, and a garbage page falls back to 1 rather than throwing", () => {
  assert.equal(customerFilterSchema.parse({ page: "3" }).page, 3);
  assert.equal(customerFilterSchema.parse({ page: "abc" }).page, 1);
  assert.equal(customerFilterSchema.parse({ page: "0" }).page, 1); // min(1) → catch
  assert.equal(customerFilterSchema.parse({ page: "-5" }).page, 1);
});

test("a bad enum value is dropped, not fatal — the rest of the query still applies", () => {
  const f = customerFilterSchema.parse({ locale: "fr", hasBookings: "maybe", q: "rahim" });
  assert.equal(f.locale, undefined);
  assert.equal(f.hasBookings, undefined);
  assert.equal(f.q, "rahim");
});

test("dates must look like YYYY-MM-DD; anything else is ignored", () => {
  assert.equal(customerFilterSchema.parse({ from: "2026-06-01" }).from, "2026-06-01");
  assert.equal(customerFilterSchema.parse({ from: "01/06/2026" }).from, undefined);
  assert.equal(customerFilterSchema.parse({ to: "yesterday" }).to, undefined);
});

/* -------------------------------------------------------------- the export */

const cols: XlsxColumn[] = [
  { header: "Name", key: "name", type: "string" },
  { header: "Registered", key: "reg", type: "date" },
  { header: "Spent", key: "spent", type: "number" },
];

function xml(rows: Record<string, unknown>[]): string {
  return buildXlsx("Customers", cols, rows as never).toString("utf8");
}

test("the file is a ZIP and carries the OOXML parts a workbook needs", () => {
  const buf = buildXlsx("Customers", cols, []);
  assert.equal(buf[0], 0x50); // 'P'
  assert.equal(buf[1], 0x4b); // 'K'
  const s = buf.toString("utf8");
  for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) {
    assert.ok(s.includes(part), `missing part ${part}`);
  }
});

test("XML-hostile values are escaped, not allowed to corrupt the sheet", () => {
  const s = xml([{ name: "A & B <script>", reg: null, spent: 0 }]);
  assert.ok(s.includes("A &amp; B &lt;script&gt;"));
  assert.ok(!s.includes("<script>"));
});

test("numbers are typed number cells; a completed spend rounds to nothing lost", () => {
  const s = xml([{ name: "x", reg: null, spent: 1500.5 }]);
  assert.ok(s.includes("<v>1500.5</v>"));
});

test("dates become real Excel serials (1899-12-30 epoch), styled as dates", () => {
  const s = xml([{ name: "x", reg: "2026-06-02", spent: 0 }]);
  assert.ok(s.includes("<v>46175</v>"), "2026-06-02 → serial 46175");
  assert.ok(s.includes('s="2"'), "date cells carry the date style");
});

test("the header row is bold (style 1) and Unicode survives the round-trip", () => {
  const s = xml([{ name: "আয়েশা", reg: null, spent: 0 }]);
  assert.ok(s.includes('s="1"'), "header cells use the bold style");
  assert.ok(s.includes("আয়েশা"), "Bangla name preserved");
});

test("an empty value is a truly empty cell, not the string 'null'", () => {
  const s = xml([{ name: "", reg: null, spent: undefined }]);
  assert.ok(!s.toLowerCase().includes(">null<"));
  assert.ok(!s.toLowerCase().includes(">undefined<"));
});
