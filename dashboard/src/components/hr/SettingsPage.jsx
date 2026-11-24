import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Clock, CalendarDays, Plus, Pencil, Trash2, Loader2, MapPin, LocateFixed, ExternalLink, ChevronLeft, ChevronRight,
  Headset,
} from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, IconButton, Badge, Field, Modal, useToast, inputCls, cx } from '../ui';
import { FieldError } from '../LoginPage';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/hr';
import {
  CONTACT_KEYS, HOURS_MAX, useCompanySetting, saveCompanySetting, validateContact, normalizeWhatsapp,
  formatWhatsapp, whatsappHref, WHATSAPP_RE,
} from '../../lib/companySettings';

const TABS = [
  { id: 'kantor', label: 'Kantor', icon: Building2 },
  { id: 'shift', label: 'Shift', icon: Clock },
  { id: 'libur', label: 'Hari libur', icon: CalendarDays },
  { id: 'kontak', label: 'Kontak HR', icon: Headset },
];

const MIN_RADIUS = 25;
const DEFAULT_RADIUS = 100;

/** Pesan error Supabase yang aman ditampilkan. Error dari RPC sudah berbahasa Indonesia. */
function errorMessage(error, duplicateMsg = 'Nama sudah dipakai.') {
  if (!error) return null;
  if (error.code === '23505') return duplicateMsg;
  if (error.code === '23514') return 'Data tidak valid. Periksa kembali isian.';
  if (['23503', '42501', 'P0002'].includes(error.code) && error.message) return error.message;
  return 'Gagal menyimpan. Coba lagi.';
}

const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
const isCoord = (v, max) => v.trim() !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max;

/* ── Komponen bersama ── */
function Loading() {
  return (
    <div className="flex items-center px-5 py-12 text-sm text-muted">
      <Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />Memuat…
    </div>
  );
}

function LoadError({ onRetry }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm text-danger">Data gagal dimuat.</p>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>Coba lagi</Button>
    </div>
  );
}

function Empty({ children }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

/* Konfirmasi hapus. Jika masih dipakai karyawan, hanya tampil penjelasan tanpa tombol hapus. */
function ConfirmDelete({ title, name, usedBy, usedLabel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const blocked = usedBy > 0;

  const confirm = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      size="sm"
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        blocked ? (
          <Button variant="secondary" onClick={onClose}>Mengerti</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
            <Button variant="danger" onClick={confirm} disabled={busy} aria-busy={busy || undefined}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              Hapus
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <p className="text-sm text-muted">
          <span className="font-medium text-fg">{name}</span> masih dipakai{' '}
          <span className="num font-medium text-fg">{usedBy}</span> karyawan, jadi tidak bisa dihapus.
          Pindahkan karyawan tersebut ke {usedLabel} lain melalui menu Data karyawan terlebih dahulu.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Hapus <span className="font-medium text-fg">{name}</span>? Tindakan ini tidak dapat dibatalkan.
        </p>
      )}
    </Modal>
  );
}

function UsageBadge({ count }) {
  return <Badge tone={count ? 'accent' : 'neutral'} className="num">{count} karyawan</Badge>;
}

function RowActions({ name, onEdit, onDelete }) {
  return (
    <div className="flex shrink-0 items-center">
      {onEdit && (
        <IconButton label={`Ubah ${name}`} className="h-8 w-8" onClick={onEdit}><Pencil size={14} /></IconButton>
      )}
      <IconButton label={`Hapus ${name}`} className="h-8 w-8 hover:bg-danger-soft hover:text-danger" onClick={onDelete}>
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

/** Jumlah karyawan per kantor dan per shift (HR boleh membaca semua profiles). */
function useUsage() {
  const [usage, setUsage] = useState({ office: {}, shift: {} });
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('office_id, shift_id');
    if (error) return;
    const office = {};
    const shift = {};
    data.forEach((p) => {
      if (p.office_id) office[p.office_id] = (office[p.office_id] ?? 0) + 1;
      if (p.shift_id) shift[p.shift_id] = (shift[p.shift_id] ?? 0) + 1;
    });
    setUsage({ office, shift });
  }, []);
  useEffect(() => { load(); }, [load]);
  return [usage, load];
}

