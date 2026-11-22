-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 10: Payroll bulanan (HR)
-- Tabel payroll_settings, payroll_runs, payslips + seed tarif BPJS.
-- RPC: create_payroll_run, recalculate_payroll_run, update_payslip_manual,
--      finalize_payroll_run, mark_payroll_paid, reopen_payroll_run, hr_payroll_runs.
-- Semua penulisan runs/payslips lewat RPC security definer; tarif selalu dibaca dari payroll_settings.
-- Referensi: PRD US-13, bagian 6.4, bagian 7, bagian 8
-- =====================================================================

-- ---------------------------------------------------------------------
-- payroll_settings: tarif & batas upah per tanggal berlaku. Tarif disimpan sebagai pecahan (0.01 = 1%).
-- ---------------------------------------------------------------------
create table public.payroll_settings (
  id              uuid primary key default gen_random_uuid(),
  key             text not null check (key ~ '^[a-z0-9_]+$'),
  value           numeric(16, 6) not null check (value >= 0),
  effective_from  date not null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (key, effective_from)
);

-- ---------------------------------------------------------------------
-- payroll_runs: satu run per periode (YYYY-MM). draft -> final -> paid.
-- ---------------------------------------------------------------------
create table public.payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  period        text not null unique check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status        text not null default 'draft' check (status in ('draft', 'final', 'paid')),
  created_by    uuid references public.profiles (id) on delete set null,
  finalized_by  uuid references public.profiles (id) on delete set null,
  finalized_at  timestamptz,
  paid_by       uuid references public.profiles (id) on delete set null,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status = 'draft' or finalized_at is not null),
  check (status <> 'paid' or paid_at is not null)
);

