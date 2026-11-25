/**
 * Buat diagram ERD database dari prisma/schema.prisma ke docs/erd.svg.
 * Jalankan ulang setiap kali skema berubah: `npm run erd`.
 *
 * Skema di-parse dengan @mrleebo/prisma-ast lalu digambar dengan Graphviz
 * (@viz-js/viz, WebAssembly). Tidak butuh database, Chromium, atau Docker.
 * Diagram memakai nama tabel/kolom database (hasil @@map/@map).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSchema,
  type Attribute,
  type BlockAttribute,
  type Enum,
  type Field,
  type Model,
  type Value,
} from '@mrleebo/prisma-ast';
import { instance } from '@viz-js/viz';

const SCHEMA_PATH = fileURLToPath(
  new URL('../prisma/schema.prisma', import.meta.url),
);
const OUTPUT_PATH = fileURLToPath(
  new URL('../../docs/erd.svg', import.meta.url),
);

const SCALAR_TYPES: Record<string, string> = {
  String: 'text',
  Int: 'int',
  BigInt: 'bigint',
  Boolean: 'bool',
  DateTime: 'timestamp',
  Decimal: 'decimal',
  Float: 'float8',
  Json: 'jsonb',
  Bytes: 'bytea',
};

type Column = {
  name: string;
  type: string;
  nullable: boolean;
  pk: boolean;
  unique: boolean;
  fk: boolean;
  enumName?: string;
};

type Relation = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  nullable: boolean;
  oneToOne: boolean;
};

type Table = {
  name: string;
  model: string;
  columns: Column[];
  compositeUniques: string[][];
};

const unquote = (value: unknown) =>
  typeof value === 'string' ? value.replace(/^"|"$/g, '') : '';

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attr = (field: Field, name: string, group?: string) =>
  field.attributes?.find((a) => a.name === name && a.group === group);

/** Argumen bernama (contoh fields: [...]) atau argumen posisi pertama. */
function argValue(
  attribute: Attribute | BlockAttribute,
  key?: string,
): Value | undefined {
  for (const arg of attribute.args ?? []) {
    const value = arg.value;
    const isKeyValue =
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      value.type === 'keyValue';
    if (key === undefined && !isKeyValue) return value as Value;
    if (key !== undefined && isKeyValue && value.key === key) {
      return value.value;
    }
  }
  return undefined;
}

/** Nilai array Prisma ([a, b] atau [a(ops: ...)]) menjadi daftar nama field. */
function fieldList(value: Value | undefined): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  if (value.type !== 'array') return [];
  return value.args.map(text);
}

/** Teks dari nilai AST: literal apa adanya, fungsi (contoh a(ops: ...)) jadi namanya. */
function text(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (typeof value === 'object' && value !== null && 'name' in value) {
    return typeof value.name === 'string' ? value.name : '';
  }
  return '';
}

/** Nama tipe field: String, Employee, atau nama fungsi seperti Unsupported. */
const typeName = (field: Field) => text(field.fieldType);

function mappedName(
  attributes: Array<Attribute | BlockAttribute>,
  fallback: string,
): string {
  const map = attributes.find((a) => a.name === 'map' && !a.group);
  return map ? unquote(argValue(map)) || fallback : fallback;
}

function columnType(field: Field, enums: Map<string, string>): string {
  const base = typeName(field);
  const native = field.attributes?.find((a) => a.group === 'db');
  if (native) {
    const params = (native.args ?? []).map((a) => text(a.value));
    const name = native.name.toLowerCase();
    // Presisi timestamptz(3) tidak penting di diagram.
    if (name === 'timestamptz' || name === 'uuid' || name === 'date') {
      return name;
    }
    return params.length ? `${name}(${params.join(',')})` : name;
  }
  return enums.get(base) ?? SCALAR_TYPES[base] ?? base;
}

