import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, UserX, UserCheck, Pencil, AlertCircle } from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Badge, Avatar, Modal, Eyebrow, useToast } from '../ui';
import { FormNotice } from '../LoginPage';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  checkUnique, formatDate, formatRupiah, invokeHrFunction, todayWIB, useMasterData,
} from '../../lib/hr';
import {
  EmployeeFields, SalaryFields, emptyEmployee, focusFirstError, validateEmployee, validateSalary,
} from './EmployeeFields';

const PROFILE_FIELDS = Object.keys(emptyEmployee);

const toForm = (p) => Object.fromEntries(PROFILE_FIELDS.map((k) => [k, p[k] ?? '']));

function useEmployee(id) {
  const [state, setState] = useState({ loading: true, error: null, profile: null, salaries: [], benefits: [] });

  const load = useCallback(async () => {
    const [p, s, b] = await Promise.all([
      supabase.from('profiles').select('*, division:divisions(name), position:positions(name)').eq('id', id).maybeSingle(),
      supabase.from('salary_components').select('*').eq('employee_id', id)
        .order('effective_from', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('benefits').select('*').eq('employee_id', id).order('provider'),
    ]);
    setState({
      loading: false,
      error: p.error || s.error || b.error,
      profile: p.data,
      salaries: s.data ?? [],
      benefits: b.data ?? [],
    });
  }, [id]);

  useEffect(() => { setState((st) => ({ ...st, loading: true })); load(); }, [load]);
  return { ...state, reload: load };
}

/* ── Form edit data karyawan ── */
function ProfileEditCard({ profile, master, onSaved, toast }) {
  const [values, setValues] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValues(toForm(profile)); }, [profile]);

  const initial = toForm(profile);
  const dirty = PROFILE_FIELDS.some((k) => (values[k] ?? '') !== (initial[k] ?? ''));

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (saving || !dirty) return;
    setServerError(null);
    const nip = values.nip.trim().toUpperCase();
    const next = validateEmployee(values, { requireEmail: false });
    if (!next.nip && nip !== profile.nip) {
      try {
        const dupe = await checkUnique({ nip, excludeId: profile.id });
        if (dupe.nip) next.nip = dupe.nip;
      } catch { /* constraint di database tetap menjaga */ }
    }
    setErrors(next);
    if (focusFirstError(next)) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: values.full_name.trim(),
        nip,
        gender: values.gender,
        birth_date: values.birth_date || null,
        division_id: values.division_id,
        position_id: values.position_id,
        join_date: values.join_date,
        employment_status: values.employment_status,
        office_id: values.office_id,
        shift_id: values.shift_id,
      })
      .eq('id', profile.id);
    setSaving(false);

    if (error) {
      if (error.code === '23505') setErrors((e) => ({ ...e, nip: 'NIP sudah dipakai karyawan lain.' }));
      else setServerError(error.code === '23514' ? error.message : 'Perubahan gagal disimpan. Coba lagi.');
      return;
    }
    toast('Data karyawan disimpan.');
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader title="Data karyawan" description="Perubahan tercatat di audit log." />
        <EmployeeFields values={{ ...values, email: profile.email }} set={set} errors={errors} master={master} emailReadOnly />
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          {serverError && <div className="sm:mr-auto"><FormNotice>{serverError}</FormNotice></div>}
          <Button variant="secondary" disabled={!dirty || saving} onClick={() => { setValues(initial); setErrors({}); }}>Batalkan perubahan</Button>
          <Button type="submit" disabled={!dirty || saving} aria-busy={saving || undefined}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {saving ? 'Menyimpan…' : 'Simpan perubahan'}
          </Button>
        </div>
      </Card>
    </form>
  );
}

/* ── Modal perubahan gaji: selalu membuat baris riwayat baru ── */
function SalaryChangeModal({ employeeId, current, onClose, onSaved }) {
  const [values, setValues] = useState({
    base_salary: current ? String(current.base_salary) : '',
    fixed_allowance: current ? String(current.fixed_allowance) : '',
    bank_name: current?.bank_name ?? '',
    bank_account_last4: current?.bank_account_last4 ?? '',
    bpjs_kes_no: current?.bpjs_kes_no ?? '',
    bpjs_tk_no: current?.bpjs_tk_no ?? '',
    effective_from: todayWIB(),
    note: '',
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
  };

  const submit = async () => {
    if (saving) return;
    const next = validateSalary(values, { requireEffectiveFrom: true });
    setErrors(next);
    if (focusFirstError(next)) return;
    setSaving(true);
    setServerError(null);
    const { error } = await supabase.rpc('hr_change_salary', {
      p_employee_id: employeeId,
      p_data: { ...values, base_salary: Number(values.base_salary), fixed_allowance: Number(values.fixed_allowance || 0) },
    });
    setSaving(false);
    if (error) {
      setServerError('Perubahan gaji gagal disimpan. Coba lagi.');
      return;
    }
    onSaved();
  };

  return (
    <Modal
      title="Ubah gaji & rekening"
      description="Data lama tetap tersimpan sebagai riwayat."
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={submit} disabled={saving} aria-busy={saving || undefined}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {saving ? 'Menyimpan…' : 'Simpan sebagai riwayat baru'}
          </Button>
        </>
      }
    >
      {serverError && <div className="mb-4"><FormNotice>{serverError}</FormNotice></div>}
      <SalaryFields values={values} set={set} errors={errors} withEffectiveFrom wrap={false} />
    </Modal>
  );
}