-- ---------------------------------------------------------------------
-- payslips: snapshot angka per karyawan per run. Tidak dihitung ulang setelah final.
-- employer_contributions: {"bpjs_kes","jht","jp","jkk","jkm","total"} dalam rupiah.
-- ---------------------------------------------------------------------
create table public.payslips (
  id                      uuid primary key default gen_random_uuid(),
  run_id                  uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id             uuid not null references public.profiles (id) on delete cascade,
  salary_component_id     uuid references public.salary_components (id) on delete set null,
  base_salary             numeric(14, 0) not null check (base_salary >= 0),
  allowance               numeric(14, 0) not null default 0 check (allowance >= 0),
  bonus                   numeric(14, 0) not null default 0 check (bonus >= 0),
  gross                   numeric(14, 0) not null check (gross >= 0),
  bpjs_kes                numeric(14, 0) not null default 0 check (bpjs_kes >= 0),
  bpjs_jht                numeric(14, 0) not null default 0 check (bpjs_jht >= 0),
  bpjs_jp                 numeric(14, 0) not null default 0 check (bpjs_jp >= 0),
  pph21                   numeric(14, 0) not null default 0 check (pph21 >= 0),
  other_deductions        numeric(14, 0) not null default 0 check (other_deductions >= 0),
  net                     numeric(14, 0) not null,
  employer_contributions  jsonb not null default '{}'::jsonb,
  bank_name               text,
  bank_account_last4      text check (bank_account_last4 ~ '^[0-9]{4}$'),
  note                    text check (length(note) <= 300),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index payslips_employee_idx on public.payslips (employee_id);

create trigger set_updated_at before update on public.payroll_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.payroll_runs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.payslips
  for each row execute function public.set_updated_at();

-- Perubahan tarif oleh HR tercatat di audit_logs (log_audit dari migrasi 2).
create trigger audit_payroll_settings after insert or update on public.payroll_settings
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------------
-- Hak akses + RLS
-- payroll_settings: hanya HR (karyawan tidak bisa melihat).
-- payroll_runs: HR semua; karyawan hanya run final/paid (draft tersembunyi).
-- payslips: HR semua; karyawan hanya miliknya pada run final/paid.
-- runs & payslips hanya SELECT dari client; penulisan lewat RPC.
-- ---------------------------------------------------------------------
revoke all on public.payroll_settings, public.payroll_runs, public.payslips from anon, authenticated;
grant select, insert, update on public.payroll_settings to authenticated;
grant select on public.payroll_runs, public.payslips to authenticated;

alter table public.payroll_settings enable row level security;
alter table public.payroll_runs     enable row level security;
alter table public.payslips         enable row level security;

create policy "payroll_settings: HR baca" on public.payroll_settings
  for select to authenticated using (public.is_hr());
create policy "payroll_settings: HR tambah" on public.payroll_settings
  for insert to authenticated with check (public.is_hr());
create policy "payroll_settings: HR ubah" on public.payroll_settings
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "payroll_runs: HR baca semua" on public.payroll_runs
  for select to authenticated using (public.is_hr());
create policy "payroll_runs: karyawan baca yang sudah terbit" on public.payroll_runs
  for select to authenticated using (status in ('final', 'paid'));

create policy "payslips: HR baca semua" on public.payslips
  for select to authenticated using (public.is_hr());
create policy "payslips: karyawan baca miliknya yang sudah terbit" on public.payslips
  for select to authenticated using (
    employee_id = auth.uid()
    and exists (
      select 1 from public.payroll_runs r
      where r.id = payslips.run_id and r.status in ('final', 'paid')
    )
  );

-- ---------------------------------------------------------------------
-- Seed tarif BPJS (PRD 6.4). Berlaku sejak Maret 2025 (batas upah JP Rp10.547.400).
-- Perubahan tarif/batas upah = baris baru dengan effective_from baru.
-- ---------------------------------------------------------------------
insert into public.payroll_settings (key, value, effective_from, note) values
  ('bpjs_kes_employee_rate', 0.01,     '2025-03-01', 'BPJS Kesehatan bagian karyawan 1%'),
  ('bpjs_kes_employer_rate', 0.04,     '2025-03-01', 'BPJS Kesehatan bagian perusahaan 4%'),
  ('bpjs_kes_wage_cap',      12000000, '2025-03-01', 'Batas upah BPJS Kesehatan'),
  ('jht_employee_rate',      0.02,     '2025-03-01', 'JHT bagian karyawan 2%'),
  ('jht_employer_rate',      0.037,    '2025-03-01', 'JHT bagian perusahaan 3,7%'),
  ('jp_employee_rate',       0.01,     '2025-03-01', 'JP bagian karyawan 1%'),
  ('jp_employer_rate',       0.02,     '2025-03-01', 'JP bagian perusahaan 2%'),
  ('jp_wage_cap',            10547400, '2025-03-01', 'Batas upah Jaminan Pensiun sejak Maret 2025'),
  ('jkk_employer_rate',      0.0024,   '2025-03-01', 'JKK bagian perusahaan 0,24% (risiko sangat rendah)'),
  ('jkm_employer_rate',      0.003,    '2025-03-01', 'JKM bagian perusahaan 0,3%')
on conflict (key, effective_from) do nothing;

-- ---------------------------------------------------------------------
-- payroll_setting: nilai terbaru yang berlaku pada p_date. Error jika belum diatur.
-- ---------------------------------------------------------------------
create or replace function public.payroll_setting(p_key text, p_date date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value numeric;
begin
  select s.value into v_value
  from public.payroll_settings s
  where s.key = p_key and s.effective_from <= p_date
  order by s.effective_from desc
  limit 1;
  if v_value is null then
    raise exception 'Pengaturan payroll "%" belum tersedia untuk periode %.', p_key, to_char(p_date, 'MM-YYYY')
      using errcode = 'P0001';
  end if;
  return v_value;
end;
$$;

revoke all on function public.payroll_setting(text, date) from public, anon, authenticated;

-- Awal & akhir bulan dari 'YYYY-MM'.
create or replace function public._payroll_period_start(p_period text)
returns date
language sql
immutable
strict
set search_path = ''
as $$
  select to_date(p_period || '-01', 'YYYY-MM-DD');
$$;

revoke all on function public._payroll_period_start(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- _payroll_fill_run: isi/sinkronkan payslips sebuah run draft dari salary_components
-- yang berlaku pada akhir periode dan tarif payroll_settings pada awal periode.
-- Karyawan aktif tanpa data gaji dilewati (dilaporkan di hasil).
-- Bonus, PPh 21, potongan lain, dan catatan yang sudah diisi HR dipertahankan.
-- Hasil: {"payslips": n, "skipped": [{"id","full_name"}]}
-- ---------------------------------------------------------------------
create or replace function public._payroll_fill_run(p_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run      public.payroll_runs;
  v_start    date;
  v_end      date;
  v_kes_emp  numeric;
  v_kes_er   numeric;
  v_kes_cap  numeric;
  v_jht_emp  numeric;
  v_jht_er   numeric;
  v_jp_emp   numeric;
  v_jp_er    numeric;
  v_jp_cap   numeric;
  v_jkk_er   numeric;
  v_jkm_er   numeric;
  v_count    integer;
  v_skipped  jsonb;
begin
  select * into v_run from public.payroll_runs where id = p_run_id;
  if not found or v_run.status <> 'draft' then
    raise exception 'Hanya payroll berstatus draft yang bisa dihitung.' using errcode = 'P0001';
  end if;

  v_start := public._payroll_period_start(v_run.period);
  v_end   := (v_start + interval '1 month' - interval '1 day')::date;

  v_kes_emp := public.payroll_setting('bpjs_kes_employee_rate', v_start);
  v_kes_er  := public.payroll_setting('bpjs_kes_employer_rate', v_start);
  v_kes_cap := public.payroll_setting('bpjs_kes_wage_cap', v_start);
  v_jht_emp := public.payroll_setting('jht_employee_rate', v_start);
  v_jht_er  := public.payroll_setting('jht_employer_rate', v_start);
  v_jp_emp  := public.payroll_setting('jp_employee_rate', v_start);
  v_jp_er   := public.payroll_setting('jp_employer_rate', v_start);
  v_jp_cap  := public.payroll_setting('jp_wage_cap', v_start);
  v_jkk_er  := public.payroll_setting('jkk_employer_rate', v_start);
  v_jkm_er  := public.payroll_setting('jkm_employer_rate', v_start);

  -- Karyawan aktif yang sudah bergabung sampai akhir periode + gaji terbaru yang berlaku.
  create temporary table _payroll_calc on commit drop as
  with eligible as (
    select p.id as employee_id, sc.id as sc_id, sc.base_salary, sc.fixed_allowance,
           sc.bank_name, sc.bank_account_last4, (sc.base_salary + sc.fixed_allowance) as wage
    from public.profiles p
    cross join lateral (
      select c.* from public.salary_components c
      where c.employee_id = p.id and c.effective_from <= v_end
      order by c.effective_from desc, c.created_at desc
      limit 1
    ) sc
    where p.is_active and (p.join_date is null or p.join_date <= v_end)
  )
  select e.*,
    round(least(e.wage, v_kes_cap) * v_kes_emp) as kes,
    round(e.wage * v_jht_emp)                   as jht,
    round(least(e.wage, v_jp_cap) * v_jp_emp)   as jp,
    round(least(e.wage, v_kes_cap) * v_kes_er)  as er_kes,
    round(e.wage * v_jht_er)                    as er_jht,
    round(least(e.wage, v_jp_cap) * v_jp_er)    as er_jp,
    round(e.wage * v_jkk_er)                    as er_jkk,
    round(e.wage * v_jkm_er)                    as er_jkm
  from eligible e;

  -- Draft: karyawan yang tidak lagi memenuhi syarat dikeluarkan dari run.
  delete from public.payslips ps
  where ps.run_id = p_run_id
    and not exists (select 1 from pg_temp._payroll_calc c where c.employee_id = ps.employee_id);

  insert into public.payslips as ps (
    run_id, employee_id, salary_component_id, base_salary, allowance, bonus, gross,
    bpjs_kes, bpjs_jht, bpjs_jp, pph21, other_deductions, net, employer_contributions,
    bank_name, bank_account_last4
  )
  select
    p_run_id, c.employee_id, c.sc_id, c.base_salary, c.fixed_allowance, 0, c.wage,
    c.kes, c.jht, c.jp, 0, 0, c.wage - c.kes - c.jht - c.jp,
    jsonb_build_object(
      'bpjs_kes', c.er_kes, 'jht', c.er_jht, 'jp', c.er_jp, 'jkk', c.er_jkk, 'jkm', c.er_jkm,
      'total', c.er_kes + c.er_jht + c.er_jp + c.er_jkk + c.er_jkm
    ),
    c.bank_name, c.bank_account_last4
  from pg_temp._payroll_calc c
  on conflict (run_id, employee_id) do update set
    salary_component_id    = excluded.salary_component_id,
    base_salary            = excluded.base_salary,
    allowance              = excluded.allowance,
    gross                  = excluded.base_salary + excluded.allowance + ps.bonus,
    bpjs_kes               = excluded.bpjs_kes,
    bpjs_jht               = excluded.bpjs_jht,
    bpjs_jp                = excluded.bpjs_jp,
    net                    = excluded.base_salary + excluded.allowance + ps.bonus
                             - excluded.bpjs_kes - excluded.bpjs_jht - excluded.bpjs_jp
                             - ps.pph21 - ps.other_deductions,
    employer_contributions = excluded.employer_contributions,
    bank_name              = excluded.bank_name,
    bank_account_last4     = excluded.bank_account_last4;

  select count(*)::integer into v_count from public.payslips where run_id = p_run_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name) order by p.full_name), '[]'::jsonb)
    into v_skipped
  from public.profiles p
  where p.is_active and (p.join_date is null or p.join_date <= v_end)
    and not exists (select 1 from pg_temp._payroll_calc c where c.employee_id = p.id);

  drop table pg_temp._payroll_calc;
  return jsonb_build_object('payslips', v_count, 'skipped', v_skipped);
end;
$$;

revoke all on function public._payroll_fill_run(uuid) from public, anon, authenticated;

-- Kunci run untuk diubah; error jika tidak ada.
create or replace function public._payroll_lock_run(p_run_id uuid)
returns public.payroll_runs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run public.payroll_runs;
begin
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if not found then
    raise exception 'Payroll tidak ditemukan.' using errcode = 'P0002';
  end if;
  return v_run;
end;
$$;

revoke all on function public._payroll_lock_run(uuid) from public, anon, authenticated;

-- Pemeriksaan HR bersama untuk semua RPC payroll.
create or replace function public._payroll_require_hr()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat mengelola payroll.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke all on function public._payroll_require_hr() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- create_payroll_run: buat run draft + payslips untuk periode 'YYYY-MM'.
-- Hasil: {"run": {...}, "payslips": n, "skipped": [...]}
-- ---------------------------------------------------------------------
create or replace function public.create_payroll_run(p_period text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := public._payroll_require_hr();
  v_period text := trim(coalesce(p_period, ''));
  v_month  date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;
  v_run    public.payroll_runs;
  v_fill   jsonb;
begin
  if v_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Periode harus berformat YYYY-MM.' using errcode = '22023';
  end if;
  if public._payroll_period_start(v_period) > (v_month + interval '1 month')::date then
    raise exception 'Payroll paling jauh bisa dibuat untuk bulan depan.' using errcode = '22023';
  end if;

  begin
    insert into public.payroll_runs (period, created_by) values (v_period, v_uid)
    returning * into v_run;
  exception when unique_violation then
    raise exception 'Payroll periode % sudah dibuat.', v_period using errcode = 'P0001';
  end;

  v_fill := public._payroll_fill_run(v_run.id);
  if (v_fill ->> 'payslips')::integer = 0 then
    raise exception 'Tidak ada karyawan aktif dengan data gaji yang berlaku untuk periode ini.'
      using errcode = 'P0001';
  end if;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'insert', 'payroll_runs', v_run.id, jsonb_build_object(
    'period', v_period, 'status', 'draft',
    'payslips', v_fill -> 'payslips', 'skipped', jsonb_array_length(v_fill -> 'skipped')));

  return jsonb_build_object('run', to_jsonb(v_run)) || v_fill;
end;
$$;

-- ---------------------------------------------------------------------
-- recalculate_payroll_run: "payroll ulang" untuk run draft (mis. setelah dibuka kembali
-- atau data gaji berubah). Bonus, PPh 21, dan catatan tetap.
-- ---------------------------------------------------------------------
create or replace function public.recalculate_payroll_run(p_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := public._payroll_require_hr();
  v_run   public.payroll_runs := public._payroll_lock_run(p_run_id);
  v_fill  jsonb;
begin
  if v_run.status <> 'draft' then
    raise exception 'Hanya payroll berstatus draft yang bisa dihitung ulang.' using errcode = 'P0001';
  end if;

  v_fill := public._payroll_fill_run(p_run_id);
  if (v_fill ->> 'payslips')::integer = 0 then
    raise exception 'Tidak ada karyawan aktif dengan data gaji yang berlaku untuk periode ini.'
      using errcode = 'P0001';
  end if;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'payroll_runs', p_run_id, jsonb_build_object(
    'recalculated', true, 'payslips', v_fill -> 'payslips', 'skipped', jsonb_array_length(v_fill -> 'skipped')));

  return v_fill;
end;
$$;

-- ---------------------------------------------------------------------
-- update_payslip_manual: HR isi bonus & PPh 21 (+ catatan) saat run masih draft.
-- Bruto dan take home pay dihitung ulang. null = nilai tidak diubah (catatan: null = dikosongkan).
-- ---------------------------------------------------------------------
create or replace function public.update_payslip_manual(
  p_id uuid, p_bonus numeric, p_pph21 numeric, p_note text default null
)
returns public.payslips
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := public._payroll_require_hr();
  v_run_id uuid;
  v_run    public.payroll_runs;
  v_slip   public.payslips;
  v_bonus  numeric;
  v_pph21  numeric;
  v_note   text := nullif(trim(coalesce(p_note, '')), '');
  v_gross  numeric;
  v_net    numeric;
  v_diff   jsonb := '{}'::jsonb;
  v_row    public.payslips;
begin
  select ps.run_id into v_run_id from public.payslips ps where ps.id = p_id;
  if not found then
    raise exception 'Slip gaji tidak ditemukan.' using errcode = 'P0002';
  end if;

  -- Kunci run dulu (urutan sama dengan finalize) agar tidak bisa diubah saat sedang difinalisasi.
  v_run := public._payroll_lock_run(v_run_id);
  if v_run.status <> 'draft' then
    raise exception 'Slip di payroll yang sudah % tidak bisa diubah. Buka kembali payroll terlebih dahulu.',
      case v_run.status when 'final' then 'final' else 'dibayar' end
      using errcode = 'P0001';
  end if;

  select * into v_slip from public.payslips where id = p_id for update;

  if p_bonus is not null and (p_bonus < 0 or p_bonus > 99999999999) then
    raise exception 'Bonus harus antara 0 dan 99.999.999.999.' using errcode = '22023';
  end if;
  if p_pph21 is not null and (p_pph21 < 0 or p_pph21 > 99999999999) then
    raise exception 'PPh 21 harus antara 0 dan 99.999.999.999.' using errcode = '22023';
  end if;
  if length(v_note) > 300 then
    raise exception 'Catatan maksimal 300 karakter.' using errcode = '22023';
  end if;

  v_bonus := round(coalesce(p_bonus, v_slip.bonus));
  v_pph21 := round(coalesce(p_pph21, v_slip.pph21));
  v_gross := v_slip.base_salary + v_slip.allowance + v_bonus;
  v_net   := v_gross - v_slip.bpjs_kes - v_slip.bpjs_jht - v_slip.bpjs_jp - v_pph21 - v_slip.other_deductions;

  if v_net < 0 then
    raise exception 'Potongan melebihi bruto: take home pay tidak boleh negatif.' using errcode = 'P0001';
  end if;

  if v_bonus <> v_slip.bonus then
    v_diff := v_diff || jsonb_build_object('bonus', jsonb_build_object('old', v_slip.bonus, 'new', v_bonus));
  end if;
  if v_pph21 <> v_slip.pph21 then
    v_diff := v_diff || jsonb_build_object('pph21', jsonb_build_object('old', v_slip.pph21, 'new', v_pph21));
  end if;
  if v_note is distinct from v_slip.note then
    v_diff := v_diff || jsonb_build_object('note', jsonb_build_object('old', v_slip.note, 'new', v_note));
  end if;

  update public.payslips set
    bonus = v_bonus, pph21 = v_pph21, note = v_note, gross = v_gross, net = v_net
  where id = p_id
  returning * into v_row;

  if v_diff <> '{}'::jsonb then
    insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
    values (v_uid, 'update', 'payslips', p_id, v_diff || jsonb_build_object('period', v_run.period));
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- finalize_payroll_run: draft -> final. Slip terbit ke karyawan dan terkunci.
-- ---------------------------------------------------------------------
create or replace function public.finalize_payroll_run(p_run_id uuid)
returns public.payroll_runs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public._payroll_require_hr();
  v_run  public.payroll_runs := public._payroll_lock_run(p_run_id);
  v_row  public.payroll_runs;
begin
  if v_run.status <> 'draft' then
    raise exception 'Hanya payroll berstatus draft yang bisa difinalisasi.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.payslips where run_id = p_run_id) then
    raise exception 'Payroll belum berisi slip gaji.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payslips where run_id = p_run_id and net < 0) then
    raise exception 'Ada slip dengan take home pay negatif. Perbaiki bonus atau PPh 21 terlebih dahulu.'
      using errcode = 'P0001';
  end if;

  update public.payroll_runs set status = 'final', finalized_by = v_uid, finalized_at = now()
  where id = p_run_id returning * into v_row;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'payroll_runs', p_run_id, jsonb_build_object(
    'period', v_run.period, 'status', jsonb_build_object('old', 'draft', 'new', 'final')));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- mark_payroll_paid: final -> paid.
