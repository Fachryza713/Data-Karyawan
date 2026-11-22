-- =====================================================================
-- HRIS Blue Rose Tech — data gaji & manfaat untuk akun demo karyawan
--
-- Jalankan setelah demo-accounts.sql (SQL Editor, atau
-- `npx supabase db query --remote -f supabase/demo-payroll.sql`).
-- Mengisi untuk demo.karyawan@bluerose.test:
--   - salary_components: gaji pokok Rp12.000.000 + tunjangan tetap Rp3.850.000, BCA •••• 8821
--   - benefits: BPJS Kesehatan, BPJS Ketenagakerjaan, asuransi kesehatan kumpulan
-- Aman dijalankan ulang: baris yang sudah ada tidak diduplikasi.
-- Payroll yang sudah dibuat tidak berubah otomatis; buka kembali lalu "Hitung ulang" di portal HR.
--
-- Semua nama dan nomor di bawah fiktif.
-- =====================================================================

with emp as (
  select id, coalesce(join_date, current_date) as join_date
  from public.profiles
  where email = 'demo.karyawan@bluerose.test'
)
insert into public.salary_components (
  employee_id, base_salary, fixed_allowance, bank_name, bank_account_last4,
  bpjs_kes_no, bpjs_tk_no, effective_from, note
)
select emp.id, 12000000, 3850000, 'BCA', '8821', '0002938172918', '21908237192', emp.join_date, 'Data demo'
from emp
where not exists (select 1 from public.salary_components c where c.employee_id = emp.id);

with emp as (
  select id from public.profiles where email = 'demo.karyawan@bluerose.test'
)
insert into public.benefits (employee_id, provider, program, card_no, class, dependents, status)
select emp.id, b.provider, b.program, b.card_no, b.class, b.dependents, 'aktif'
from emp
cross join (values
  ('BPJS Kesehatan',               'JKN',                     '0002938172918', 'Kelas 1',  2),
  ('BPJS Ketenagakerjaan',         'JHT, JKK, JKM, JP',       '21908237192',   null,       0),
  ('Asuransi Kesehatan Kumpulan',  'Rawat inap & rawat jalan', 'AKK-0099214',  'Kamar VIP', 2)
) as b(provider, program, card_no, class, dependents)
where not exists (
  select 1 from public.benefits x where x.employee_id = emp.id and x.provider = b.provider
);
