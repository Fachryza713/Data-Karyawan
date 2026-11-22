-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 9: Persetujuan HR untuk cuti, izin, WFH, dan dinas
-- RPC review_request (khusus HR). Tidak ada tabel baru.
-- Disetujui (cuti tahunan): leave_balances.used bertambah. Disetujui (kind leave):
-- baris attendances cuti/sakit/izin per hari kerja, sehingga mark_absent tidak menandai alpa.
-- Setiap keputusan dicatat ke audit_logs.
-- Referensi: PRD US-09, bagian 6.3
-- =====================================================================

-- ---------------------------------------------------------------------
-- review_request: p_decision = 'disetujui' | 'ditolak'. Catatan wajib saat menolak.
-- ---------------------------------------------------------------------
create or replace function public.review_request(p_id uuid, p_decision text, p_note text default null)
returns public.requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_note        text := nullif(trim(coalesce(p_note, '')), '');
  v_employee    uuid;
  v_req         public.requests;
  v_type        public.leave_types;
  v_days        integer;
  v_year        integer;
  v_quota       integer;
  v_used        integer;
  v_att_status  text;
  v_att_rows    integer;
  v_diff        jsonb;
  v_row         public.requests;
begin
  if v_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat memproses pengajuan.' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('disetujui', 'ditolak') then
    raise exception 'Keputusan harus disetujui atau ditolak.' using errcode = '22023';
  end if;
  if p_decision = 'ditolak' and v_note is null then
    raise exception 'Catatan wajib diisi saat menolak pengajuan.' using errcode = '22023';
  end if;
  if length(v_note) > 500 then
    raise exception 'Catatan maksimal 500 karakter.' using errcode = '22023';
  end if;

  select r.employee_id into v_employee from public.requests r where r.id = p_id;
  if not found then
    raise exception 'Pengajuan tidak ditemukan.' using errcode = 'P0002';
  end if;

  -- Kunci yang sama dengan submit_leave/submit_remote: cek kuota & tumpang tindih
  -- di sisi pengajuan tidak berjalan bersamaan dengan persetujuan ini.
  perform pg_advisory_xact_lock(hashtextextended('requests:' || v_employee::text, 0));

  select * into v_req from public.requests r where r.id = p_id for update;

  if v_req.employee_id = v_uid then
    raise exception 'Anda tidak dapat memproses pengajuan milik sendiri.' using errcode = '42501';
  end if;
  if v_req.status <> 'menunggu' then
    raise exception 'Pengajuan ini sudah % dan tidak bisa diproses lagi.', v_req.status using errcode = 'P0001';
  end if;

  v_days := v_req.working_days;
  v_diff := jsonb_build_object(
    'status',      jsonb_build_object('old', v_req.status, 'new', p_decision),
    'reviewed_by', jsonb_build_object('old', v_req.reviewed_by, 'new', v_uid)
  );
  if v_note is not null then
    v_diff := v_diff || jsonb_build_object('review_note', jsonb_build_object('old', v_req.review_note, 'new', v_note));
  end if;

  if p_decision = 'disetujui' and v_req.kind = 'leave' then
    select * into v_type from public.leave_types lt where lt.id = v_req.leave_type_id;

    -- Hitung ulang hari kerja: daftar libur bisa berubah sejak pengajuan dikirim.
    v_days := public.working_days(v_req.start_date, v_req.end_date);
    if v_days = 0 then
      raise exception 'Rentang pengajuan tidak lagi berisi hari kerja (cek daftar hari libur). Tolak pengajuan ini.'
        using errcode = 'P0001';
    end if;
    if v_days <> v_req.working_days then
      v_diff := v_diff || jsonb_build_object('working_days', jsonb_build_object('old', v_req.working_days, 'new', v_days));
    end if;

    -- Cuti tahunan: cek ulang sisa kuota di dalam transaksi, lalu tambah used.
    if v_type.deducts_quota then
      v_year := extract(year from v_req.start_date)::integer;
      perform public.ensure_leave_balance(v_req.employee_id, v_year);

      select b.quota, b.used into v_quota, v_used
      from public.leave_balances b
      where b.employee_id = v_req.employee_id and b.year = v_year
      for update;

      if v_used + v_days > v_quota then
        raise exception 'Sisa kuota cuti tahunan % tidak cukup: sisa % hari kerja, pengajuan % hari kerja.',
          v_year, greatest(v_quota - v_used, 0), v_days
          using errcode = 'P0001';
      end if;

      update public.leave_balances
      set used = used + v_days
      where employee_id = v_req.employee_id and year = v_year;

      v_diff := v_diff || jsonb_build_object('leave_balances.used',
        jsonb_build_object('year', v_year, 'old', v_used, 'new', v_used + v_days));
    end if;

    -- Presensi: satu baris per hari kerja. Baris alpa/cuti tanpa jam masuk ditimpa;
    -- hari yang sudah punya absen masuk dibiarkan sebagai bukti kehadiran.
    v_att_status := case
      when v_type.code = 'sakit' then 'sakit'
      when v_type.code like 'izin%' then 'izin'
      else 'cuti'
    end;

    insert into public.attendances as a (employee_id, date, status)
    select v_req.employee_id, g.d::date, v_att_status
    from generate_series(v_req.start_date::timestamp, v_req.end_date::timestamp, interval '1 day') as g(d)
    where extract(isodow from g.d) < 6
      and not exists (select 1 from public.holidays h where h.date = g.d::date)
    on conflict (employee_id, date) do update
      set status = excluded.status, late_minutes = 0, mode = null
      where a.clock_in_at is null;
    get diagnostics v_att_rows = row_count;

    v_diff := v_diff || jsonb_build_object('attendances', jsonb_build_object(
      'status', v_att_status, 'days', v_att_rows, 'skipped_clocked_in', v_days - v_att_rows));
  end if;

  update public.requests set
    status       = p_decision,
    reviewed_by  = v_uid,
    reviewed_at  = now(),
    review_note  = v_note,
    working_days = v_days
  where id = p_id
  returning * into v_row;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'requests', p_id, v_diff);

  return v_row;
end;
$$;

revoke all on function public.review_request(uuid, text, text) from public, anon;
grant execute on function public.review_request(uuid, text, text) to authenticated;
