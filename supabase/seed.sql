-- =====================================================================
-- HRIS Blue Rose Tech — seed master data
-- Dijalankan otomatis oleh `supabase db reset` (lihat config.toml [db.seed]).
-- Akun/profil karyawan tidak di-seed di sini karena butuh auth.users.
-- =====================================================================

-- 6 divisi
insert into public.divisions (name) values
  ('Teknologi Informasi'),
  ('Human Capital'),
  ('Keuangan & Akuntansi'),
  ('Sales & Marketing'),
  ('Operasional'),
  ('Produk & Desain')
on conflict (name) do nothing;

-- 18 jabatan (3 per divisi)
insert into public.positions (name, division_id)
select p.name, d.id
from (values
  ('Frontend Developer',      'Teknologi Informasi'),
  ('Backend Developer',       'Teknologi Informasi'),
  ('IT Support',              'Teknologi Informasi'),
  ('HR Manager',              'Human Capital'),
  ('HR Generalist',           'Human Capital'),
  ('Recruiter',               'Human Capital'),
  ('Finance Manager',         'Keuangan & Akuntansi'),
  ('Akuntan',                 'Keuangan & Akuntansi'),
  ('Staf Pajak',              'Keuangan & Akuntansi'),
  ('Sales Executive',         'Sales & Marketing'),
  ('Digital Marketing',       'Sales & Marketing'),
  ('Account Manager',         'Sales & Marketing'),
  ('Operations Manager',      'Operasional'),
  ('Staf Administrasi',       'Operasional'),
  ('Staf Logistik',           'Operasional'),
  ('Product Manager',         'Produk & Desain'),
  ('UI/UX Designer',          'Produk & Desain'),
  ('QA Engineer',             'Produk & Desain')
) as p(name, division_name)
join public.divisions d on d.name = p.division_name
on conflict (division_id, name) do nothing;

-- Kantor (koordinat contoh: kawasan Sudirman, Jakarta Selatan)
insert into public.offices (name, latitude, longitude, radius_m) values
  ('Head Office Jakarta', -6.224889, 106.809889, 100)
on conflict (name) do nothing;

-- Shift reguler
insert into public.shifts (name, start_time, end_time, late_tolerance_min) values
  ('Reguler', '08:30', '17:30', 15)
on conflict (name) do nothing;

-- Libur nasional 2026.
-- Tanggal hari raya berbasis kalender Hijriah/lunar adalah perkiraan:
-- cocokkan dengan SKB 3 Menteri 2026 dan ubah lewat menu Pengaturan bila berbeda.
-- Cuti bersama tidak dimasukkan.
insert into public.holidays (date, name) values
  ('2026-01-01', 'Tahun Baru 2026 Masehi'),
  ('2026-01-16', 'Isra Mikraj Nabi Muhammad SAW'),
  ('2026-02-17', 'Tahun Baru Imlek 2577 Kongzili'),
  ('2026-03-19', 'Hari Suci Nyepi Tahun Baru Saka 1948'),
  ('2026-03-20', 'Hari Raya Idul Fitri 1447 H'),
  ('2026-03-21', 'Hari Raya Idul Fitri 1447 H'),
  ('2026-04-03', 'Wafat Yesus Kristus'),
  ('2026-04-05', 'Kebangkitan Yesus Kristus (Paskah)'),
  ('2026-05-01', 'Hari Buruh Internasional'),
  ('2026-05-14', 'Kenaikan Yesus Kristus'),
  ('2026-05-27', 'Hari Raya Idul Adha 1447 H'),
  ('2026-05-31', 'Hari Raya Waisak 2570 BE'),
  ('2026-06-01', 'Hari Lahir Pancasila'),
  ('2026-06-16', 'Tahun Baru Islam 1448 H'),
  ('2026-08-17', 'Hari Kemerdekaan Republik Indonesia'),
  ('2026-08-25', 'Maulid Nabi Muhammad SAW'),
  ('2026-12-25', 'Hari Raya Natal')
on conflict (date) do nothing;

-- Contoh template KPI (Frontend Developer, HR Generalist, Sales Executive) + periode Q1 2026.
-- Fungsi dibuat di migrasi KPI; dipanggil ulang di sini karena jabatan baru ada setelah seed di atas.
select public._seed_kpi_examples();
