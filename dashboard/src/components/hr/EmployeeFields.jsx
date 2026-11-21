import React from 'react';
import { Wand2 } from 'lucide-react';
import { Field, Segmented, inputCls, cx } from '../ui';
import { FieldError } from '../LoginPage';
import { EMPLOYMENT_OPTIONS, GENDER_OPTIONS, NIP_RE, digitsOnly } from '../../lib/hr';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emptyEmployee = {
  full_name: '', email: '', nip: '', gender: '', birth_date: '',
  division_id: '', position_id: '', join_date: '', employment_status: 'tetap', office_id: '', shift_id: '',
};

export const emptySalary = {
  base_salary: '', fixed_allowance: '', bank_name: '', bank_account_last4: '', bpjs_kes_no: '', bpjs_tk_no: '',
};

/** Validasi data karyawan (tanpa gaji). */
export function validateEmployee(v, { requireEmail = true } = {}) {
  const e = {};
  if (!v.full_name.trim()) e.full_name = 'Nama wajib diisi.';
  if (requireEmail) {
    if (!v.email.trim()) e.email = 'Email kantor wajib diisi.';
    else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Format email tidak valid.';
  }
  if (!NIP_RE.test(v.nip.trim().toUpperCase())) e.nip = 'Format NIP: BRT-YYYY-NNNN, contoh BRT-2026-0012.';
  if (!v.gender) e.gender = 'Pilih jenis kelamin.';
  if (v.birth_date && v.birth_date >= new Date().toISOString().slice(0, 10)) e.birth_date = 'Tanggal lahir tidak valid.';
  if (!v.division_id) e.division_id = 'Pilih divisi.';
  if (!v.position_id) e.position_id = 'Pilih jabatan.';
  if (!v.join_date) e.join_date = 'Tanggal masuk wajib diisi.';
  if (!v.employment_status) e.employment_status = 'Pilih status.';
  if (!v.office_id) e.office_id = 'Pilih kantor.';
  if (!v.shift_id) e.shift_id = 'Pilih shift.';
  return e;
}

/** Validasi komponen gaji, rekening, dan BPJS. */
export function validateSalary(v, { requireEffectiveFrom = false } = {}) {
  const e = {};
  if (!(Number(v.base_salary) > 0)) e.base_salary = 'Gaji pokok wajib diisi.';
  if (!v.bank_name.trim()) e.bank_name = 'Nama bank wajib diisi.';
  if (!/^\d{4}$/.test(v.bank_account_last4)) e.bank_account_last4 = 'Isi tepat 4 digit terakhir.';
  if (v.bpjs_kes_no && !/^\d{13}$/.test(v.bpjs_kes_no)) e.bpjs_kes_no = 'Nomor BPJS Kesehatan 13 digit.';
  if (v.bpjs_tk_no && !/^\d{11}$/.test(v.bpjs_tk_no)) e.bpjs_tk_no = 'Nomor BPJS Ketenagakerjaan 11 digit.';
  if (requireEffectiveFrom && !v.effective_from) e.effective_from = 'Tanggal berlaku wajib diisi.';
  return e;
}

const FIELD_IDS = {
  full_name: 'f-name', email: 'f-email', nip: 'f-nip', birth_date: 'f-birth', division_id: 'f-div', position_id: 'f-pos',
  join_date: 'f-join', office_id: 'f-office', shift_id: 'f-shift', base_salary: 'f-base', fixed_allowance: 'f-allow',
  bank_name: 'f-bank', bank_account_last4: 'f-last4', bpjs_kes_no: 'f-kes', bpjs_tk_no: 'f-tk', effective_from: 'f-eff',
};

/** Fokus ke input pertama yang error. Mengembalikan true jika ada error. */
export function focusFirstError(errors) {
  const first = Object.keys(FIELD_IDS).find((k) => errors[k]) ?? Object.keys(errors).find((k) => errors[k]);
  if (first) document.getElementById(FIELD_IDS[first])?.focus();
  return !!first;
}

export function FormSection({ title, description, children }) {
  return (
    <div className="grid gap-5 border-b border-line px-5 py-6 last:border-b-0 lg:grid-cols-3">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">{children}</div>
    </div>
  );
}

const groupFmt = new Intl.NumberFormat('id-ID');

/** Input rupiah: simpan digit mentah, tampilkan dengan pemisah ribuan. */
export function MoneyInput({ id, value, onChange, invalid }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value ? groupFmt.format(Number(value)) : ''}
        onChange={(e) => onChange(digitsOnly(e.target.value, 12))}
        aria-invalid={invalid || undefined}
        className={cx(inputCls, 'num pl-10', invalid && 'border-danger')}
      />
    </div>
  );
}

