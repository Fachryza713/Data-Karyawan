-- =====================================================================
-- HRIS Blue Rose Tech — seed data demo (semua nama, NIP, nomor, dan email FIKTIF)
--
-- Isi:
--   * akun demo demo.karyawan@bluerose.test / demo.hr@bluerose.test (dibuat bila belum ada)
--   * 28 karyawan fiktif di 6 divisi (1 di antaranya nonaktif) + gaji, rekening 4 digit, BPJS, asuransi
--   * pengajuan cuti/sakit/izin/WFH/dinas di semua status (menunggu, disetujui, ditolak, dibatalkan)
--   * riwayat absen sejak awal bulan lalu sampai kemarin (hari kerja saja)
--   * payroll bulan lalu (Dibayar) dan satu payroll Draft
--   * template KPI untuk setiap jabatan yang terisi + satu periode KPI aktif dengan sebagian penilaian
--
-- Cara pakai: setelah migrasi dan seed.sql (master data),
--   npx supabase db query --remote -f supabase/seed-demo.sql     (cloud)
--   otomatis saat `npx supabase db reset` (lokal, lihat config.toml [db.seed])
-- Aman dijalankan ulang: data yang sudah ada tidak diduplikasi; riwayat absen diisi ulang
-- untuk hari yang kosong atau hanya ditandai alpa otomatis oleh pg_cron.
--
-- Beberapa langkah memanggil RPC asli sebagai HR demo (review_request, payroll, KPI) agar
-- efek sampingnya sama dengan aplikasi: saldo cuti, presensi cuti, slip, notifikasi, audit log.
-- =====================================================================
do $seed$
declare
  v_today    date := (now() at time zone 'Asia/Jakarta')::date;
  v_from     date := (date_trunc('month', now() at time zone 'Asia/Jakarta') - interval '1 month')::date;
  v_t0       timestamptz := now();
  v_hr       uuid;
  v_run      uuid;
  v_period   text;
  v_kpi      uuid;
  v_year     integer;
  v_quarter  integer;
  v_qend     date;
  v_scores   jsonb;
  r          record;
  n_emp      integer;
  n_att      integer;
  n_req      integer;
  n_rev      integer;
