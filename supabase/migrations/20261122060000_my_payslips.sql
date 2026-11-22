-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 11: Slip gaji karyawan (self-service)
-- RPC my_payslip_periods: daftar periode yang punya slip untuk karyawan login.
-- Tidak ada tabel baru. Detail slip tetap dibaca dari tabel payslips lewat RLS
-- (hanya milik sendiri dan hanya run final/paid).
-- Referensi: PRD US-14
-- =====================================================================

-- ---------------------------------------------------------------------
-- RLS payroll_runs menyembunyikan run draft dari karyawan, sehingga periode yang
-- masih diproses tidak bisa diketahui dari client. Fungsi ini hanya membuka keberadaan
-- periode + status untuk slip milik sendiri; nominal & id slip draft tidak dikembalikan.
-- ---------------------------------------------------------------------
create or replace function public.my_payslip_periods()
returns table (
  period              text,
  status              text,
  payslip_id          uuid,
  net                 numeric,
  bank_name           text,
  bank_account_last4  text,
  finalized_at        timestamptz,
  paid_at             timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.period,
    r.status,
    case when r.status in ('final', 'paid') then s.id end,
    case when r.status in ('final', 'paid') then s.net end,
    case when r.status in ('final', 'paid') then s.bank_name end,
    case when r.status in ('final', 'paid') then s.bank_account_last4 end,
    r.finalized_at,
    r.paid_at
  from public.payslips s
  join public.payroll_runs r on r.id = s.run_id
  where s.employee_id = auth.uid()
  order by r.period desc;
$$;

revoke all on function public.my_payslip_periods() from public, anon;
grant execute on function public.my_payslip_periods() to authenticated;