const sel = (invalid) => cx(inputCls, invalid && 'border-danger');
const inp = (invalid, extra) => cx(inputCls, extra, invalid && 'border-danger');

/** Field data pribadi + organisasi. `set(key, value)` mengubah satu field. */
export function EmployeeFields({ values: v, set, errors: e, master, emailReadOnly = false, onSuggestNip, suggesting }) {
  const positions = master.positions.filter((p) => p.division_id === v.division_id);

  return (
    <>
      <FormSection title="Data pribadi" description="Identitas dasar karyawan.">
        <div className="sm:col-span-2">
          <Field label="Nama lengkap" required htmlFor="f-name">
            <input id="f-name" value={v.full_name} onChange={(x) => set('full_name', x.target.value)} aria-invalid={!!e.full_name || undefined} className={inp(e.full_name)} />
            <FieldError>{e.full_name}</FieldError>
          </Field>
        </div>
        <Field label="Jenis kelamin" required htmlFor="f-gender">
          <Segmented name="Jenis kelamin" options={GENDER_OPTIONS} value={v.gender} onChange={(val) => set('gender', val)} />
          <FieldError>{e.gender}</FieldError>
        </Field>
        <Field label="Tanggal lahir" htmlFor="f-birth">
          <input id="f-birth" type="date" value={v.birth_date} onChange={(x) => set('birth_date', x.target.value)} aria-invalid={!!e.birth_date || undefined} className={inp(e.birth_date)} />
          <FieldError>{e.birth_date}</FieldError>
        </Field>
      </FormSection>

      <FormSection title="Akun & organisasi" description="Email kantor dipakai untuk login. Jabatan difilter sesuai divisi.">
        <Field label="Email kantor" required={!emailReadOnly} htmlFor="f-email" hint={emailReadOnly ? 'Email login tidak bisa diubah dari sini.' : null}>
          <input
            id="f-email"
            type="email"
            value={v.email}
            readOnly={emailReadOnly}
            onChange={(x) => set('email', x.target.value)}
            aria-invalid={!!e.email || undefined}
            className={inp(e.email)}
          />
          <FieldError>{e.email}</FieldError>
        </Field>
        <Field
          label="NIP"
          required
          htmlFor="f-nip"
          aside={onSuggestNip && (
            <button type="button" onClick={onSuggestNip} disabled={suggesting} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline disabled:opacity-50">
              <Wand2 size={12} aria-hidden="true" /> Buat otomatis
            </button>
          )}
        >
          <input
            id="f-nip"
            value={v.nip}
            placeholder="BRT-2026-0001"
            maxLength={13}
            onChange={(x) => set('nip', x.target.value.toUpperCase())}
            aria-invalid={!!e.nip || undefined}
            className={inp(e.nip, 'num')}
          />
          <FieldError>{e.nip}</FieldError>
        </Field>
        <Field label="Divisi" required htmlFor="f-div">
          <select
            id="f-div"
            value={v.division_id}
            onChange={(x) => { set('division_id', x.target.value); set('position_id', ''); }}
            aria-invalid={!!e.division_id || undefined}
            className={sel(e.division_id)}
          >
            <option value="">Pilih divisi</option>
            {master.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <FieldError>{e.division_id}</FieldError>
        </Field>
        <Field label="Jabatan" required htmlFor="f-pos">
          <select
            id="f-pos"
            value={v.position_id}
            disabled={!v.division_id}
            onChange={(x) => set('position_id', x.target.value)}
            aria-invalid={!!e.position_id || undefined}
            className={cx(sel(e.position_id), 'disabled:bg-subtle disabled:text-faint')}
          >
            <option value="">{v.division_id ? 'Pilih jabatan' : 'Pilih divisi dulu'}</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <FieldError>{e.position_id}</FieldError>
        </Field>
        <Field label="Tanggal masuk" required htmlFor="f-join">
          <input id="f-join" type="date" value={v.join_date} onChange={(x) => set('join_date', x.target.value)} aria-invalid={!!e.join_date || undefined} className={inp(e.join_date)} />
          <FieldError>{e.join_date}</FieldError>
        </Field>
        <Field label="Status karyawan" required htmlFor="f-emp">
          <Segmented name="Status karyawan" options={EMPLOYMENT_OPTIONS} value={v.employment_status} onChange={(val) => set('employment_status', val)} />
          <FieldError>{e.employment_status}</FieldError>
        </Field>
        <Field label="Kantor" required htmlFor="f-office">
          <select id="f-office" value={v.office_id} onChange={(x) => set('office_id', x.target.value)} aria-invalid={!!e.office_id || undefined} className={sel(e.office_id)}>
            <option value="">Pilih kantor</option>
            {master.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <FieldError>{e.office_id}</FieldError>
        </Field>
        <Field label="Shift" required htmlFor="f-shift">
          <select id="f-shift" value={v.shift_id} onChange={(x) => set('shift_id', x.target.value)} aria-invalid={!!e.shift_id || undefined} className={sel(e.shift_id)}>
            <option value="">Pilih shift</option>
            {master.shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>
            ))}
          </select>
          <FieldError>{e.shift_id}</FieldError>
        </Field>
      </FormSection>
    </>
  );
}