begin
  if not exists (select 1 from public.offices where name = 'Head Office Jakarta')
     or not exists (select 1 from public.shifts where name = 'Reguler')
     or (select count(*) from public.positions) < 18 then
    raise exception 'Master data belum ada. Jalankan supabase/seed.sql terlebih dahulu.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. Akun demo (login) + profilnya. Tidak mengubah akun/profil yang sudah ada.
  -- -------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', a.email,
         extensions.crypt(a.pw, extensions.gen_salt('bf')), now(),
         '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
  from (values ('demo.karyawan@bluerose.test', 'DemoKaryawan2026'),
               ('demo.hr@bluerose.test',       'DemoHR2026')) as a(email, pw)
  where not exists (select 1 from auth.users u where lower(u.email) = a.email);

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
  from auth.users u
  where lower(u.email) in ('demo.karyawan@bluerose.test', 'demo.hr@bluerose.test')
    and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

  insert into public.profiles (id, nip, full_name, email, phone, gender, birth_date, role,
                               division_id, position_id, office_id, shift_id, join_date, employment_status, is_active)
  select u.id, a.nip, a.full_name, u.email, a.phone, a.gender::public.gender_type, a.birth_date::date,
         a.role::public.user_role, d.id, p.id, o.id, s.id, a.join_date::date, 'tetap', true
  from (values
    ('demo.karyawan@bluerose.test', 'BRT-2024-0001', 'Raditya Pratama', '081200000001', 'laki_laki', '1997-05-14',
     'employee', 'Teknologi Informasi', 'Frontend Developer', '2024-03-01'),
    ('demo.hr@bluerose.test', 'BRT-2021-0001', 'Dian Lestari', '081200000002', 'perempuan', '1990-09-02',
     'hr', 'Human Capital', 'HR Manager', '2021-07-01')
  ) as a(email, nip, full_name, phone, gender, birth_date, role, division_name, position_name, join_date)
  join auth.users u on lower(u.email) = a.email
  join public.divisions d on d.name = a.division_name
  join public.positions p on p.name = a.position_name and p.division_id = d.id
  cross join (select id from public.offices where name = 'Head Office Jakarta') o
  cross join (select id from public.shifts where name = 'Reguler') s
  on conflict do nothing;

  select id into v_hr from public.profiles where email = 'demo.hr@bluerose.test' and role = 'hr' and is_active;
  if v_hr is null then
    select id into v_hr from public.profiles where role = 'hr' and is_active order by created_at limit 1;
  end if;
  if v_hr is null then
    raise exception 'Tidak ada akun HR aktif untuk menjalankan seed.';
  end if;

  -- -------------------------------------------------------------------
  -- 2. 28 karyawan fiktif. id = md5 NIP agar tetap sama setiap kali seed dijalankan.
  -- -------------------------------------------------------------------
  create temporary table _demo_emp on commit drop as
  select md5('brt-demo-' || e.nip)::uuid as id,
         lower(split_part(e.full_name, ' ', 1) || '.' || split_part(e.full_name, ' ', 2)) || '@bluerose.test' as email,
         '08121000' || lpad(e.no::text, 4, '0') as phone,
         e.*
  from (values
    -- no, NIP, nama, gender, lahir, divisi, jabatan, bergabung, status, gaji pokok, tunjangan, bank, tanggungan, aktif
    ( 1, 'BRT-2022-0101', 'Andika Saputra',       'laki_laki', '1993-04-12', 'Teknologi Informasi',  'Backend Developer',  '2022-02-14', 'tetap',   13500000, 1500000, 'BCA',     2, true),
    ( 2, 'BRT-2023-0102', 'Nadia Putri Rahmawati', 'perempuan', '1996-08-23', 'Teknologi Informasi',  'Backend Developer',  '2023-06-05', 'tetap',   12000000, 1500000, 'Mandiri', 0, true),
    ( 3, 'BRT-2021-0103', 'Fajar Nugroho',        'laki_laki', '1994-01-30', 'Teknologi Informasi',  'IT Support',         '2021-09-01', 'tetap',    7500000, 1000000, 'BNI',     1, true),
    ( 4, 'BRT-2024-0104', 'Citra Ayu Lestari',    'perempuan', '1999-11-05', 'Teknologi Informasi',  'Frontend Developer', '2024-08-19', 'kontrak', 10500000, 1250000, 'BCA',     0, true),
    ( 5, 'BRT-2025-0105', 'Rizky Firmansyah',     'laki_laki', '2000-06-17', 'Teknologi Informasi',  'IT Support',         '2025-01-06', 'kontrak',  6500000,  750000, 'BRI',     0, true),
    ( 6, 'BRT-2020-0106', 'Sari Wulandari',       'perempuan', '1991-02-08', 'Human Capital',        'HR Generalist',      '2020-03-02', 'tetap',    8500000, 1000000, 'Mandiri', 2, true),
    ( 7, 'BRT-2023-0107', 'Yoga Prasetyo',        'laki_laki', '1995-10-19', 'Human Capital',        'Recruiter',          '2023-01-16', 'tetap',    7800000, 1000000, 'BCA',     1, true),
    ( 8, 'BRT-2024-0108', 'Melati Anggraini',     'perempuan', '1998-03-27', 'Human Capital',        'HR Generalist',      '2024-04-01', 'kontrak',  7000000,  750000, 'BNI',     0, true),
    ( 9, 'BRT-2018-0109', 'Hendra Wijaya',        'laki_laki', '1984-07-14', 'Keuangan & Akuntansi', 'Finance Manager',    '2018-11-12', 'tetap',   23000000, 3000000, 'BCA',     3, true),
    (10, 'BRT-2019-0110', 'Ratna Sari Dewi',      'perempuan', '1990-12-02', 'Keuangan & Akuntansi', 'Akuntan',            '2019-07-01', 'tetap',    9500000, 1000000, 'Mandiri', 2, true),
    (11, 'BRT-2022-0111', 'Agus Setiawan',        'laki_laki', '1993-05-25', 'Keuangan & Akuntansi', 'Akuntan',            '2022-10-03', 'tetap',    8800000, 1000000, 'BRI',     1, true),
    (12, 'BRT-2021-0112', 'Lina Marlina',         'perempuan', '1992-09-09', 'Keuangan & Akuntansi', 'Staf Pajak',         '2021-05-17', 'tetap',    8200000, 1000000, 'BCA',     1, true),
    (13, 'BRT-2024-0113', 'Taufik Hidayat',       'laki_laki', '1999-04-04', 'Keuangan & Akuntansi', 'Staf Pajak',         '2024-02-12', 'kontrak',  6800000,  750000, 'BNI',     0, true),
    (14, 'BRT-2022-0114', 'Bayu Aditya',          'laki_laki', '1995-01-21', 'Sales & Marketing',    'Sales Executive',    '2022-01-10', 'tetap',    8000000, 1500000, 'BCA',     1, true),
    (15, 'BRT-2023-0115', 'Intan Permatasari',    'perempuan', '1997-07-07', 'Sales & Marketing',    'Sales Executive',    '2023-03-20', 'tetap',    7600000, 1500000, 'Mandiri', 0, true),
    (16, 'BRT-2020-0116', 'Galih Ramadhan',       'laki_laki', '1990-03-15', 'Sales & Marketing',    'Account Manager',    '2020-08-03', 'tetap',   14000000, 2000000, 'BCA',     2, true),
    (17, 'BRT-2023-0117', 'Putri Maharani',       'perempuan', '1998-12-12', 'Sales & Marketing',    'Digital Marketing',  '2023-09-11', 'tetap',    8500000, 1000000, 'BRI',     0, true),
    (18, 'BRT-2025-0118', 'Dimas Kurniawan',      'laki_laki', '2001-02-28', 'Sales & Marketing',    'Digital Marketing',  '2025-02-03', 'kontrak',  6800000,  750000, 'BNI',     0, true),
    (19, 'BRT-2017-0119', 'Wahyu Hidayatullah',   'laki_laki', '1983-10-30', 'Operasional',          'Operations Manager', '2017-04-10', 'tetap',   21000000, 3000000, 'Mandiri', 3, true),
    (20, 'BRT-2021-0120', 'Siti Aminah',          'perempuan', '1993-06-06', 'Operasional',          'Staf Administrasi',  '2021-02-01', 'tetap',    6500000,  750000, 'BRI',     2, true),
    (21, 'BRT-2019-0121', 'Joko Susilo',          'laki_laki', '1988-08-18', 'Operasional',          'Staf Logistik',      '2019-12-02', 'tetap',    6800000,  750000, 'BRI',     2, true),
    (22, 'BRT-2024-0122', 'Rina Kartika',         'perempuan', '2000-01-14', 'Operasional',          'Staf Administrasi',  '2024-06-03', 'kontrak',  5800000,  500000, 'BCA',     0, true),
    (23, 'BRT-2022-0123', 'Arif Rahman Hakim',    'laki_laki', '1994-11-11', 'Operasional',          'Staf Logistik',      '2022-07-18', 'tetap',    6500000,  750000, 'Mandiri', 1, false),
    (24, 'BRT-2019-0124', 'Maya Sari Puspita',    'perempuan', '1987-05-03', 'Produk & Desain',      'Product Manager',    '2019-03-04', 'tetap',   22000000, 3000000, 'BCA',     2, true),
    (25, 'BRT-2022-0125', 'Kevin Santoso',        'laki_laki', '1996-09-21', 'Produk & Desain',      'UI/UX Designer',     '2022-05-09', 'tetap',   11000000, 1250000, 'BNI',     0, true),
    (26, 'BRT-2023-0126', 'Anisa Fitriani',       'perempuan', '1998-02-16', 'Produk & Desain',      'UI/UX Designer',     '2023-11-06', 'tetap',   10000000, 1250000, 'Mandiri', 0, true),
    (27, 'BRT-2021-0127', 'Reza Mahendra',        'laki_laki', '1992-04-29', 'Produk & Desain',      'QA Engineer',        '2021-11-15', 'tetap',   11500000, 1250000, 'BCA',     1, true),
    (28, 'BRT-2024-0128', 'Dewi Kusumawati',      'perempuan', '1999-08-08', 'Produk & Desain',      'QA Engineer',        '2024-10-07', 'kontrak',  9000000, 1000000, 'BRI',     0, true)
  ) as e(no, nip, full_name, gender, birth_date, division_name, position_name, join_date, emp_status,
         base, allowance, bank, dependents, active);

  -- Akun auth tanpa kata sandi yang bisa dipakai login (hanya pemilik data, bukan akun demo).
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', e.id, 'authenticated', 'authenticated', e.email,
         extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
         '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('full_name', e.full_name),
         now(), now(), '', '', '', ''
  from _demo_emp e
  where not exists (select 1 from auth.users u where u.id = e.id or lower(u.email) = e.email);

  insert into public.profiles (id, nip, full_name, email, phone, gender, birth_date, role,
                               division_id, position_id, office_id, shift_id, join_date, employment_status, is_active)
  select e.id, e.nip, e.full_name, e.email, e.phone, e.gender::public.gender_type, e.birth_date::date, 'employee',
         d.id, p.id, o.id, s.id, e.join_date::date, e.emp_status::public.employment_status, e.active
  from _demo_emp e
  join auth.users u on u.id = e.id
  join public.divisions d on d.name = e.division_name
  join public.positions p on p.name = e.position_name and p.division_id = d.id
  cross join (select id from public.offices where name = 'Head Office Jakarta') o
  cross join (select id from public.shifts where name = 'Reguler') s
  on conflict do nothing;
  get diagnostics n_emp = row_count;

  -- Gaji (rekening hanya 4 digit terakhir) + BPJS + asuransi kumpulan untuk karyawan tetap.
  insert into public.salary_components (employee_id, base_salary, fixed_allowance, bank_name, bank_account_last4,
                                        bpjs_kes_no, bpjs_tk_no, effective_from, note)
  select e.id, e.base, e.allowance, e.bank, lpad(((e.no * 7919) % 10000)::text, 4, '0'),
         '0001' || lpad(((e.no * 104729) % 1000000000)::text, 9, '0'),
         '23' || lpad(((e.no * 7907) % 1000000000)::text, 9, '0'),
         e.join_date::date, 'Gaji awal (data demo)'
  from _demo_emp e
  join public.profiles p on p.id = e.id
  where not exists (select 1 from public.salary_components c where c.employee_id = e.id);

  insert into public.salary_components (employee_id, base_salary, fixed_allowance, bank_name, bank_account_last4,
                                        bpjs_kes_no, bpjs_tk_no, effective_from, note)
  select p.id, 12000000, 3850000, 'BCA', '8821', '0002938172918', '21908237192', coalesce(p.join_date, current_date), 'Gaji awal (data demo)'
  from public.profiles p
  where p.email = 'demo.karyawan@bluerose.test'
    and not exists (select 1 from public.salary_components c where c.employee_id = p.id);

  insert into public.benefits (employee_id, provider, program, card_no, class, dependents, status)
  select e.id, b.provider, b.program, b.card_no, b.class, b.dependents, case when e.active then 'aktif' else 'nonaktif' end
  from _demo_emp e
  join public.profiles p on p.id = e.id
  cross join lateral (values
    ('BPJS Kesehatan', 'JKN', '0001' || lpad(((e.no * 104729) % 1000000000)::text, 9, '0'),
     case when e.base >= 10000000 then 'Kelas 1' else 'Kelas 2' end, e.dependents),
    ('BPJS Ketenagakerjaan', 'JHT, JKK, JKM, JP', '23' || lpad(((e.no * 7907) % 1000000000)::text, 9, '0'), null, 0),
    ('Asuransi Kesehatan Kumpulan', 'Rawat inap & rawat jalan', 'AKK-' || lpad((e.no * 37)::text, 5, '0'),
     case when e.base >= 15000000 then 'Plan A' else 'Plan B' end, e.dependents)
  ) as b(provider, program, card_no, class, dependents)
  where (b.provider <> 'Asuransi Kesehatan Kumpulan' or e.emp_status = 'tetap')
    and not exists (select 1 from public.benefits x where x.employee_id = e.id);

  insert into public.benefits (employee_id, provider, program, card_no, class, dependents, status)
  select p.id, b.provider, b.program, b.card_no, b.class, b.dependents, 'aktif'
  from public.profiles p
  cross join (values
    ('BPJS Kesehatan',              'JKN',                      '0002938172918', 'Kelas 1', 2),
    ('BPJS Ketenagakerjaan',        'JHT, JKK, JKM, JP',        '21908237192',   null,      0),
    ('Asuransi Kesehatan Kumpulan', 'Rawat inap & rawat jalan', 'AKK-0099214',   'Plan B',  2)
  ) as b(provider, program, card_no, class, dependents)
  where p.email = 'demo.karyawan@bluerose.test'
    and not exists (select 1 from public.benefits x where x.employee_id = p.id);

  -- -------------------------------------------------------------------
  -- 3. Langkah berikut memakai RPC asli sebagai HR demo.
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_hr, 'role', 'authenticated')::text, true);

  -- -------------------------------------------------------------------
  -- 4. Pengajuan di semua status. Tanggal relatif terhadap hari ini, digeser ke hari kerja.
  --    Disetujui/ditolak lewat review_request (saldo cuti, presensi cuti, notifikasi ikut jalan).
  -- -------------------------------------------------------------------
  for r in
    with spec(nip, kind, type_code, from_today, days, reason, destination, target, note) as (values
      ('BRT-2022-0101', 'leave', 'tahunan',     -40, 3, 'Liburan keluarga ke Yogyakarta',          null,       'disetujui',  null),
      ('BRT-2019-0110', 'leave', 'sakit',       -33, 2, 'Demam dan flu, istirahat sesuai saran dokter', null, 'disetujui', 'Semoga lekas sembuh.'),
      ('BRT-2022-0114', 'dinas', null,          -26, 2, 'Presentasi produk ke calon klien',        'Surabaya', 'disetujui',  null),
      ('BRT-2022-0125', 'wfh',   null,          -20, 1, 'Menunggu teknisi perbaikan listrik rumah', null,      'disetujui',  null),
      ('BRT-2020-0106', 'leave', 'izin_khusus', -14, 1, 'Menghadiri pernikahan saudara kandung',   null,       'disetujui',  null),
      ('BRT-2023-0115', 'leave', 'tahunan',     -12, 2, 'Urusan keluarga di luar kota',            null,       'ditolak',    'Bertepatan dengan target penjualan akhir bulan. Mohon ajukan di minggu berikutnya.'),
      ('BRT-2019-0121', 'wfh',   null,           -9, 1, 'Anak sakit di rumah',                     null,       'ditolak',    'Tugas gudang tidak bisa dikerjakan dari rumah. Silakan ajukan izin khusus.'),
      ('BRT-2021-0112', 'leave', 'tahunan',      -6, 1, 'Mengurus dokumen kependudukan',           null,       'dibatalkan', null),
      ('BRT-2018-0109', 'leave', 'tahunan',      21, 3, 'Cuti akhir tahun bersama keluarga',       null,       'disetujui',  null),
      ('BRT-2021-0103', 'leave', 'tahunan',       7, 3, 'Pulang kampung ke Malang',                null,       'menunggu',   null),
      ('BRT-2023-0117', 'wfh',   null,            3, 1, 'Renovasi rumah, perlu mengawasi tukang',  null,       'menunggu',   null),
      ('BRT-2020-0116', 'dinas', null,            8, 2, 'Kunjungan rutin ke klien korporat',       'Bandung',  'menunggu',   null),
      ('BRT-2023-0126', 'leave', 'sakit',         0, 1, 'Sakit gigi, jadwal kontrol ke dokter gigi', null,     'menunggu',   null),
      ('BRT-2019-0124', 'leave', 'izin_khusus',  35, 1, 'Wisuda adik',                             null,       'menunggu',   null),
      ('BRT-2024-0104', 'leave', 'tahunan',      14, 2, 'Liburan',                                 null,       'dibatalkan', null),
      ('BRT-2021-0127', 'dinas', null,           -3, 1, 'Uji penerimaan aplikasi di kantor klien',  'Tangerang', 'disetujui', null)
    ),
    dated as (
      select s.*, e.id as employee_id,
             (select g::date from generate_series((v_today + s.from_today)::timestamp, (v_today + s.from_today + 10)::timestamp, interval '1 day') g
              where extract(isodow from g) < 6 and not exists (select 1 from public.holidays h where h.date = g::date)
              order by g limit 1) as start_date
      from spec s join _demo_emp e on e.nip = s.nip
      join public.profiles p on p.id = e.id
    )
    select d.*,
           (select g::date from generate_series(d.start_date::timestamp, (d.start_date + 20)::timestamp, interval '1 day') g
            where extract(isodow from g) < 6 and not exists (select 1 from public.holidays h where h.date = g::date)
            order by g offset d.days - 1 limit 1) as end_date
    from dated d
    where not exists (select 1 from public.requests q where q.employee_id = d.employee_id and q.reason = d.reason)
  loop
    insert into public.requests (employee_id, kind, leave_type_id, start_date, end_date, working_days, reason, destination, status, created_at)
    values (r.employee_id, r.kind, (select id from public.leave_types where code = r.type_code), r.start_date, r.end_date,
            public.working_days(r.start_date, r.end_date), r.reason, r.destination, 'menunggu',
            least(now(), (r.start_date - 4)::timestamp at time zone 'Asia/Jakarta'))
    returning id into v_run;

    if r.target in ('disetujui', 'ditolak') then
      perform public.review_request(v_run, r.target, r.note);
    elsif r.target = 'dibatalkan' then
      update public.requests set status = 'dibatalkan' where id = v_run;
    end if;
  end loop;
  select count(*) into n_req from public.requests q join _demo_emp e on e.id = q.employee_id;

  -- Notifikasi "pengajuan baru" untuk pengajuan yang sudah diproses dianggap sudah dibaca HR.
  update public.notifications n set read_at = now()
  where n.type = 'request_new' and n.read_at is null and n.created_at >= v_t0
    and exists (
      select 1 from public.requests q join public.profiles p on p.id = q.employee_id
      where q.status <> 'menunggu'
        and n.title = format('%s mengajukan %s', p.full_name, public._request_label(q.kind, q.leave_type_id)));

  -- -------------------------------------------------------------------
  -- 5. Riwayat absen: awal bulan lalu s.d. kemarin, hari kerja, karyawan aktif ber-role employee.
  --    Pola deterministik per (karyawan, tanggal): ±2,5% alpa, ±11% terlambat, ±6% pulang cepat.
  --    Hari dengan izin WFH/dinas disetujui tercatat di luar radius (mode wfh/dinas).
  --    Tidak menimpa absen asli, cuti/sakit/izin, atau baris selain "alpa tanpa absen masuk".
  -- -------------------------------------------------------------------
  insert into public.attendances as a (
    employee_id, date, clock_in_at, clock_in_lat, clock_in_lng, clock_in_distance_m, clock_in_accuracy_m,
    clock_out_at, clock_out_lat, clock_out_lng, clock_out_distance_m, clock_out_accuracy_m, mode, status, late_minutes)
  select x.employee_id, x.d,
         case when st.status <> 'alpa' then (x.d + tm.t_in) at time zone 'Asia/Jakarta' end,
         case when st.status <> 'alpa' then round((x.latitude + loc.dlat)::numeric, 6) end,
         case when st.status <> 'alpa' then round((x.longitude + loc.dlng)::numeric, 6) end,
         case when st.status <> 'alpa' then loc.dist end,
         case when st.status <> 'alpa' then 5 + x.h % 26 end,
         case when st.status <> 'alpa' then (x.d + tm.t_out) at time zone 'Asia/Jakarta' end,
         case when st.status <> 'alpa' then round((x.latitude + loc.dlat)::numeric, 6) end,
         case when st.status <> 'alpa' then round((x.longitude + loc.dlng)::numeric, 6) end,
         case when st.status <> 'alpa' then loc.dist end,
         case when st.status <> 'alpa' then 6 + x.h % 23 end,
         case when st.status <> 'alpa' then coalesce(x.remote, 'office') end,
         case when st.status = 'alpa' then 'alpa'
              when tm.t_out < x.end_time then 'pulang_cepat'
              else st.status end,
         case when st.status = 'terlambat' then floor(extract(epoch from (tm.t_in - x.start_time)) / 60)::integer else 0 end
  from (
    select p.id as employee_id, g::date as d,
           abs(hashtext(p.id::text || g::date::text)::bigint) % 1000 as h,
           s.start_time, s.end_time, s.late_tolerance_min, o.latitude::double precision as latitude,
           o.longitude::double precision as longitude, o.radius_m,
           (select q.kind from public.requests q
            where q.employee_id = p.id and q.status = 'disetujui' and q.kind in ('wfh', 'dinas')
              and g::date between q.start_date and q.end_date limit 1) as remote
    from public.profiles p
    join public.shifts s on s.id = p.shift_id
    join public.offices o on o.id = p.office_id
    cross join generate_series(v_from::timestamp, (v_today - 1)::timestamp, interval '1 day') g
    where p.role = 'employee' and p.is_active
      and (p.join_date is null or p.join_date <= g::date)
      and extract(isodow from g) < 6
      and not exists (select 1 from public.holidays hd where hd.date = g::date)
  ) x
  cross join lateral (
    select case when x.remote is null and x.h < 25 then 'alpa'
                when x.h < 140 then 'terlambat'
                else 'tepat_waktu' end as status
  ) st
  cross join lateral (
    select case when st.status = 'terlambat'
                  then x.start_time + make_interval(mins => x.late_tolerance_min + 1 + (x.h % 50)::integer)
                else x.start_time - interval '50 minutes' + make_interval(mins => (x.h % (50 + x.late_tolerance_min))::integer) end as t_in,
           case when x.h % 17 = 0
                  then x.end_time - make_interval(mins => 15 + (x.h % 75)::integer)
                else x.end_time + make_interval(mins => (x.h % 80)::integer) end as t_out
  ) tm
  cross join lateral (
    select case when x.remote is null then 5 + (x.h % greatest(x.radius_m - 10, 10))::integer
                else 2500 + ((x.h * 37) % 18000)::integer end as dist,
           case when x.remote is null then ((x.h % 11) - 5) * 0.00004 else 0.02 + (x.h % 9) * 0.004 end as dlat,
           case when x.remote is null then ((x.h % 7) - 3) * 0.00004 else 0.015 + (x.h % 5) * 0.004 end as dlng
  ) loc
  on conflict (employee_id, date) do update set
    clock_in_at = excluded.clock_in_at, clock_in_lat = excluded.clock_in_lat, clock_in_lng = excluded.clock_in_lng,
    clock_in_distance_m = excluded.clock_in_distance_m, clock_in_accuracy_m = excluded.clock_in_accuracy_m,
    clock_out_at = excluded.clock_out_at, clock_out_lat = excluded.clock_out_lat, clock_out_lng = excluded.clock_out_lng,
    clock_out_distance_m = excluded.clock_out_distance_m, clock_out_accuracy_m = excluded.clock_out_accuracy_m,
    mode = excluded.mode, status = excluded.status, late_minutes = excluded.late_minutes
  where a.status = 'alpa' and a.clock_in_at is null;
  get diagnostics n_att = row_count;

  -- -------------------------------------------------------------------
  -- 6. Payroll: bulan lalu sampai Dibayar, lalu satu run Draft (bulan ini, atau bulan depan
  --    bila payroll bulan ini sudah diproses dan belum ada run draft lain).
  -- -------------------------------------------------------------------
  v_period := to_char(v_from, 'YYYY-MM');
  if not exists (select 1 from public.payroll_runs where period = v_period) then
    perform public.create_payroll_run(v_period);
    select id into v_run from public.payroll_runs where period = v_period;
    perform public.finalize_payroll_run(v_run);
    perform public.mark_payroll_paid(v_run);
  end if;

  v_period := to_char(v_today, 'YYYY-MM');
  if not exists (select 1 from public.payroll_runs where period = v_period) then
    perform public.create_payroll_run(v_period);
  elsif not exists (select 1 from public.payroll_runs where status = 'draft') then
    v_period := to_char(v_today + interval '1 month', 'YYYY-MM');
    if not exists (select 1 from public.payroll_runs where period = v_period) then
      perform public.create_payroll_run(v_period);
    end if;
  end if;

  -- -------------------------------------------------------------------
  -- 7. KPI: template valid untuk setiap jabatan yang punya karyawan aktif, lalu satu periode aktif.
  -- -------------------------------------------------------------------
  for r in
    select ps.id, ps.name from public.positions ps
    where exists (select 1 from public.profiles p where p.position_id = ps.id and p.is_active)
      and not coalesce((select public.template_is_valid(t.id) from public.kpi_templates t
                        where t.position_id = ps.id and t.is_active), false)
  loop
    perform public.hr_save_kpi_template(r.id, 'KPI ' || r.name, case
      when r.name like '%Manager' and r.name <> 'Account Manager' then '[
        {"name": "Pencapaian target divisi", "description": "Realisasi target utama divisi dibanding rencana kuartal.", "weight": 35, "target": "≥ 100% target"},
        {"name": "Pengembangan tim", "description": "Sesi coaching dan rencana pengembangan anggota tim.", "weight": 25, "target": "≥ 2 sesi coaching per bulan"},
        {"name": "Efisiensi anggaran", "description": "Realisasi biaya operasional dibanding anggaran.", "weight": 20, "target": "≤ 100% anggaran"},
        {"name": "Kepuasan pemangku kepentingan", "description": "Survei kepuasan divisi lain terhadap layanan divisi.", "weight": 20, "target": "Skor ≥ 4 dari 5"}]'::jsonb
      when r.name in ('Backend Developer', 'Frontend Developer') then '[
        {"name": "Penyelesaian sprint", "description": "Persentase story point yang selesai sesuai komitmen sprint.", "weight": 35, "target": "≥ 90% story point"},
        {"name": "Kualitas kode", "description": "Bug kritis yang lolos ke production selama kuartal.", "weight": 25, "target": "≤ 2 bug kritis"},
        {"name": "Keandalan layanan", "description": "Uptime layanan yang menjadi tanggung jawab tim.", "weight": 25, "target": "≥ 99,5% uptime"},
        {"name": "Dokumentasi teknis", "description": "API dan keputusan teknis terdokumentasi.", "weight": 15, "target": "100% endpoint baru"}]'::jsonb
      when r.name = 'IT Support' then '[
        {"name": "Waktu respons tiket", "description": "Rata-rata waktu respons pertama tiket helpdesk.", "weight": 40, "target": "≤ 2 jam kerja"},
        {"name": "Tiket selesai sesuai SLA", "description": "Tiket yang ditutup dalam batas SLA.", "weight": 35, "target": "≥ 95% tiket"},
        {"name": "Kepuasan pengguna", "description": "Skor survei setelah tiket ditutup.", "weight": 25, "target": "Skor ≥ 4 dari 5"}]'::jsonb
      when r.name = 'QA Engineer' then '[
        {"name": "Cakupan pengujian", "description": "Skenario uji yang dijalankan per rilis.", "weight": 35, "target": "≥ 80% skenario"},
        {"name": "Bug lolos ke production", "description": "Bug kritis yang ditemukan pengguna setelah rilis.", "weight": 35, "target": "≤ 2 bug kritis"},
        {"name": "Otomasi tes", "description": "Skenario regresi baru yang diotomasi.", "weight": 30, "target": "≥ 10 skenario baru"}]'::jsonb
      when r.name = 'UI/UX Designer' then '[
        {"name": "Kualitas desain", "description": "Desain yang lolos review tanpa revisi besar.", "weight": 35, "target": "≥ 90% desain"},
        {"name": "Riset pengguna", "description": "Wawancara atau uji kegunaan dengan pengguna.", "weight": 25, "target": "≥ 5 sesi per kuartal"},
        {"name": "Ketepatan handoff", "description": "Desain siap dikembangkan sebelum sprint dimulai.", "weight": 25, "target": "100% tepat waktu"},
        {"name": "Kontribusi sistem desain", "description": "Komponen baru atau perbaikan di sistem desain.", "weight": 15, "target": "≥ 3 komponen"}]'::jsonb
      when r.name = 'Account Manager' then '[
        {"name": "Retensi klien", "description": "Klien yang memperpanjang kontrak.", "weight": 40, "target": "≥ 95% klien"},
        {"name": "Nilai upsell", "description": "Nilai kontrak tambahan dari klien yang ada.", "weight": 30, "target": "≥ Rp 500 juta"},
        {"name": "Kepuasan klien", "description": "Skor survei kepuasan klien kuartalan.", "weight": 30, "target": "Skor ≥ 4 dari 5"}]'::jsonb
      when r.name = 'Digital Marketing' then '[
        {"name": "Leads berkualitas", "description": "Marketing qualified lead dari kanal digital.", "weight": 40, "target": "≥ 300 MQL"},
        {"name": "Return on ad spend", "description": "Pendapatan dibanding biaya iklan.", "weight": 30, "target": "≥ 3x"},
        {"name": "Pertumbuhan audiens", "description": "Pertumbuhan pengikut dan pelanggan newsletter.", "weight": 30, "target": "≥ 10% per kuartal"}]'::jsonb
      else '[
        {"name": "Kualitas pekerjaan", "description": "Hasil kerja yang diterima tanpa revisi besar.", "weight": 40, "target": "≤ 2 revisi per bulan"},
        {"name": "Ketepatan waktu", "description": "Tugas yang selesai sebelum tenggat.", "weight": 30, "target": "≥ 95% tugas"},
        {"name": "Kolaborasi", "description": "Penilaian rekan kerja terhadap kerja sama tim.", "weight": 15, "target": "Nilai rekan ≥ 4 dari 5"},
        {"name": "Inisiatif perbaikan", "description": "Usulan perbaikan proses yang dijalankan.", "weight": 15, "target": "≥ 1 usulan per kuartal"}]'::jsonb
    end);
  end loop;

  select id into v_kpi from public.kpi_periods where status = 'aktif';
  if v_kpi is null then
    v_year    := extract(year from v_today)::integer;
    v_quarter := (extract(month from v_today)::integer - 1) / 3 + 1;
    v_qend    := (make_date(v_year, (v_quarter - 1) * 3 + 1, 1) + interval '3 months' - interval '1 day')::date;
    select id into v_kpi from public.kpi_periods where year = v_year and quarter = v_quarter and status = 'draft';
    if v_kpi is null and not exists (select 1 from public.kpi_periods where year = v_year and quarter = v_quarter) then
      v_kpi := (public.hr_create_kpi_period(v_year, v_quarter, v_qend + 14)).id;
    end if;
    if v_kpi is not null then
      perform public.hr_activate_kpi_period(v_kpi);   -- trigger membuat review draft untuk karyawan aktif
    end if;
  else
    perform public._kpi_create_reviews(v_kpi);         -- karyawan baru masuk periode yang sedang berjalan
  end if;

  -- Sekitar 40% penilaian karyawan fiktif final, 20% draft, sisanya belum dinilai.
  if v_kpi is not null then
    for r in
      select k.id, abs(hashtext(k.id::text)::bigint) % 10 as h
      from public.kpi_reviews k join _demo_emp e on e.id = k.employee_id
      where k.period_id = v_kpi and k.status = 'draft' and k.reviewer_id is null
    loop
      continue when r.h >= 6;
      select jsonb_agg(jsonb_build_object('id', s.id, 'score', 62 + abs(hashtext(s.id::text)::bigint) % 37) order by s.sort_order)
        into v_scores
      from public.kpi_scores s where s.review_id = r.id;
      perform public.save_kpi_scores(r.id, v_scores, (array[
        'Konsisten memenuhi target kuartal. Pertahankan kualitas kerja.',
        'Kontribusi baik di proyek lintas tim. Tingkatkan ketepatan waktu laporan.',
        'Perlu lebih proaktif mengomunikasikan kendala sejak awal.'])[1 + r.h % 3]);
      if r.h < 4 then
        perform public.finalize_kpi_review(r.id);
      end if;
    end loop;
  end if;
  select count(*) into n_rev from public.kpi_reviews where period_id = v_kpi;

  perform set_config('request.jwt.claims', '', true);

  raise notice 'SEED DEMO SELESAI: % karyawan fiktif baru, % baris absen ditulis, % pengajuan karyawan fiktif, % penilaian di periode KPI aktif.',
    n_emp, n_att, n_req, coalesce(n_rev, 0);
end;
$seed$;

-- Ringkasan
select
  (select count(*) from public.profiles where is_active)                     as karyawan_aktif,
  (select count(distinct division_id) from public.profiles where is_active)  as divisi_terisi,
  (select count(*) from public.attendances)                                  as baris_absen,
  (select string_agg(status || ' ' || n, ', ') from (select status, count(*) n from public.requests group by status order by status) s) as pengajuan,
  (select string_agg(period || ' ' || status, ', ' order by period) from public.payroll_runs) as payroll,
  (select name || ' (' || status || ')' from public.kpi_periods where status = 'aktif') as periode_kpi_aktif;