function parse(source: string) {
  const schema = getSchema(source);
  const models = schema.list.filter((b): b is Model => b.type === 'model');
  const enums = schema.list.filter((b): b is Enum => b.type === 'enum');

  const enumDbNames = new Map(
    enums.map((e) => [
      e.name,
      mappedName(
        e.enumerators.filter(
          (x): x is BlockAttribute => x.type === 'attribute',
        ),
        e.name,
      ),
    ]),
  );
  const tableNames = new Map(
    models.map((m) => [
      m.name,
      mappedName(
        m.properties.filter((p): p is BlockAttribute => p.type === 'attribute'),
        m.name,
      ),
    ]),
  );

  const tables: Table[] = [];
  const relations: Relation[] = [];

  for (const model of models) {
    const fields = model.properties.filter(
      (p): p is Field => p.type === 'field',
    );
    const blockAttrs = model.properties.filter(
      (p): p is BlockAttribute => p.type === 'attribute',
    );
    const columnName = new Map(
      fields.map((f) => [f.name, mappedName(f.attributes ?? [], f.name)]),
    );
    const relationFields = fields.filter((f) => tableNames.has(typeName(f)));
    const fkFields = new Set(
      relationFields.flatMap((f) => {
        const relation = attr(f, 'relation');
        return relation ? fieldList(argValue(relation, 'fields')) : [];
      }),
    );

    const columns: Column[] = fields
      .filter((f) => !tableNames.has(typeName(f)))
      .map((f) => ({
        name: columnName.get(f.name)!,
        type: columnType(f, enumDbNames),
        nullable: Boolean(f.optional),
        pk: Boolean(attr(f, 'id')),
        unique: Boolean(attr(f, 'unique')),
        fk: fkFields.has(f.name),
        enumName: enumDbNames.has(typeName(f)) ? typeName(f) : undefined,
      }));

    const compositeUniques = blockAttrs
      .filter((a) => a.name === 'unique')
      .map((a) =>
        fieldList(argValue(a)).map((name) => columnName.get(name) ?? name),
      );

    tables.push({
      name: tableNames.get(model.name)!,
      model: model.name,
      columns,
      compositeUniques,
    });

    for (const field of relationFields) {
      const relation = attr(field, 'relation');
      const from = relation ? fieldList(argValue(relation, 'fields')) : [];
      const to = relation ? fieldList(argValue(relation, 'references')) : [];
      if (from.length !== 1 || to.length !== 1) continue; // sisi tanpa FK
      const fkColumn = columns.find((c) => c.name === columnName.get(from[0]));
      relations.push({
        fromTable: tableNames.get(model.name)!,
        fromColumn: columnName.get(from[0])!,
        toTable: tableNames.get(typeName(field))!,
        toColumn: to[0],
        nullable: Boolean(field.optional),
        oneToOne: Boolean(fkColumn?.unique),
      });
    }
  }

  // Kolom referensi ditulis dengan nama field Prisma; ubah ke nama kolom DB.
  for (const relation of relations) {
    const target = models.find(
      (m) => tableNames.get(m.name) === relation.toTable,
    )!;
    const field = target.properties.find(
      (p): p is Field => p.type === 'field' && p.name === relation.toColumn,
    );
    if (field)
      relation.toColumn = mappedName(field.attributes ?? [], field.name);
  }

  return { tables, relations, enums, enumDbNames };
}

const COLORS = {
  header: '#1e3a8a',
  headerText: '#ffffff',
  border: '#94a3b8',
  muted: '#64748b',
  pk: '#fef3c7',
  enumHeader: '#475569',
  edge: '#334155',
};

