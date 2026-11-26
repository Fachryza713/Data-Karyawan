/**
 * Penulisan CSV (RFC 4180) untuk ekspor absensi. Diawali BOM supaya Excel
 * membaca UTF-8 dengan benar.
 */

export const CSV_BOM = String.fromCharCode(0xfeff);

/** Awal sel yang dibaca Excel/Sheets sebagai rumus (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

type Cell = string | number | null | undefined;

/**
 * Satu sel. Teks bebas (nama, departemen) yang diawali karakter rumus diberi
 * awalan ' supaya tidak dieksekusi sebagai rumus. Angka ditulis apa adanya
 * (koordinat negatif tetap angka).
 */
export function csvCell(value: Cell, { text = false } = {}): string {
  if (value === null || value === undefined) {
    return '';
  }
  let cell = String(value);
  if (text && FORMULA_START.test(cell)) {
    cell = `'${cell}`;
  }
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function csvLine(cells: string[]): string {
  return `${cells.join(',')}\r\n`;
}