/* ── Modal konfirmasi nonaktif / aktifkan ── */
function StatusModal({ profile, onClose, onDone }) {
  const activating = !profile.is_active;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await invokeHrFunction('set-employee-active', { employee_id: profile.id, active: activating });
      onDone(activating);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      size="sm"
      title={activating ? 'Aktifkan kembali karyawan?' : 'Nonaktifkan karyawan?'}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button variant={activating ? 'primary' : 'danger'} onClick={confirm} disabled={saving} aria-busy={saving || undefined}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {activating ? 'Aktifkan' : 'Nonaktifkan'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        {activating
          ? `${profile.full_name} bisa login lagi dan kembali ikut presensi serta payroll.`
          : `${profile.full_name} tidak bisa login dan tidak ikut payroll berikutnya. Riwayat presensi, gaji, dan data lain tetap tersimpan.`}
      </p>
      {error && <div className="mt-4"><FormNotice>{error}</FormNotice></div>}
    </Modal>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const master = useMasterData();
  const { loading, error, profile, salaries, benefits, reload } = useEmployee(id);
  const [toast, toastNode] = useToast();
  const [modal, setModal] = useState(null); // 'salary' | 'status'

  // Toast dari halaman tambah karyawan.
  useEffect(() => {
    if (location.state?.toast) {
      toast(location.state.toast);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, toast]);

  const back = (
    <button
      type="button"
      onClick={() => navigate('/hr/karyawan')}
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Data karyawan
    </button>
  );

  if (loading) {
    return (
      <>{back}<div className="flex items-center py-16 text-sm text-muted"><Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />Memuat data karyawan…</div></>
    );
  }
  if (error || !profile) {
    return (
      <>
        {back}
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <AlertCircle size={28} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold">{error ? 'Data gagal dimuat' : 'Karyawan tidak ditemukan'}</h1>
          <Button variant="secondary" className="mt-5" onClick={error ? reload : () => navigate('/hr/karyawan')}>
            {error ? 'Coba lagi' : 'Kembali ke daftar'}
          </Button>
        </Card>
      </>
    );
  }

  const current = salaries[0] ?? null;
  const isSelf = profile.id === user?.id;

  return (
    <>
      {back}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={profile.full_name} src={profile.photo_url} size={40} />
            <span className="min-w-0">
              <span className="block truncate">{profile.full_name}</span>
              <span className="num block text-sm font-normal text-muted">{profile.nip ?? '—'} · {profile.email}</span>
            </span>
          </span>
        }
        actions={
          <>
            {profile.is_active ? <Badge tone="success" dot>Aktif</Badge> : <Badge dot>Nonaktif</Badge>}
            {profile.role === 'hr' && <Badge tone="accent">HR</Badge>}
            {profile.is_active ? (
              <Button variant="danger" onClick={() => setModal('status')} disabled={isSelf} title={isSelf ? 'Tidak bisa menonaktifkan akun sendiri' : undefined}>
                <UserX size={16} aria-hidden="true" /> Nonaktifkan
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setModal('status')}>
                <UserCheck size={16} aria-hidden="true" /> Aktifkan kembali
              </Button>
            )}
          </>
        }
      />

      {!profile.is_active && (
        <div className="mb-5"><FormNotice>Karyawan ini nonaktif: tidak bisa login dan tidak ikut payroll.</FormNotice></div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProfileEditCard profile={profile} master={master} onSaved={reload} toast={toast} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Gaji saat ini"
              description={current ? `Berlaku sejak ${formatDate(current.effective_from)}` : 'Belum ada data gaji'}
              action={
                <Button variant="secondary" size="sm" onClick={() => setModal('salary')}>
                  <Pencil size={14} aria-hidden="true" /> Ubah
                </Button>
              }
            />
            {current && (
              <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
                <div><Eyebrow>Gaji pokok</Eyebrow><dd className="num mt-0.5 font-medium">{formatRupiah(current.base_salary)}</dd></div>
                <div><Eyebrow>Tunjangan tetap</Eyebrow><dd className="num mt-0.5 font-medium">{formatRupiah(current.fixed_allowance)}</dd></div>
                <div><Eyebrow>Rekening</Eyebrow><dd className="num mt-0.5">{current.bank_name} •••• {current.bank_account_last4}</dd></div>
                <div><Eyebrow>BPJS Kes / TK</Eyebrow><dd className="num mt-0.5 text-[13px]">{current.bpjs_kes_no ?? '—'}<br />{current.bpjs_tk_no ?? '—'}</dd></div>
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader title="Riwayat gaji" description={`${salaries.length} catatan`} />
            <ul className="divide-y divide-line">
              {salaries.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">Belum ada riwayat.</li>}
              {salaries.map((s, i) => (
                <li key={s.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{formatDate(s.effective_from)}</p>
                    <p className="truncate text-xs text-faint">{s.note ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="num">{formatRupiah(Number(s.base_salary) + Number(s.fixed_allowance))}</p>
                    {i === 0 && <Badge tone="accent" className="mt-1">Berlaku</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Manfaat" />
            <ul className="divide-y divide-line">
              {benefits.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">Belum ada data manfaat.</li>}
              {benefits.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{b.provider}</p>
                    <p className="text-xs text-faint">{[b.program, b.class].filter(Boolean).join(' · ') || '—'}</p>
                    <p className="num text-xs text-muted">{b.card_no ?? 'Nomor kartu belum diisi'}</p>
                  </div>
                  <Badge tone={b.status === 'aktif' ? 'success' : 'neutral'}>{b.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {modal === 'salary' && (
        <SalaryChangeModal
          employeeId={profile.id}
          current={current}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); toast('Perubahan gaji disimpan sebagai riwayat baru.'); reload(); }}
        />
      )}
      {modal === 'status' && (
        <StatusModal
          profile={profile}
          onClose={() => setModal(null)}
          onDone={(active) => { setModal(null); toast(active ? 'Karyawan diaktifkan kembali.' : 'Karyawan dinonaktifkan.'); reload(); }}
        />
      )}
      {toastNode}
    </>
  );
}