function tableNode(table: Table): string {
  const rows = table.columns.map((c) => {
    const keys = [c.pk && 'PK', c.fk && 'FK', c.unique && 'UQ']
      .filter(Boolean)
      .join(' ');
    const name = c.pk ? `<b>${escapeHtml(c.name)}</b>` : escapeHtml(c.name);
    const type = `${escapeHtml(c.type)}${c.nullable ? '?' : ''}`;
    const bg = c.pk ? ` bgcolor="${COLORS.pk}"` : '';
    return (
      // Port "<kolom>_in" di sel kiri (garis masuk), "<kolom>_out" di sel kanan
      // (garis keluar), supaya garis tidak menimpa isi baris.
      `<tr><td port="${c.name}_in" align="left"${bg}>${name}</td>` +
      `<td align="left"${bg}><font color="${COLORS.muted}">${type}</font></td>` +
      // Graphviz menolak <font> kosong, jadi sel kunci kosong dibiarkan polos.
      `<td port="${c.name}_out" align="left"${bg}>${keys && `<font color="${COLORS.muted}">${keys}</font>`}</td></tr>`
    );
  });
  const uniques = table.compositeUniques.map(
    (cols) =>
      `<tr><td colspan="3" align="left"><font color="${COLORS.muted}" point-size="9">` +
      `UQ (${cols.map(escapeHtml).join(', ')})</font></td></tr>`,
  );
  return (
    `  "${table.name}" [label=<<table border="0" cellborder="1" cellspacing="0" cellpadding="4" color="${COLORS.border}">` +
    `<tr><td colspan="3" bgcolor="${COLORS.header}"><font color="${COLORS.headerText}"><b>${escapeHtml(table.name)}</b></font></td></tr>` +
    [...rows, ...uniques].join('') +
    `</table>>];`
  );
}

function enumNode(dbName: string, values: string[]): string {
  return (
    `  "enum_${dbName}" [label=<<table border="0" cellborder="1" cellspacing="0" cellpadding="4" color="${COLORS.border}">` +
    `<tr><td bgcolor="${COLORS.enumHeader}"><font color="${COLORS.headerText}"><b>enum ${escapeHtml(dbName)}</b></font></td></tr>` +
    values
      .map((v) => `<tr><td align="left">${escapeHtml(v)}</td></tr>`)
      .join('') +
    `</table>>];`
  );
}

function toDot(source: string): string {
  const { tables, relations, enums, enumDbNames } = parse(source);
  const lines = [
    'digraph erd {',
    '  graph [rankdir=LR, bgcolor="white", pad=0.4, nodesep=0.5, ranksep=1.1, fontname="Helvetica", fontsize=11,',
    `         labelloc=b, labeljust=l, label="ERD HRIS Blue Rose Tech, dibuat otomatis dari backend/prisma/schema.prisma (npm run erd). PK primary key, FK foreign key, UQ unique, ? boleh NULL. Garis putus-putus: kolom enum."];`,
    '  node [shape=plaintext, fontname="Helvetica", fontsize=10];',
    `  edge [color="${COLORS.edge}", fontname="Helvetica", fontsize=9, dir=both];`,
    ...tables.map(tableNode),
    ...enums.map((e) =>
      enumNode(
        enumDbNames.get(e.name)!,
        e.enumerators.filter((x) => x.type === 'enumerator').map((x) => x.name),
      ),
    ),
  ];

  for (const r of relations) {
    // Sisi FK: banyak (crow) atau satu (tee); o = boleh tidak ada.
    const tail = `${r.oneToOne ? 'tee' : 'crow'}${r.nullable ? 'odot' : 'tee'}`;
    const head = r.nullable ? 'teeodot' : 'teetee';
    lines.push(
      `  "${r.fromTable}":"${r.fromColumn}_out":e -> "${r.toTable}":"${r.toColumn}_in":w [arrowtail=${tail}, arrowhead=${head}];`,
    );
  }

  for (const table of tables) {
    for (const column of table.columns) {
      if (!column.enumName) continue;
      lines.push(
        `  "${table.name}":"${column.name}_out":e -> "enum_${enumDbNames.get(column.enumName)}" [style=dashed, color="${COLORS.border}", dir=forward, arrowhead=none];`,
      );
    }
  }

  lines.push('}');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const source = await readFile(SCHEMA_PATH, 'utf8');
  const viz = await instance();
  const result = viz.render(toDot(source), { format: 'svg', engine: 'dot' });
  // Label HTML yang salah tidak membuat render gagal, hanya tabelnya hilang.
  // Anggap setiap pesan Graphviz sebagai kegagalan supaya ERD tidak rusak diam-diam.
  if (result.status !== 'success' || result.errors.length > 0) {
    const messages = result.errors.map((e) => `${e.level}: ${e.message}`);
    throw new Error(['Graphviz gagal:', ...messages].join('\n'));
  }
  const svg = result.output;
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, svg);
  console.info(`ERD ditulis ke ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