-- ---------------------------------------------------------------------
create or replace function public.mark_payroll_paid(p_run_id uuid)
returns public.payroll_runs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public._payroll_require_hr();
  v_run  public.payroll_runs := public._payroll_lock_run(p_run_id);
  v_row  public.payroll_runs;
begin
  if v_run.status <> 'final' then
    raise exception 'Hanya payroll berstatus final yang bisa ditandai dibayar.' using errcode = 'P0001';
  end if;

  update public.payroll_runs set status = 'paid', paid_by = v_uid, paid_at = now()
  where id = p_run_id returning * into v_row;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'payroll_runs', p_run_id, jsonb_build_object(
    'period', v_run.period, 'status', jsonb_build_object('old', 'final', 'new', 'paid')));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- reopen_payroll_run: final -> draft untuk koreksi. Alasan wajib, dicatat ke audit_logs.
-- Payroll yang sudah dibayar tidak bisa dibuka kembali.
-- ---------------------------------------------------------------------
create or replace function public.reopen_payroll_run(p_run_id uuid, p_reason text)
returns public.payroll_runs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public._payroll_require_hr();
  v_run     public.payroll_runs := public._payroll_lock_run(p_run_id);
  v_reason  text := nullif(trim(coalesce(p_reason, '')), '');
  v_row     public.payroll_runs;
