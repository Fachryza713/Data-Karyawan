-- =====================================================================
-- HRIS Blue Rose Tech — audit Row Level Security
--
-- Membuktikan, sebagai karyawan A (role employee):
--   1. tidak bisa MEMBACA data karyawan B di setiap tabel milik karyawan;
--   2. tidak bisa MENGUBAH atau MENGHAPUS data karyawan B (dan tidak bisa menghapus apa pun);
--   3. tidak bisa INSERT langsung ke attendances, payslips, dan tabel lain yang hanya
--      boleh ditulis HR / fungsi server; tidak bisa menaikkan role sendiri;
--   4. tidak bisa memanggil RPC khusus HR maupun fungsi internal;
--   1b. tidak bisa membaca satu baris pun dari tabel KPI (kpi_templates, kpi_indicators,
--      kpi_periods, kpi_reviews, kpi_scores), termasuk penilaian final miliknya sendiri;
--      tidak menerima notifikasi kpi_final; my_dashboard() tanpa field KPI;
--   5. tetap bisa membaca datanya sendiri di luar KPI (kontrol positif, agar tes tidak
--      lolos karena policy yang menolak semuanya);
--   5b. sebagai HR: tetap bisa membaca semua tabel KPI, hr_kpi_positions(), dan kartu
--      KPI di hr_dashboard();
--   6. anon tidak bisa membaca tabel apa pun, dan setiap RPC yang terbuka untuk
--      authenticated sudah terdaftar di daftar audit di bawah.
--
-- Cara pakai (cloud atau lokal, butuh minimal 2 karyawan aktif ber-role employee dan
-- 1 HR aktif):
--   npx supabase db query --remote -f supabase/tests/rls.sql
--   (atau tempel di SQL Editor / psql)
--
-- Skrip membuat data uji sendiri lalu SELALU membatalkan transaksi dengan RAISE di akhir.
-- Hasil ada di pesan error:  "RLS AUDIT LULUS: n/n pemeriksaan"  atau  "RLS AUDIT GAGAL: ..."
-- Tidak ada data yang tersimpan.
-- =====================================================================
do $rls$
declare
  a        uuid;   -- karyawan penguji
  b        uuid;   -- karyawan korban
  v_hr     uuid;   -- HR untuk kontrol positif KPI
  v_run    uuid;
  v_period uuid;
  v_period2 uuid;
  v_tpl    uuid;
  v_rev_a  uuid;
  v_rev_a2 uuid;
  v_rev_b  uuid;
  v_type   uuid;
  r        record;
  n        bigint;
  v_role   text;
  total    integer := 0;
  fails    text[] := '{}';
  v_msg    text;
