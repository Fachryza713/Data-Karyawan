import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Layers, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { PageHeader, Card, Badge, Button, IconButton, Avatar, Pagination, inputCls, cx } from '../ui';
import { supabase } from '../../lib/supabase';
import { EMPLOYMENT_OPTIONS, PAGE_SIZE, formatDate, labelOf, sanitizeSearch, useMasterData } from '../../lib/hr';

const STATUS_FILTERS = [
  { value: 'aktif', label: 'Aktif' },
  { value: 'nonaktif', label: 'Nonaktif' },
  { value: 'semua', label: 'Semua status' },
];

export default function EmployeesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const division = params.get('divisi') ?? '';
  const status = params.get('status') ?? 'aktif';
  const page = Math.max(1, Number(params.get('hal')) || 1);

  const { divisions } = useMasterData();
  const [search, setSearch] = useState(q);
  const [result, setResult] = useState({ rows: [], count: 0, loading: true, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('hal' in patch)) next.delete('hal');
    setParams(next, { replace: true });
  };

  // Debounce pencarian 300 ms.
  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setResult((r) => ({ ...r, loading: true, error: null }));

    let query = supabase
      .from('profiles')
      .select('id, nip, full_name, email, photo_url, employment_status, join_date, is_active, division:divisions(name), position:positions(name)', { count: 'exact' })
      .order('full_name')
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const term = sanitizeSearch(q);
    if (term) query = query.or(`full_name.ilike.%${term}%,nip.ilike.%${term}%`);
    if (division) query = query.eq('division_id', division);
    if (status !== 'semua') query = query.eq('is_active', status === 'aktif');

    query.then(({ data, count, error }) => {
      if (cancelled) return;
      setResult({ rows: data ?? [], count: count ?? 0, loading: false, error });
    });
    return () => { cancelled = true; };
  }, [q, division, status, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(result.count / PAGE_SIZE));
  const from = result.count ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, result.count);

  return (
    <>
      <PageHeader
        title="Data karyawan"
        description="Cari, lihat, dan kelola data seluruh karyawan."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/hr/karyawan/master')}>
              <Layers size={16} aria-hidden="true" /> Divisi & jabatan
            </Button>
            <Button onClick={() => navigate('/hr/karyawan/baru')}>
              <Plus size={16} aria-hidden="true" /> Tambah karyawan
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <label htmlFor="emp-search" className="sr-only">Cari nama atau NIP</label>
            <input
              id="emp-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NIP"
              className={cx(inputCls, 'h-9 pl-9')}
            />
          </div>
          <div className="flex gap-2">
            <label htmlFor="emp-div" className="sr-only">Divisi</label>
            <select id="emp-div" value={division} onChange={(e) => update({ divisi: e.target.value })} className={cx(inputCls, 'h-9 w-auto pr-8 text-[13px]')}>
              <option value="">Semua divisi</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <label htmlFor="emp-status" className="sr-only">Status</label>
            <select id="emp-status" value={status} onChange={(e) => update({ status: e.target.value === 'aktif' ? '' : e.target.value })} className={cx(inputCls, 'h-9 w-auto pr-8 text-[13px]')}>
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <IconButton label="Muat ulang" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw size={15} />
            </IconButton>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th scope="col" className="px-5 py-2.5 font-medium">Karyawan</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Divisi & jabatan</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status kerja</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Tanggal masuk</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.loading && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">
                  <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat data…
                </td></tr>
              )}
              {!result.loading && result.error && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-danger">
                  <AlertCircle size={18} className="mr-2 inline" aria-hidden="true" />Data gagal dimuat. Coba muat ulang.
                </td></tr>
              )}
              {!result.loading && !result.error && result.rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">Tidak ada karyawan yang cocok dengan filter.</td></tr>
              )}
              {!result.loading && !result.error && result.rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/hr/karyawan/${row.id}`)}
                  className="cursor-pointer transition-colors hover:bg-subtle"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.full_name} src={row.photo_url} size={30} />
                      <div className="min-w-0">
                        <a
                          href={`/hr/karyawan/${row.id}`}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/hr/karyawan/${row.id}`); }}
                          className="font-medium hover:underline"
                        >
                          {row.full_name}
                        </a>
                        <p className="num text-xs text-faint">{row.nip ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p>{row.position?.name ?? '—'}</p>
                    <p className="text-xs text-faint">{row.division?.name ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3">{labelOf(EMPLOYMENT_OPTIONS, row.employment_status)}</td>
                  <td className="px-5 py-3">{formatDate(row.join_date)}</td>
                  <td className="px-5 py-3">
                    {row.is_active ? <Badge tone="success" dot>Aktif</Badge> : <Badge dot>Nonaktif</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          onChange={(n) => update({ hal: n > 1 ? String(n) : '' })}
          summary={result.count ? `Menampilkan ${from}–${to} dari ${result.count} karyawan` : '0 karyawan'}
        />
      </Card>
    </>
  );
}