begin
  if v_run.status <> 'final' then
    raise exception 'Hanya payroll berstatus final yang bisa dibuka kembali.' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Alasan wajib diisi saat membuka kembali payroll.' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Alasan maksimal 500 karakter.' using errcode = '22023';
  end if;

  update public.payroll_runs set status = 'draft', finalized_by = null, finalized_at = null
  where id = p_run_id returning * into v_row;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'payroll_runs', p_run_id, jsonb_build_object(
    'period', v_run.period,
    'status', jsonb_build_object('old', 'final', 'new', 'draft'),
    'finalized_at', jsonb_build_object('old', v_run.finalized_at, 'new', null),
    'reason', v_reason));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- hr_payroll_runs: daftar run beserta total (untuk tabel HR & kartu Beranda).
-- ---------------------------------------------------------------------
create or replace function public.hr_payroll_runs()
returns table (
  id                   uuid,
  period               text,
  status               text,
  employee_count       integer,
  total_gross          numeric,
  total_bpjs_employee  numeric,
  total_pph21          numeric,
  total_net            numeric,
  total_employer       numeric,
  finalized_at         timestamptz,
  paid_at              timestamptz,
  created_at           timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public._payroll_require_hr();
  return query
  select r.id, r.period, r.status,
    count(ps.id)::integer,
    coalesce(sum(ps.gross), 0),
    coalesce(sum(ps.bpjs_kes + ps.bpjs_jht + ps.bpjs_jp), 0),
    coalesce(sum(ps.pph21), 0),
    coalesce(sum(ps.net), 0),
    coalesce(sum((ps.employer_contributions ->> 'total')::numeric), 0),
    r.finalized_at, r.paid_at, r.created_at
  from public.payroll_runs r
  left join public.payslips ps on ps.run_id = r.id
  group by r.id
  order by r.period desc;
end;
$$;

revoke all on function public.create_payroll_run(text)                 from public, anon;
revoke all on function public.recalculate_payroll_run(uuid)            from public, anon;
revoke all on function public.update_payslip_manual(uuid, numeric, numeric, text) from public, anon;
revoke all on function public.finalize_payroll_run(uuid)               from public, anon;
revoke all on function public.mark_payroll_paid(uuid)                  from public, anon;
revoke all on function public.reopen_payroll_run(uuid, text)           from public, anon;
revoke all on function public.hr_payroll_runs()                        from public, anon;
grant execute on function public.create_payroll_run(text)              to authenticated;
grant execute on function public.recalculate_payroll_run(uuid)         to authenticated;
grant execute on function public.update_payslip_manual(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.finalize_payroll_run(uuid)            to authenticated;
grant execute on function public.mark_payroll_paid(uuid)               to authenticated;
grant execute on function public.reopen_payroll_run(uuid, text)        to authenticated;
grant execute on function public.hr_payroll_runs()                     to authenticated;