begin
  select id into a from public.profiles where role = 'employee' and is_active order by created_at, id limit 1;
  select id into b from public.profiles where role = 'employee' and is_active and id <> a order by created_at, id limit 1;
  if b is null then
    raise exception 'RLS AUDIT: butuh minimal 2 karyawan aktif ber-role employee (jalankan supabase/seed-demo.sql).';
  end if;
  select id into v_hr from public.profiles where role = 'hr' and is_active order by created_at, id limit 1;
  if v_hr is null then
    raise exception 'RLS AUDIT: butuh minimal 1 HR aktif (jalankan supabase/seed-demo.sql).';
  end if;
  select id into v_type from public.leave_types where code = 'tahunan';

  -- -------------------------------------------------------------------
  -- Data uji untuk A dan B (sebagai pemilik tabel, tanpa RLS). Tahun 2000 agar tidak
  -- bentrok dengan data asli; semuanya dibatalkan di akhir.
  -- -------------------------------------------------------------------
  insert into public.attendances (employee_id, date, status)
  values (a, '2000-01-03', 'alpa'), (b, '2000-01-03', 'alpa');
  insert into public.requests (employee_id, kind, start_date, end_date, working_days, reason, status)
  values (a, 'wfh', '2000-01-03', '2000-01-03', 1, 'uji RLS', 'menunggu'),
         (b, 'wfh', '2000-01-03', '2000-01-03', 1, 'uji RLS', 'menunggu');
  insert into public.leave_balances (employee_id, year, quota) values (a, 2000, 12), (b, 2000, 12);
  insert into public.benefits (employee_id, provider, status) values (a, 'Uji RLS', 'aktif'), (b, 'Uji RLS', 'aktif');
  insert into public.salary_components (employee_id, base_salary, bank_name, bank_account_last4, effective_from)
  values (a, 1000000, 'Bank Uji', '0001', '2000-01-01'), (b, 1000000, 'Bank Uji', '0002', '2000-01-01');
  insert into public.payroll_runs (period, status, finalized_at) values ('2000-01', 'final', now()) returning id into v_run;
  insert into public.payslips (run_id, employee_id, base_salary, gross, net)
  values (v_run, a, 1000000, 1000000, 1000000), (v_run, b, 1000000, 1000000, 1000000);
  insert into public.kpi_periods (name, year, quarter, start_date, end_date, deadline, status)
  values ('Uji RLS 2000', 2000, 1, '2000-01-01', '2000-03-31', '2000-03-31', 'selesai') returning id into v_period;
  insert into public.kpi_reviews (period_id, employee_id, final_score, grade, status, finalized_at)
  values (v_period, a, 80, 'B', 'final', now()) returning id into v_rev_a;
  insert into public.kpi_reviews (period_id, employee_id, final_score, grade, status, finalized_at)
  values (v_period, b, 80, 'B', 'final', now()) returning id into v_rev_b;
  insert into public.kpi_scores (review_id, name, weight, score)
  values (v_rev_a, 'Uji RLS', 100, 80), (v_rev_b, 'Uji RLS', 100, 80);
  -- Template nonaktif untuk jabatan A (policy lama "karyawan baca jabatannya" akan membukanya).
  insert into public.kpi_templates (position_id, name, is_active)
  values (coalesce((select position_id from public.profiles where id = a), (select id from public.positions limit 1)),
          'Uji RLS', false)
  returning id into v_tpl;
  insert into public.kpi_indicators (template_id, name, weight) values (v_tpl, 'Uji RLS', 100);
  -- Finalisasi review draft A lewat UPDATE agar trigger notify_kpi_final berjalan:
  -- karyawan tidak boleh menerima notifikasi kpi_final (diperiksa di bagian 1b).
  insert into public.kpi_periods (name, year, quarter, start_date, end_date, deadline, status)
  values ('Uji RLS 2000 Q4', 2000, 4, '2000-10-01', '2000-12-31', '2000-12-31', 'selesai') returning id into v_period2;
  insert into public.kpi_reviews (period_id, employee_id) values (v_period2, a) returning id into v_rev_a2;
  update public.kpi_reviews set status = 'final', final_score = 90, grade = 'A', finalized_at = now()
  where id = v_rev_a2;
  insert into public.notifications (user_id, type, title)
  values (a, 'payslip_published', 'Uji RLS'), (b, 'payslip_published', 'Uji RLS');
  insert into public.audit_logs (actor_id, action, table_name, record_id) values (b, 'update', 'uji_rls', b);

  -- ===================================================================
  -- Mulai sebagai karyawan A
  -- ===================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. Baca data B (harus 0 baris)
  for r in select * from (values
    ('profiles',          format('select count(*) from public.profiles where id = %L', b)),
    ('attendances',       format('select count(*) from public.attendances where employee_id = %L', b)),
    ('requests',          format('select count(*) from public.requests where employee_id = %L', b)),
    ('leave_balances',    format('select count(*) from public.leave_balances where employee_id = %L', b)),
    ('benefits',          format('select count(*) from public.benefits where employee_id = %L', b)),
    ('salary_components', format('select count(*) from public.salary_components where employee_id = %L', b)),
    ('payslips',          format('select count(*) from public.payslips where employee_id = %L', b)),
    ('kpi_reviews',       format('select count(*) from public.kpi_reviews where employee_id = %L', b)),
    ('kpi_scores',        format('select count(*) from public.kpi_scores where review_id = %L', v_rev_b)),
    ('notifications',     format('select count(*) from public.notifications where user_id = %L', b)),
    ('audit_logs',        'select count(*) from public.audit_logs'),
    ('payroll_settings',  'select count(*) from public.payroll_settings'),
    ('storage attachments', format('select count(*) from storage.objects where bucket_id = %L and coalesce((storage.foldername(name))[1], %L) <> %L', 'attachments', '', a::text)),
    ('storage avatars',     format('select count(*) from storage.objects where bucket_id = %L and coalesce((storage.foldername(name))[1], %L) <> %L', 'avatars', '', a::text))
  ) v(label, q) loop
    total := total + 1;
    begin
      execute r.q into n;
      if n <> 0 then fails := fails || format('BACA %s milik orang lain: %s baris terlihat', r.label, n); end if;
    exception when insufficient_privilege then null;  -- ditolak = aman
    end;
  end loop;

  -- 1b. KPI khusus HR: karyawan tidak membaca satu baris pun, termasuk miliknya sendiri
  for r in select * from (values
    ('kpi_templates',          'select count(*) from public.kpi_templates'),
    ('kpi_indicators',         'select count(*) from public.kpi_indicators'),
    ('kpi_periods',            'select count(*) from public.kpi_periods'),
    ('kpi_reviews',            'select count(*) from public.kpi_reviews'),
    ('kpi_scores',             'select count(*) from public.kpi_scores'),
    ('notifikasi kpi_final',   'select count(*) from public.notifications where type = ''kpi_final'''),
    ('field KPI my_dashboard', 'select count(*) from jsonb_object_keys(public.my_dashboard()) k where k like ''kpi%''')
  ) v(label, q) loop
    total := total + 1;
    begin
      execute r.q into n;
      if n <> 0 then fails := fails || format('KPI terlihat oleh karyawan, %s: %s baris', r.label, n); end if;
    exception
      when insufficient_privilege then null;
      when others then fails := fails || format('KPI %s: error tak terduga %s (%s)', r.label, sqlstate, left(sqlerrm, 80));
    end;
  end loop;

  -- 2. Ubah / hapus data B, dan hapus data apa pun (harus ditolak atau 0 baris)
  for r in select * from (values
    ('UBAH profiles B',          format('update public.profiles set full_name = full_name where id = %L', b)),
    ('UBAH attendances B',       format('update public.attendances set status = status where employee_id = %L', b)),
    ('UBAH requests B',          format('update public.requests set status = %L where employee_id = %L', 'disetujui', b)),
    ('UBAH leave_balances B',    format('update public.leave_balances set used = used + 1 where employee_id = %L', b)),
    ('UBAH benefits B',          format('update public.benefits set status = %L where employee_id = %L', 'nonaktif', b)),
    ('UBAH salary_components B', format('update public.salary_components set base_salary = 1 where employee_id = %L', b)),
    ('UBAH payslips B',          format('update public.payslips set net = 1 where employee_id = %L', b)),
    ('UBAH kpi_reviews B',       format('update public.kpi_reviews set note = %L where employee_id = %L', 'x', b)),
    ('UBAH kpi_scores B',        format('update public.kpi_scores set score = 1 where review_id = %L', v_rev_b)),
    ('UBAH notifications B',     format('update public.notifications set read_at = now() where user_id = %L', b)),
    ('UBAH audit_logs',          'update public.audit_logs set diff = ''{}''::jsonb'),
    ('UBAH payslips sendiri',    format('update public.payslips set net = net + 1 where employee_id = %L', a)),
    ('UBAH attendances sendiri', format('update public.attendances set status = %L where employee_id = %L', 'tepat_waktu', a)),
    ('UBAH requests sendiri',    format('update public.requests set status = %L where employee_id = %L', 'disetujui', a)),
    ('UBAH saldo cuti sendiri',  format('update public.leave_balances set quota = 99 where employee_id = %L', a)),
    ('UBAH gaji sendiri',        format('update public.salary_components set base_salary = 99999999 where employee_id = %L', a)),
    ('UBAH skor KPI sendiri',    format('update public.kpi_reviews set final_score = 100, grade = %L where employee_id = %L', 'A', a)),
    ('UBAH role sendiri -> hr',  format('update public.profiles set role = %L where id = %L', 'hr', a)),
    ('UBAH jabatan/aktif sendiri', format('update public.profiles set is_active = true, position_id = position_id where id = %L', a)),
    ('UBAH master divisi',       'update public.divisions set name = name'),
    ('UBAH setting payroll',     'update public.payroll_settings set value = value'),
    ('UBAH run payroll',         format('update public.payroll_runs set status = %L where id = %L', 'paid', v_run)),
    ('HAPUS profiles',           format('delete from public.profiles where id = %L', b)),
    ('HAPUS attendances',        format('delete from public.attendances where employee_id in (%L, %L)', a, b)),
    ('HAPUS requests',           format('delete from public.requests where employee_id in (%L, %L)', a, b)),
    ('HAPUS payslips',           format('delete from public.payslips where run_id = %L', v_run)),
    ('HAPUS notifications',      format('delete from public.notifications where user_id in (%L, %L)', a, b)),
    ('HAPUS kpi_reviews',        format('delete from public.kpi_reviews where period_id = %L', v_period)),
    ('HAPUS benefits',           format('delete from public.benefits where employee_id in (%L, %L)', a, b)),
    ('HAPUS leave_balances',     format('delete from public.leave_balances where employee_id in (%L, %L)', a, b))
  ) v(label, q) loop
    total := total + 1;
    begin
      execute r.q;
      get diagnostics n = row_count;
      if n <> 0 then fails := fails || format('%s: %s baris berubah', r.label, n); end if;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- 3. INSERT langsung (harus ditolak dengan 42501)
  for r in select * from (values
    ('INSERT attendances sendiri', format('insert into public.attendances (employee_id, date, status, clock_in_at, mode) values (%L, %L, %L, now(), %L)', a, '2000-01-04', 'tepat_waktu', 'office')),
    ('INSERT attendances B',       format('insert into public.attendances (employee_id, date, status) values (%L, %L, %L)', b, '2000-01-04', 'alpa')),
    ('INSERT payslips sendiri',    format('insert into public.payslips (run_id, employee_id, base_salary, gross, net) values (%L, %L, 1, 1, 99999999)', v_run, a)),
    ('INSERT requests langsung',   format('insert into public.requests (employee_id, kind, start_date, end_date, working_days, reason, status) values (%L, %L, %L, %L, 1, %L, %L)', a, 'wfh', '2000-01-05', '2000-01-05', 'x', 'disetujui')),
    ('INSERT leave_balances',      format('insert into public.leave_balances (employee_id, year, quota) values (%L, 2001, 99)', a)),
    ('INSERT benefits',            format('insert into public.benefits (employee_id, provider) values (%L, %L)', a, 'x')),
    ('INSERT salary_components',   format('insert into public.salary_components (employee_id, base_salary, bank_name, bank_account_last4, effective_from) values (%L, 99999999, %L, %L, %L)', a, 'x', '0000', '2000-02-01')),
    ('INSERT notifications B',     format('insert into public.notifications (user_id, type, title) values (%L, %L, %L)', b, 'kpi_final', 'palsu')),
    ('INSERT kpi_reviews',         format('insert into public.kpi_reviews (period_id, employee_id) values (%L, %L)', v_period, a)),
    ('INSERT kpi_scores',          format('insert into public.kpi_scores (review_id, name, weight, score) values (%L, %L, 1, 100)', v_rev_a, 'x')),
    ('INSERT audit_logs',          format('insert into public.audit_logs (actor_id, action, table_name) values (%L, %L, %L)', a, 'insert', 'x')),
    ('INSERT profiles',            'insert into public.profiles (id, full_name, email) values (gen_random_uuid(), ''x'', ''x@uji.test'')'),
    ('INSERT payroll_runs',        'insert into public.payroll_runs (period) values (''2000-02'')'),
    ('INSERT payroll_settings',    'insert into public.payroll_settings (key, value, effective_from) values (''uji'', 1, ''2000-01-01'')'),
    ('INSERT divisions',           'insert into public.divisions (name) values (''Uji RLS'')'),
    ('INSERT positions',           format('insert into public.positions (name, division_id) select %L, id from public.divisions limit 1', 'Uji RLS')),
    ('INSERT offices',             'insert into public.offices (name, latitude, longitude, radius_m) values (''Uji'', 0, 0, 100)'),
    ('INSERT shifts',              'insert into public.shifts (name, start_time, end_time) values (''Uji'', ''08:00'', ''17:00'')'),
    ('INSERT holidays',            'insert into public.holidays (date, name) values (''2000-01-07'', ''Uji'')'),
    ('INSERT leave_types',         'insert into public.leave_types (code, name) values (''uji_rls'', ''Uji'')'),
    ('INSERT kpi_templates',       format('insert into public.kpi_templates (position_id, name) select position_id, %L from public.profiles where id = %L', 'x', a)),
    ('INSERT kpi_periods',         'insert into public.kpi_periods (name, year, quarter, start_date, end_date, deadline) values (''x'', 2000, 2, ''2000-04-01'', ''2000-06-30'', ''2000-06-30'')')
  ) v(label, q) loop
    total := total + 1;
    begin
      execute r.q;
      fails := fails || format('%s: berhasil, seharusnya ditolak', r.label);
    exception
      when insufficient_privilege then null;
      when others then fails := fails || format('%s: ditolak dengan error tak terduga %s (%s)', r.label, sqlstate, left(sqlerrm, 80));
    end;
  end loop;

  -- Role tidak boleh berubah walau UPDATE di atas tidak error
  select role::text into v_role from public.profiles where id = a;
  total := total + 1;
  if v_role is distinct from 'employee' then fails := fails || format('Role A berubah menjadi %s', v_role); end if;

  -- 4. RPC khusus HR & fungsi internal (harus 42501)
  for r in select * from (values
    ('hr_dashboard',               'select public.hr_dashboard()'),
    ('hr_monthly_report',          'select * from public.hr_monthly_report(null)'),
    ('hr_attendance_log',          'select * from public.hr_attendance_log(current_date, current_date)'),
    ('hr_attendance_summary',      'select * from public.hr_attendance_summary(current_date)'),
    ('hr_payroll_runs',            'select * from public.hr_payroll_runs()'),
    ('hr_kpi_positions',           'select * from public.hr_kpi_positions()'),
    ('hr_change_salary',           format('select public.hr_change_salary(%L, ''{"base_salary": 99999999}''::jsonb)', a)),
    ('hr_create_employee',         'select public.hr_create_employee(gen_random_uuid(), ''{}''::jsonb)'),
    ('hr_delete_holiday',          'select public.hr_delete_holiday(gen_random_uuid())'),
    ('hr_delete_office',           'select public.hr_delete_office(gen_random_uuid())'),
    ('hr_delete_shift',            'select public.hr_delete_shift(gen_random_uuid())'),
    ('hr_save_kpi_template',       'select public.hr_save_kpi_template(gen_random_uuid(), ''x'', ''[]''::jsonb)'),
    ('hr_create_kpi_period',       'select public.hr_create_kpi_period(2000, 3, ''2000-09-30'')'),
    ('hr_set_kpi_period_deadline', format('select public.hr_set_kpi_period_deadline(%L, ''2000-03-31'')', v_period)),
    ('hr_activate_kpi_period',     format('select public.hr_activate_kpi_period(%L)', v_period)),
    ('hr_close_kpi_period',        format('select public.hr_close_kpi_period(%L)', v_period)),
    ('create_payroll_run',         'select public.create_payroll_run(''2000-03'')'),
    ('recalculate_payroll_run',    format('select public.recalculate_payroll_run(%L)', v_run)),
    ('update_payslip_manual',      format('select public.update_payslip_manual(id, 99999999, 0, null) from public.payslips where run_id = %L and employee_id = %L', v_run, a)),
    ('finalize_payroll_run',       format('select public.finalize_payroll_run(%L)', v_run)),
    ('mark_payroll_paid',          format('select public.mark_payroll_paid(%L)', v_run)),
    ('reopen_payroll_run',         format('select public.reopen_payroll_run(%L, ''x'')', v_run)),
    ('review_request',             format('select public.review_request(id, ''disetujui'', null) from public.requests where employee_id = %L', a)),
    ('save_kpi_scores',            format('select public.save_kpi_scores(%L, ''[]''::jsonb, null)', v_rev_a)),
    ('finalize_kpi_review',        format('select public.finalize_kpi_review(%L)', v_rev_a)),
    ('(internal) mark_absent',          'select public.mark_absent(null)'),
    ('(internal) _payroll_fill_run',    format('select public._payroll_fill_run(%L)', v_run)),
    ('(internal) _kpi_create_reviews',  format('select public._kpi_create_reviews(%L)', v_period)),
    ('(internal) template_is_valid',    format('select public.template_is_valid(%L)', v_tpl)),
    ('(internal) create_leave_balances','select public.create_leave_balances(2000)'),
    ('(internal) ensure_leave_balance', format('select public.ensure_leave_balance(%L, 2001)', a))
  ) v(label, q) loop
    total := total + 1;
    begin
      execute r.q;
      fails := fails || format('RPC %s bisa dipanggil karyawan', r.label);
    exception
      when insufficient_privilege then null;
      when others then fails := fails || format('RPC %s: error tak terduga %s (%s)', r.label, sqlstate, left(sqlerrm, 80));
    end;
  end loop;

  -- 5. Kontrol positif: data sendiri tetap terbaca
  for r in select * from (values
    ('profiles',          format('select count(*) from public.profiles where id = %L', a)),
    ('attendances',       format('select count(*) from public.attendances where employee_id = %L', a)),
    ('requests',          format('select count(*) from public.requests where employee_id = %L', a)),
    ('leave_balances',    format('select count(*) from public.leave_balances where employee_id = %L', a)),
    ('benefits',          format('select count(*) from public.benefits where employee_id = %L', a)),
    ('salary_components', format('select count(*) from public.salary_components where employee_id = %L', a)),
    ('payslips (run final)', format('select count(*) from public.payslips where employee_id = %L and run_id = %L', a, v_run)),
    ('notifications',     format('select count(*) from public.notifications where user_id = %L', a))
  ) v(label, q) loop
    total := total + 1;
    begin
      execute r.q into n;
      if n = 0 then fails := fails || format('KONTROL: karyawan tidak bisa membaca %s miliknya', r.label); end if;
    exception when others then fails := fails || format('KONTROL %s: %s', r.label, left(sqlerrm, 80));
    end;
  end loop;
  reset role;

  -- 5b. Kontrol positif HR: modul KPI tetap terbaca penuh
  perform set_config('request.jwt.claims', json_build_object('sub', v_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for r in select * from (values
    ('kpi_templates',          format('select count(*) from public.kpi_templates where id = %L', v_tpl)),
    ('kpi_indicators',         format('select count(*) from public.kpi_indicators where template_id = %L', v_tpl)),
    ('kpi_periods',            format('select count(*) from public.kpi_periods where id in (%L, %L)', v_period, v_period2)),
    ('kpi_reviews',            format('select count(*) from public.kpi_reviews where id in (%L, %L, %L)', v_rev_a, v_rev_a2, v_rev_b)),
    ('kpi_scores',             format('select count(*) from public.kpi_scores where review_id in (%L, %L)', v_rev_a, v_rev_b)),
    ('hr_kpi_positions()',     'select count(*) from public.hr_kpi_positions()'),
    ('kartu KPI hr_dashboard', 'select count(*) from jsonb_object_keys(public.hr_dashboard()) k where k = ''kpi''')
  ) v(label, q) loop
    total := total + 1;
    begin
      execute r.q into n;
      if n = 0 then fails := fails || format('KONTROL HR: tidak bisa membaca %s', r.label); end if;
    exception when others then fails := fails || format('KONTROL HR %s: %s', r.label, left(sqlerrm, 80));
    end;
  end loop;
  reset role;

  -- 6a. anon tidak bisa membaca tabel public apa pun
  set local role anon;
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' order by 1 loop
    total := total + 1;
    begin
      execute format('select count(*) from public.%I', r.relname) into n;
      if n <> 0 then fails := fails || format('ANON membaca %s: %s baris', r.relname, n); end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- 6b. Semua tabel public ber-RLS, dan setiap RPC yang terbuka sudah diaudit
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    fails := fails || format('Tabel %s tanpa RLS', r.relname);
  end loop;
  total := total + 1;
  for r in
    select p.proname,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  loop
    if r.anon_exec then
      fails := fails || format('RPC %s bisa dipanggil anon', r.proname);
    elsif r.proname <> all (array[
      -- swalayan karyawan (memeriksa auth.uid() sendiri)
      'cancel_request', 'clock_in', 'clock_out', 'haversine_m', 'is_hr', 'my_dashboard', 'my_payslip_periods',
      'submit_leave', 'submit_remote', 'update_my_profile', 'working_days',
      -- khusus HR (diuji di bagian 4)
      'hr_dashboard', 'hr_monthly_report', 'hr_attendance_log', 'hr_attendance_summary', 'hr_payroll_runs',
      'hr_kpi_positions', 'hr_change_salary', 'hr_create_employee', 'hr_delete_holiday', 'hr_delete_office',
      'hr_delete_shift', 'hr_save_kpi_template', 'hr_create_kpi_period', 'hr_set_kpi_period_deadline',
      'hr_activate_kpi_period', 'hr_close_kpi_period', 'create_payroll_run', 'recalculate_payroll_run',
      'update_payslip_manual', 'finalize_payroll_run', 'mark_payroll_paid', 'reopen_payroll_run',
      'review_request', 'save_kpi_scores', 'finalize_kpi_review']) then
      fails := fails || format('RPC %s terbuka untuk authenticated tetapi belum diaudit', r.proname);
    end if;
  end loop;

  if cardinality(fails) = 0 then
    v_msg := format('RLS AUDIT LULUS: %s/%s pemeriksaan (karyawan A=%s, B=%s). Semua data uji dibatalkan.', total, total, a, b);
  else
    v_msg := format('RLS AUDIT GAGAL: %s masalah dari %s pemeriksaan:%s', cardinality(fails), total,
      E'\n - ' || array_to_string(fails, E'\n - '));
  end if;
  raise exception '%', v_msg;
end;
$rls$;