/** Muat satu tabel master. */
function useTable(table, select, order) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.from(table).select(select).order(order);
    setState({ loading: false, error, rows: data ?? [] });
  }, [table, select, order]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/* ── Kantor ── */
const emptyOffice = { name: '', latitude: '', longitude: '', radius_m: String(DEFAULT_RADIUS) };

function OfficeForm({ office, onClose, onSaved }) {
  const [values, setValues] = useState(() =>
    office
      ? { name: office.name, latitude: String(office.latitude), longitude: String(office.longitude), radius_m: String(office.radius_m) }
      : emptyOffice);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locInfo, setLocInfo] = useState(null);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] || e.form ? { ...e, [key]: null, form: null } : e));
  };

  const fillMyLocation = () => {
    if (!navigator.geolocation) {
      setErrors((e) => ({ ...e, form: 'Browser ini tidak mendukung Geolocation.' }));
      return;
    }
    setLocating(true);
    setLocInfo(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setValues((v) => ({ ...v, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setErrors((e) => ({ ...e, latitude: null, longitude: null, form: null }));
        setLocInfo(`Akurasi sekitar ${Math.round(pos.coords.accuracy)} m. Cek titiknya di Google Maps sebelum menyimpan.`);
      },
      (err) => {
        setLocating(false);
        const msg = err.code === 1
          ? 'Izin lokasi ditolak. Aktifkan izin lokasi di browser, lalu coba lagi.'
          : err.code === 3
            ? 'Lokasi tidak didapat dalam 10 detik. Coba lagi.'
            : 'Lokasi tidak tersedia. Coba lagi atau isi koordinat manual.';
        setErrors((e) => ({ ...e, form: msg }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const validate = () => {
    const e = {};
    if (!values.name.trim()) e.name = 'Nama kantor wajib diisi.';
    if (!isCoord(values.latitude, 90)) e.latitude = 'Latitude antara -90 dan 90.';
    if (!isCoord(values.longitude, 180)) e.longitude = 'Longitude antara -180 dan 180.';
    const r = Number(values.radius_m);
    if (!Number.isInteger(r) || r < MIN_RADIUS) e.radius_m = `Radius minimal ${MIN_RADIUS} meter (bilangan bulat).`;
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setSaving(true);
    const row = {
      name: values.name.trim(),
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
      radius_m: Number(values.radius_m),
    };
    const { error } = office
      ? await supabase.from('offices').update(row).eq('id', office.id)
      : await supabase.from('offices').insert(row);
    setSaving(false);
    if (error) {
      if (error.code === '23505') setErrors({ name: 'Nama kantor sudah dipakai.' });
      else setErrors({ form: errorMessage(error) });
      return;
    }
    onSaved(office ? 'Kantor diperbarui.' : 'Kantor ditambahkan.');
  };

  const validPoint = isCoord(values.latitude, 90) && isCoord(values.longitude, 180);

  return (
    <Modal
      title={office ? 'Ubah kantor' : 'Tambah kantor'}
      description="Titik pusat dan radius dipakai untuk validasi presensi GPS."
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="office-form" disabled={saving} aria-busy={saving || undefined}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="office-form" onSubmit={submit} noValidate className="space-y-4">
        {errors.form && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{errors.form}</p>}
        <Field label="Nama kantor" required htmlFor="office-name">
          <input
            id="office-name" autoFocus value={values.name} maxLength={100}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Head Office Jakarta"
            aria-invalid={!!errors.name || undefined}
            className={cx(inputCls, errors.name && 'border-danger')}
          />
          <FieldError>{errors.name}</FieldError>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" required htmlFor="office-lat">
            <input
              id="office-lat" inputMode="decimal" value={values.latitude}
              onChange={(e) => set('latitude', e.target.value)}
              placeholder="-6.200000"
              aria-invalid={!!errors.latitude || undefined}
              className={cx(inputCls, 'num', errors.latitude && 'border-danger')}
            />
            <FieldError>{errors.latitude}</FieldError>
          </Field>
          <Field label="Longitude" required htmlFor="office-lng">
            <input
              id="office-lng" inputMode="decimal" value={values.longitude}
              onChange={(e) => set('longitude', e.target.value)}
              placeholder="106.816666"
              aria-invalid={!!errors.longitude || undefined}
              className={cx(inputCls, 'num', errors.longitude && 'border-danger')}
            />
            <FieldError>{errors.longitude}</FieldError>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="secondary" size="sm" onClick={fillMyLocation} disabled={locating}>
            {locating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={14} aria-hidden="true" />}
            {locating ? 'Mengambil lokasi…' : 'Pakai lokasi saya sekarang'}
          </Button>
          {validPoint && (
            <a
              href={mapsUrl(Number(values.latitude), Number(values.longitude))}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline"
            >
              Lihat di Google Maps <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
        {locInfo && <p className="text-xs text-faint" aria-live="polite">{locInfo}</p>}

        <Field label="Radius" required htmlFor="office-radius" hint={`Dalam meter. Default ${DEFAULT_RADIUS}, minimal ${MIN_RADIUS}.`}>
          <input
            id="office-radius" type="number" inputMode="numeric" min={MIN_RADIUS} step={1} value={values.radius_m}
            onChange={(e) => set('radius_m', e.target.value)}
            aria-invalid={!!errors.radius_m || undefined}
            className={cx(inputCls, 'num sm:w-40', errors.radius_m && 'border-danger')}
          />
          <FieldError>{errors.radius_m}</FieldError>
        </Field>
      </form>
    </Modal>
  );
}

function OfficesTab({ usage, reloadUsage, toast }) {
  const { rows, loading, error, reload } = useTable('offices', 'id, name, latitude, longitude, radius_m', 'name');
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [deleting, setDeleting] = useState(null);

  const remove = async (office) => {
    const { error: err } = await supabase.rpc('hr_delete_office', { p_id: office.id });
    if (err) {
      toast(errorMessage(err), 'error');
      reloadUsage();
      return false;
    }
    toast('Kantor dihapus.');
    reload();
    return true;
  };

  return (
    <Card>
      <CardHeader
        title="Kantor"
        description={loading ? 'Memuat…' : `${rows.length} kantor`}
        action={<Button size="sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden="true" /> Tambah kantor</Button>}
      />
      {loading && rows.length === 0 ? <Loading /> : error ? <LoadError onRetry={reload} /> : rows.length === 0 ? (
        <Empty>Belum ada kantor. Tambahkan kantor agar karyawan bisa presensi.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                  <span className="num inline-flex items-center gap-1">
                    <MapPin size={13} aria-hidden="true" /> {Number(o.latitude).toFixed(6)}, {Number(o.longitude).toFixed(6)}
                  </span>
                  <span className="num">Radius {o.radius_m} m</span>
                  <a
                    href={mapsUrl(o.latitude, o.longitude)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
                  >
                    Lihat di Google Maps <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <UsageBadge count={usage.office[o.id] ?? 0} />
                <RowActions name={o.name} onEdit={() => setEditing(o)} onDelete={() => setDeleting(o)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <OfficeForm
          office={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast(msg); reload(); }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title="Hapus kantor"
          name={deleting.name}
          usedBy={usage.office[deleting.id] ?? 0}
          usedLabel="kantor"
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}

/* ── Shift ── */
const emptyShift = { name: '', start_time: '08:30', end_time: '17:30', late_tolerance_min: '15' };

function ShiftForm({ shift, onClose, onSaved }) {
  const [values, setValues] = useState(() =>
    shift
      ? { name: shift.name, start_time: hhmm(shift.start_time), end_time: hhmm(shift.end_time), late_tolerance_min: String(shift.late_tolerance_min) }
      : emptyShift);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] || e.form ? { ...e, [key]: null, form: null } : e));
  };

  const validate = () => {
    const e = {};
    if (!values.name.trim()) e.name = 'Nama shift wajib diisi.';
    if (!values.start_time) e.start_time = 'Jam masuk wajib diisi.';
    if (!values.end_time) e.end_time = 'Jam pulang wajib diisi.';
    else if (values.start_time && values.end_time <= values.start_time) e.end_time = 'Jam pulang harus setelah jam masuk.';
    const t = Number(values.late_tolerance_min);
    if (values.late_tolerance_min === '' || !Number.isInteger(t) || t < 0) e.late_tolerance_min = 'Isi 0 atau lebih (menit, bilangan bulat).';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setSaving(true);
    const row = {
      name: values.name.trim(),
      start_time: values.start_time,
      end_time: values.end_time,
      late_tolerance_min: Number(values.late_tolerance_min),
    };
    const { error } = shift
      ? await supabase.from('shifts').update(row).eq('id', shift.id)
      : await supabase.from('shifts').insert(row);
    setSaving(false);
    if (error) {
      if (error.code === '23505') setErrors({ name: 'Nama shift sudah dipakai.' });
      else setErrors({ form: errorMessage(error) });
      return;
    }
    onSaved(shift ? 'Shift diperbarui.' : 'Shift ditambahkan.');
  };

  return (
    <Modal
      title={shift ? 'Ubah shift' : 'Tambah shift'}
      description="Jam kerja dalam WIB. Status Terlambat dihitung setelah jam masuk + toleransi."
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="shift-form" disabled={saving} aria-busy={saving || undefined}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="shift-form" onSubmit={submit} noValidate className="space-y-4">
        {errors.form && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{errors.form}</p>}
        <Field label="Nama shift" required htmlFor="shift-name">
          <input
            id="shift-name" autoFocus value={values.name} maxLength={100}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Reguler"
            aria-invalid={!!errors.name || undefined}
            className={cx(inputCls, errors.name && 'border-danger')}
          />
          <FieldError>{errors.name}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jam masuk" required htmlFor="shift-start">
            <input
              id="shift-start" type="time" value={values.start_time}
              onChange={(e) => set('start_time', e.target.value)}
              aria-invalid={!!errors.start_time || undefined}
              className={cx(inputCls, 'num', errors.start_time && 'border-danger')}
            />
            <FieldError>{errors.start_time}</FieldError>
          </Field>
          <Field label="Jam pulang" required htmlFor="shift-end">
            <input
              id="shift-end" type="time" value={values.end_time}
              onChange={(e) => set('end_time', e.target.value)}
              aria-invalid={!!errors.end_time || undefined}
              className={cx(inputCls, 'num', errors.end_time && 'border-danger')}
            />
            <FieldError>{errors.end_time}</FieldError>
          </Field>
        </div>
        <Field label="Toleransi terlambat" required htmlFor="shift-tol" hint="Dalam menit.">
          <input
            id="shift-tol" type="number" inputMode="numeric" min={0} step={1} value={values.late_tolerance_min}
            onChange={(e) => set('late_tolerance_min', e.target.value)}
            aria-invalid={!!errors.late_tolerance_min || undefined}
            className={cx(inputCls, 'num sm:w-40', errors.late_tolerance_min && 'border-danger')}
          />
          <FieldError>{errors.late_tolerance_min}</FieldError>
        </Field>
      </form>
    </Modal>
  );
}

function ShiftsTab({ usage, reloadUsage, toast }) {
  const { rows, loading, error, reload } = useTable('shifts', 'id, name, start_time, end_time, late_tolerance_min', 'start_time');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const remove = async (shift) => {
    const { error: err } = await supabase.rpc('hr_delete_shift', { p_id: shift.id });
    if (err) {
      toast(errorMessage(err), 'error');
      reloadUsage();
      return false;
    }
    toast('Shift dihapus.');
    reload();
    return true;
  };

  return (
    <Card>
      <CardHeader
        title="Shift"
        description={loading ? 'Memuat…' : `${rows.length} shift`}
        action={<Button size="sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden="true" /> Tambah shift</Button>}
      />
      {loading && rows.length === 0 ? <Loading /> : error ? <LoadError onRetry={reload} /> : rows.length === 0 ? (
        <Empty>Belum ada shift.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  <span className="num">{hhmm(s.start_time)}–{hhmm(s.end_time)} WIB</span>
                  <span className="mx-2 text-faint" aria-hidden="true">·</span>
                  Toleransi <span className="num">{s.late_tolerance_min}</span> menit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <UsageBadge count={usage.shift[s.id] ?? 0} />
                <RowActions name={s.name} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ShiftForm
          shift={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast(msg); reload(); }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title="Hapus shift"
          name={deleting.name}
          usedBy={usage.shift[deleting.id] ?? 0}
          usedLabel="shift"
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}

/* ── Hari libur ── */
const weekdayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long' });
const weekdayOf = (d) => weekdayFmt.format(new Date(`${d}T00:00:00`));
const isWeekend = (d) => [0, 6].includes(new Date(`${d}T00:00:00`).getDay());

function HolidaysTab({ toast }) {
  const [year, setYear] = useState(() => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(new Date())));
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase
      .from('holidays')
      .select('id, date, name')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date');
    setState({ loading: false, error, rows: data ?? [] });
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const add = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!date) e.date = 'Pilih tanggal.';
    if (!name.trim()) e.name = 'Nama libur wajib diisi.';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setSaving(true);
    const { error } = await supabase.from('holidays').insert({ date, name: name.trim() });
    setSaving(false);
    if (error) {
      if (error.code === '23505') setErrors({ date: 'Tanggal ini sudah terdaftar sebagai hari libur.' });
      else setErrors({ form: errorMessage(error) });
      return;
    }
    toast('Hari libur ditambahkan.');
    setDate('');
    setName('');
    const addedYear = Number(date.slice(0, 4));
    if (addedYear !== year) setYear(addedYear);
    else load();
  };

  const remove = async (h) => {
    const { error } = await supabase.rpc('hr_delete_holiday', { p_id: h.id });
    if (error) {
      toast(errorMessage(error, 'Gagal menghapus. Coba lagi.'), 'error');
      return false;
    }
    toast('Hari libur dihapus.');
    load();
    return true;
  };

  const { rows, loading, error } = state;

  return (
    <Card>
      <CardHeader
        title="Hari libur"
        description="Libur nasional dan cuti bersama tidak dihitung sebagai hari kerja."
        action={
          <div className="flex items-center gap-1" role="group" aria-label="Pilih tahun">
            <IconButton label="Tahun sebelumnya" className="h-8 w-8" onClick={() => setYear((y) => y - 1)}><ChevronLeft size={16} /></IconButton>
            <span className="num w-12 text-center text-sm font-semibold" aria-live="polite">{year}</span>
            <IconButton label="Tahun berikutnya" className="h-8 w-8" onClick={() => setYear((y) => y + 1)}><ChevronRight size={16} /></IconButton>
          </div>
        }
      />
      {loading && rows.length === 0 ? <Loading /> : error ? <LoadError onRetry={load} /> : rows.length === 0 ? (
        <Empty>Belum ada hari libur di tahun {year}.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((h) => (
            <li key={h.id} className="flex items-center gap-4 px-5 py-3">
              <div className="w-40 shrink-0">
                <p className="num text-sm font-medium">{formatDate(h.date)}</p>
                <p className="text-xs text-faint">{weekdayOf(h.date)}</p>
              </div>
              <p className="min-w-0 flex-1 truncate text-sm">{h.name}</p>
              {isWeekend(h.date) && <Badge className="hidden sm:inline-flex">Akhir pekan</Badge>}
              <RowActions name={h.name} onDelete={() => setDeleting(h)} />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} noValidate className="border-t border-line px-5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="sm:w-44">
            <label className="sr-only" htmlFor="holiday-date">Tanggal libur</label>
            <input
              id="holiday-date" type="date" value={date}
              onChange={(e) => { setDate(e.target.value); setErrors({}); }}
              aria-invalid={!!errors.date || undefined}
              className={cx(inputCls, 'num h-9', errors.date && 'border-danger')}
            />
          </div>
          <div className="flex-1">
            <label className="sr-only" htmlFor="holiday-name">Nama libur</label>
            <input
              id="holiday-name" value={name} maxLength={100}
              onChange={(e) => { setName(e.target.value); setErrors({}); }}
              placeholder="Nama libur, mis. Hari Kemerdekaan RI"
              aria-invalid={!!errors.name || undefined}
              className={cx(inputCls, 'h-9', errors.name && 'border-danger')}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Tambah
          </Button>
        </div>
        {(errors.date || errors.name || errors.form) && (
          <p className="mt-1.5 text-xs text-danger" role="alert">{errors.date || errors.name || errors.form}</p>
        )}
      </form>

      {deleting && (
        <ConfirmDelete
          title="Hapus hari libur"
          name={`${deleting.name} (${formatDate(deleting.date)})`}
          usedBy={0}
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}

/* ── Kontak HR: company_settings key hr_contact, tampil di halaman Bantuan karyawan ── */
const contactFromValue = (v) => ({ email: v?.email ?? '', whatsapp: v?.whatsapp ?? '', hours: v?.hours ?? '' });
const updatedFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function ContactTab({ toast }) {
  const { loading, error, value, updatedAt, reload } = useCompanySetting(CONTACT_KEYS.hr);
  const [initial, setInitial] = useState(null);
  const [values, setValues] = useState(null);
  const [loadedVersion, setLoadedVersion] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Isi form sekali per versi data (updated_at), bukan setiap muat ulang, agar isian yang
  // sedang diketik tidak tertimpa (StrictMode menjalankan efek dua kali).
  const version = loading || error ? null : updatedAt ?? 'baru';
  if (version !== null && version !== loadedVersion) {
    const v = contactFromValue(value);
    setLoadedVersion(version);
    setInitial(v);
    setValues(v);
  }

  const set = (key, val) => {
    setValues((v) => ({ ...v, [key]: val }));
    setErrors((e) => (e[key] || e.form ? { ...e, [key]: null, form: null } : e));
  };

  const dirty = !!values && !!initial && (
    values.email.trim() !== initial.email
    || normalizeWhatsapp(values.whatsapp) !== initial.whatsapp
    || values.hours.trim() !== initial.hours
  );

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validateContact(values);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setSaving(true);
    const next = {
      email: values.email.trim(),
      whatsapp: normalizeWhatsapp(values.whatsapp),
      hours: values.hours.trim(),
    };
    const err = await saveCompanySetting(CONTACT_KEYS.hr, next);
    setSaving(false);
    if (err) {
      setErrors({ form: err.code === '42501' ? 'Hanya HR yang dapat mengubah kontak.' : errorMessage(err) });
      return;
    }
    toast('Kontak HR disimpan.');
    reload();
  };

  if (!values) {
    return <Card>{error ? <LoadError onRetry={reload} /> : <Loading />}</Card>;
  }

  const waPreview = normalizeWhatsapp(values.whatsapp);

  return (
    <Card as="form" onSubmit={submit} noValidate>
      <CardHeader
        title="Kontak HR"
        description="Tampil di halaman Bantuan karyawan sebagai tombol email dan WhatsApp."
      />
      <div className="space-y-4 p-5">
        {errors.form && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{errors.form}</p>}
        {!value && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
            Kontak HR belum diatur. Karyawan belum melihat tombol kontak di halaman Bantuan.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email HR" required htmlFor="contact-email" hint="Tombol Email membuka aplikasi email dengan subjek berisi nama karyawan.">
            <input
              id="contact-email" type="email" autoComplete="off" maxLength={254} value={values.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="hr@perusahaan.co.id"
              aria-invalid={!!errors.email || undefined}
              className={cx(inputCls, errors.email && 'border-danger')}
            />
            <FieldError>{errors.email}</FieldError>
          </Field>
          <Field label="Nomor WhatsApp" required htmlFor="contact-wa" hint="Format 62…, tanpa + dan spasi. Ketikan 0812… atau +62 812… diubah otomatis.">
            <input
              id="contact-wa" type="tel" inputMode="tel" autoComplete="off" maxLength={20} value={values.whatsapp}
              onChange={(e) => set('whatsapp', e.target.value)}
              onBlur={() => { if (values.whatsapp) set('whatsapp', normalizeWhatsapp(values.whatsapp)); }}
              placeholder="6281234567890"
              aria-invalid={!!errors.whatsapp || undefined}
              className={cx(inputCls, 'num', errors.whatsapp && 'border-danger')}
            />
            <FieldError>{errors.whatsapp}</FieldError>
            {!errors.whatsapp && WHATSAPP_RE.test(waPreview) && (
              <a
                href={whatsappHref(waPreview)} target="_blank" rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline"
              >
                Uji di WhatsApp ({formatWhatsapp(waPreview)}) <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </Field>
        </div>
        <Field label="Jam layanan" required htmlFor="contact-hours" aside={`${values.hours.length}/${HOURS_MAX}`}>
          <input
            id="contact-hours" maxLength={HOURS_MAX} value={values.hours}
            onChange={(e) => set('hours', e.target.value)}
            placeholder="Senin-Jumat 08:30-17:30 WIB"
            aria-invalid={!!errors.hours || undefined}
            className={cx(inputCls, errors.hours && 'border-danger')}
          />
          <FieldError>{errors.hours}</FieldError>
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-faint">
          {updatedAt ? `Terakhir diperbarui ${updatedFmt.format(new Date(updatedAt))} WIB` : 'Belum pernah disimpan'}
        </span>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => { setValues(initial); setErrors({}); }} disabled={saving}>Batal</Button>
          )}
          <Button type="submit" disabled={!dirty || saving} aria-busy={saving || undefined}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ── Root: /hr/pengaturan/:tab ── */
export default function SettingsPage({ tab }) {
  const navigate = useNavigate();
  const active = TABS.some((t) => t.id === tab) ? tab : 'kantor';
  const [usage, reloadUsage] = useUsage();
  const [toast, toastNode] = useToast();

  // Hitung ulang pemakaian setiap pindah tab, supaya angka karyawan tidak basi.
  useEffect(() => { reloadUsage(); }, [active, reloadUsage]);

  const props = { usage, reloadUsage, toast };
  const panel = active === 'shift' ? <ShiftsTab {...props} />
    : active === 'libur' ? <HolidaysTab toast={toast} />
    : active === 'kontak' ? <ContactTab toast={toast} />
    : <OfficesTab {...props} />;

  return (
    <>
      <PageHeader title="Pengaturan" description="Lokasi kantor, jam kerja, dan hari libur untuk presensi, serta kontak HR di halaman Bantuan." />

      <div role="tablist" aria-label="Pengaturan" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls="settings-panel"
              onClick={() => navigate(`/hr/pengaturan/${t.id}`)}
              className={cx(
                '-mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                selected ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <Icon size={16} strokeWidth={selected ? 2.1 : 1.8} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="settings-panel" aria-labelledby={`tab-${active}`}>
        {panel}
      </div>
      {toastNode}
    </>
  );
}
