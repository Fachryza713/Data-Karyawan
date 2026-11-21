import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Check, X, Loader2 } from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, IconButton, Badge, useToast, inputCls, cx } from '../ui';
import { supabase } from '../../lib/supabase';
import { useMasterData } from '../../lib/hr';

const errorMessage = (error) =>
  error.code === '23505' ? 'Nama sudah dipakai.' : error.code === '23514' ? 'Nama tidak boleh kosong.' : 'Gagal menyimpan. Coba lagi.';

/* Satu baris yang bisa diubah namanya di tempat. */
function EditableRow({ name, meta, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Nama tidak boleh kosong.'); return; }
    if (trimmed === name) { setEditing(false); return; }
    setSaving(true);
    const err = await onSave(trimmed);
    setSaving(false);
    if (err) setError(err);
    else setEditing(false);
  };

  if (!editing) {
    return (
      <li className="flex items-center gap-3 px-5 py-2.5 text-sm">
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {meta}
        <IconButton label={`Ubah nama ${name}`} className="h-8 w-8" onClick={() => { setValue(name); setError(null); setEditing(true); }}>
          <Pencil size={14} />
        </IconButton>
      </li>
    );
  }

  return (
    <li className="px-5 py-2.5">
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="sr-only" htmlFor={`rename-${name}`}>Nama baru</label>
        <input
          id={`rename-${name}`}
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          aria-invalid={!!error || undefined}
          className={cx(inputCls, 'h-8 flex-1 text-[13px]', error && 'border-danger')}
        />
        <IconButton label="Simpan" type="submit" className="h-8 w-8" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </IconButton>
        <IconButton label="Batal" className="h-8 w-8" onClick={() => setEditing(false)} disabled={saving}>
          <X size={14} />
        </IconButton>
      </form>
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </li>
  );
}

/* Form tambah satu baris di bawah daftar. */
function AddForm({ placeholder, onAdd, extra, disabled }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) { setError('Isi nama terlebih dahulu.'); return; }
    setSaving(true);
    const err = await onAdd(trimmed);
    setSaving(false);
    if (err) setError(err);
    else setValue('');
  };

  return (
    <form onSubmit={submit} className="border-t border-line px-5 py-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        {extra}
        <label className="sr-only" htmlFor={`add-${placeholder}`}>{placeholder}</label>
        <input
          id={`add-${placeholder}`}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          placeholder={placeholder}
          aria-invalid={!!error || undefined}
          className={cx(inputCls, 'h-9 flex-1', error && 'border-danger')}
        />
        <Button type="submit" disabled={saving || disabled}>
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Tambah
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger" role="alert">{error}</p>}
    </form>
  );
}

export default function MasterDataPage() {
  const navigate = useNavigate();
  const { divisions, positions, loading, error, reload } = useMasterData();
  const [toast, toastNode] = useToast();
  const [divisionFilter, setDivisionFilter] = useState('');
  const [newPositionDivision, setNewPositionDivision] = useState('');

  const run = async (promise, okMessage) => {
    const { error: err } = await promise;
    if (err) return errorMessage(err);
    toast(okMessage);
    await reload();
    return null;
  };

  const shownPositions = divisionFilter ? positions.filter((p) => p.division_id === divisionFilter) : positions;
  const divisionName = Object.fromEntries(divisions.map((d) => [d.id, d.name]));
  const countByDivision = positions.reduce((acc, p) => ({ ...acc, [p.division_id]: (acc[p.division_id] ?? 0) + 1 }), {});
  const targetDivision = newPositionDivision || divisionFilter;

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/hr/karyawan')}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Data karyawan
      </button>
      <PageHeader title="Divisi & jabatan" description="Master data organisasi. Data yang sudah dipakai karyawan tidak bisa dihapus, hanya diubah namanya." />

      {loading && divisions.length === 0 ? (
        <div className="flex items-center py-16 text-sm text-muted"><Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />Memuat…</div>
      ) : error ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-sm text-danger">Master data gagal dimuat.</p>
          <Button variant="secondary" className="mt-4" onClick={reload}>Coba lagi</Button>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Divisi" description={`${divisions.length} divisi`} />
            <ul className="divide-y divide-line">
              {divisions.map((d) => (
                <EditableRow
                  key={d.id}
                  name={d.name}
                  meta={<Badge className="num">{countByDivision[d.id] ?? 0} jabatan</Badge>}
                  onSave={(name) => run(supabase.from('divisions').update({ name }).eq('id', d.id), 'Nama divisi diperbarui.')}
                />
              ))}
            </ul>
            <AddForm
              placeholder="Nama divisi baru"
              onAdd={(name) => run(supabase.from('divisions').insert({ name }), 'Divisi ditambahkan.')}
            />
          </Card>

          <Card>
            <CardHeader
              title="Jabatan"
              description={`${shownPositions.length} jabatan`}
              action={
                <>
                  <label htmlFor="pos-filter" className="sr-only">Filter divisi</label>
                  <select id="pos-filter" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} className={cx(inputCls, 'h-8 w-auto pr-8 text-[13px]')}>
                    <option value="">Semua divisi</option>
                    {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </>
              }
            />
            <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
              {shownPositions.map((p) => (
                <EditableRow
                  key={p.id}
                  name={p.name}
                  meta={!divisionFilter && <span className="hidden truncate text-xs text-faint sm:inline">{divisionName[p.division_id]}</span>}
                  onSave={(name) => run(supabase.from('positions').update({ name }).eq('id', p.id), 'Nama jabatan diperbarui.')}
                />
              ))}
            </ul>
            <AddForm
              placeholder="Nama jabatan baru"
              disabled={!targetDivision}
              extra={
                <>
                  <label htmlFor="pos-div" className="sr-only">Divisi jabatan baru</label>
                  <select id="pos-div" value={targetDivision} onChange={(e) => setNewPositionDivision(e.target.value)} className={cx(inputCls, 'h-9 sm:w-44')}>
                    <option value="">Pilih divisi</option>
                    {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </>
              }
              onAdd={(name) => run(supabase.from('positions').insert({ name, division_id: targetDivision }), 'Jabatan ditambahkan.')}
            />
          </Card>
        </div>
      )}
      {toastNode}
    </>
  );
}
