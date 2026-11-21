-- =====================================================================
-- HRIS Blue Rose Tech — akun demo
--
-- Langkah 1 (Dashboard Supabase > Authentication > Users > Add user > Create new user),
-- buat dua user dengan centang "Auto Confirm User":
--   demo.karyawan@bluerose.test   password: DemoKaryawan2026   (role employee)
--   demo.hr@bluerose.test         password: DemoHR2026         (role hr)
--
-- Langkah 2: jalankan file ini di SQL Editor. Script mengisi tabel profiles untuk kedua user
-- tersebut. Aman dijalankan ulang (upsert). Jika user belum dibuat, script tidak menyisipkan apa pun.
--
-- Semua nama dan nomor di bawah fiktif.
-- =====================================================================

insert into public.profiles (
  id, nip, full_name, email, phone, gender, birth_date, role,
  division_id, position_id, office_id, shift_id, join_date, employment_status, is_active
)
select
  u.id, a.nip, a.full_name, u.email, a.phone, a.gender::public.gender_type, a.birth_date::date,
  a.role::public.user_role, d.id, p.id, o.id, s.id, a.join_date::date,
  'tetap'::public.employment_status, true
from (values
  ('demo.karyawan@bluerose.test', 'BRT-2024-0001', 'Raditya Pratama', '081200000001', 'laki_laki',
   '1997-05-14', 'employee', 'Teknologi Informasi', 'Frontend Developer', '2024-03-01'),
  ('demo.hr@bluerose.test',       'BRT-2021-0001', 'Dian Lestari',    '081200000002', 'perempuan',
   '1990-09-02', 'hr',       'Human Capital',       'HR Manager',         '2021-07-01')
) as a(email, nip, full_name, phone, gender, birth_date, role, division_name, position_name, join_date)
join auth.users u        on lower(u.email) = a.email
join public.divisions d  on d.name = a.division_name
join public.positions p  on p.name = a.position_name and p.division_id = d.id
cross join (select id from public.offices where name = 'Head Office Jakarta') o
cross join (select id from public.shifts  where name = 'Reguler') s
on conflict (id) do update set
  nip = excluded.nip,
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  gender = excluded.gender,
  birth_date = excluded.birth_date,
  role = excluded.role,
  division_id = excluded.division_id,
  position_id = excluded.position_id,
  office_id = excluded.office_id,
  shift_id = excluded.shift_id,
  join_date = excluded.join_date,
  employment_status = excluded.employment_status,
  is_active = true;

-- Cek hasil: harus 2 baris.
select p.email, p.role, p.full_name, pos.name as jabatan, d.name as divisi
from public.profiles p
left join public.positions pos on pos.id = p.position_id
left join public.divisions d on d.id = p.division_id
where p.email in ('demo.karyawan@bluerose.test', 'demo.hr@bluerose.test');