/** Field gaji, rekening, dan BPJS. */
export function SalaryFields({ values: v, set, errors: e, withEffectiveFrom = false, wrap = true }) {
  const fields = (
    <>
      <Field label="Gaji pokok" required htmlFor="f-base">
        <MoneyInput id="f-base" value={v.base_salary} onChange={(val) => set('base_salary', val)} invalid={!!e.base_salary} />
        <FieldError>{e.base_salary}</FieldError>
      </Field>
      <Field label="Tunjangan tetap" htmlFor="f-allow">
        <MoneyInput id="f-allow" value={v.fixed_allowance} onChange={(val) => set('fixed_allowance', val)} invalid={!!e.fixed_allowance} />
        <FieldError>{e.fixed_allowance}</FieldError>
      </Field>
      <Field label="Bank" required htmlFor="f-bank">
        <input id="f-bank" list="bank-list" value={v.bank_name} onChange={(x) => set('bank_name', x.target.value)} placeholder="Contoh: BCA" aria-invalid={!!e.bank_name || undefined} className={inp(e.bank_name)} />
        <datalist id="bank-list">
          {['BCA', 'Mandiri', 'BNI', 'BRI', 'BSI', 'CIMB Niaga', 'Permata'].map((b) => <option key={b} value={b} />)}
        </datalist>
        <FieldError>{e.bank_name}</FieldError>
      </Field>
      <Field label="4 digit terakhir rekening" required htmlFor="f-last4" hint={e.bank_account_last4 ? null : 'Nomor rekening lengkap tidak disimpan.'}>
        <input id="f-last4" inputMode="numeric" value={v.bank_account_last4} onChange={(x) => set('bank_account_last4', digitsOnly(x.target.value, 4))} placeholder="1234" aria-invalid={!!e.bank_account_last4 || undefined} className={inp(e.bank_account_last4, 'num')} />
        <FieldError>{e.bank_account_last4}</FieldError>
      </Field>
      <Field label="No. BPJS Kesehatan" htmlFor="f-kes" aside="13 digit">
        <input id="f-kes" inputMode="numeric" value={v.bpjs_kes_no} onChange={(x) => set('bpjs_kes_no', digitsOnly(x.target.value, 13))} aria-invalid={!!e.bpjs_kes_no || undefined} className={inp(e.bpjs_kes_no, 'num')} />
        <FieldError>{e.bpjs_kes_no}</FieldError>
      </Field>
      <Field label="No. BPJS Ketenagakerjaan" htmlFor="f-tk" aside="11 digit">
        <input id="f-tk" inputMode="numeric" value={v.bpjs_tk_no} onChange={(x) => set('bpjs_tk_no', digitsOnly(x.target.value, 11))} aria-invalid={!!e.bpjs_tk_no || undefined} className={inp(e.bpjs_tk_no, 'num')} />
        <FieldError>{e.bpjs_tk_no}</FieldError>
      </Field>
      {withEffectiveFrom && (
        <>
          <Field label="Berlaku mulai" required htmlFor="f-eff">
            <input id="f-eff" type="date" value={v.effective_from} onChange={(x) => set('effective_from', x.target.value)} aria-invalid={!!e.effective_from || undefined} className={inp(e.effective_from)} />
            <FieldError>{e.effective_from}</FieldError>
          </Field>
          <Field label="Catatan" htmlFor="f-note">
            <input id="f-note" value={v.note ?? ''} onChange={(x) => set('note', x.target.value)} placeholder="Contoh: Kenaikan tahunan" className={inputCls} />
          </Field>
        </>
      )}
    </>
  );

  if (!wrap) return <div className="grid gap-4 sm:grid-cols-2">{fields}</div>;
  return (
    <FormSection title="Gaji, rekening & BPJS" description="Gaji awal berlaku sejak tanggal masuk. Perubahan berikutnya tercatat sebagai riwayat.">
      {fields}
    </FormSection>
  );
}
