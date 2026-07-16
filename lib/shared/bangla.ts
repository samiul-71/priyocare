/**
 * Bangla-Unicode enforcement (PRD §18.1, design.md §8).
 *
 * Legacy Bijoy/ANSI text (e.g. `LiShadhinata`) is Latin + Windows-1252 bytes
 * that only *look* Bangla when a specific font is installed. On the web it is
 * not text: unsearchable, unindexable, invisible to screen readers and Google,
 * and it corrupts the database. So every `*_bn` field must be real Unicode
 * Bangla (UTF-8), enforced here and mirrored by a DB CHECK on the catalogue
 * name columns.
 *
 * The Bengali Unicode block is U+0980–U+09FF. Bijoy text contains NO code
 * points in that block, so "must contain a Bengali-block character" reliably
 * rejects it, while a concentration guard rejects content that is
 * overwhelmingly Latin (a wrong field or mojibake). A few Latin characters —
 * brand names, "COVID" — are allowed.
 */
const BENGALI_BLOCK = /[ঀ-৿]/;
const BENGALI_BLOCK_GLOBAL = /[ঀ-৿]/g;
const LATIN_LETTER_GLOBAL = /[A-Za-z]/g;

export function isUnicodeBangla(value: string): boolean {
  const s = value.trim();
  if (s.length === 0) return false;

  // Must contain at least one real Bengali character — this alone rejects Bijoy.
  if (!BENGALI_BLOCK.test(s)) return false;

  // Bangla must not be outnumbered by Latin letters (guards mojibake / wrong field).
  const bengali = (s.match(BENGALI_BLOCK_GLOBAL) ?? []).length;
  const latin = (s.match(LATIN_LETTER_GLOBAL) ?? []).length;
  return bengali >= latin;
}

export const BANGLA_UNICODE_MESSAGE =
  "Bangla must be Unicode (UTF-8). Bijoy/ANSI text is rejected.";
