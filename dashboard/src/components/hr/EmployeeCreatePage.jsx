import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader, Card, Button, useToast } from '../ui';
import { FormNotice } from '../LoginPage';
import { checkUnique, invokeHrFunction, suggestNip, useMasterData } from '../../lib/hr';
import {
  EmployeeFields, SalaryFields, emptyEmployee, emptySalary, focusFirstError, validateEmployee, validateSalary,
} from './EmployeeFields';

export default function EmployeeCreatePage() {
  const navigate = useNavigate();
  const master = useMasterData();
  const [toast, toastNode] = useToast();
  const [values, setValues] = useState({ ...emptyEmployee, ...emptySalary });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [sendInvite, setSendInvite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
  };

  const handleSuggestNip = async () => {
    const year = (values.join_date || new Date().toISOString()).slice(0, 4);
    setSuggesting(true);
    try {
      set('nip', await suggestNip(year));
    } catch {
      toast('NIP otomatis gagal dibuat.', 'error');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    setServerError(null);
    const nip = values.nip.trim().toUpperCase();
    const email = values.email.trim().toLowerCase();
    const next = { ...validateEmployee(values), ...validateSalary(values) };
    if (!next.nip && !next.email) {
      try {
        Object.assign(next, Object.fromEntries(Object.entries(await checkUnique({ nip, email })).filter(([, m]) => m)));
      } catch { /* server tetap memvalidasi */ }
    }
    setErrors(next);
    if (focusFirstError(next)) return;

    setSaving(true);
    try {
      const res = await invokeHrFunction('invite-employee', {
        ...values,
        nip,
        email,
        full_name: values.full_name.trim(),
        base_salary: Number(values.base_salary),
        fixed_allowance: Number(values.fixed_allowance || 0),
        send_invite: sendInvite,
        redirect_to: `${window.location.origin}/update-password`,
      });
      navigate(`/hr/karyawan/${res.id}`, {
        state: { toast: sendInvite ? `Karyawan ditambahkan. Undangan dikirim ke ${email}.` : 'Karyawan ditambahkan tanpa email undangan.' },
      });
    } catch (err) {
      if (err.field) setErrors((e) => ({ ...e, [err.field]: err.message }));
      else setServerError(err.message);
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/hr/karyawan')}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Data karyawan
      </button>
      <PageHeader title="Tambah karyawan" description="Akun login dibuat otomatis. Karyawan membuat kata sandi sendiri lewat link undangan." />

      {master.error && <div className="mb-4"><FormNotice>Master data gagal dimuat. Muat ulang halaman.</FormNotice></div>}

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <EmployeeFields
            values={values}
            set={set}
            errors={errors}
            master={master}
            onSuggestNip={handleSuggestNip}
            suggesting={suggesting}
          />
          <SalaryFields values={values} set={set} errors={errors} />

          <div className="flex flex-col gap-4 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--accent)]"
              />
              <span>
                Kirim email undangan
                <span className="block text-xs text-faint">Matikan untuk email demo (.test) yang tidak bisa menerima email.</span>
              </span>
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('/hr/karyawan')} disabled={saving}>Batal</Button>
              <Button type="submit" disabled={saving || master.loading} aria-busy={saving || undefined}>
                {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {saving ? 'Menyimpan…' : 'Simpan karyawan'}
              </Button>
            </div>
          </div>
          {serverError && <div className="px-5 pb-4"><FormNotice>{serverError}</FormNotice></div>}
        </Card>
      </form>
      {toastNode}
    </>
  );
}
