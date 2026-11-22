-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 13: Penilaian KPI per karyawan
-- Tabel kpi_reviews (satu per karyawan per periode) dan kpi_scores (skor per indikator).
-- Saat periode berubah draft -> aktif, trigger membuat review draft untuk setiap karyawan
-- aktif beserta salinan indikator template jabatannya saat itu. Salinan (nama, bobot, target)
-- membuat perubahan template sesudahnya tidak mengubah penilaian (PRD 6.5).
-- RPC (khusus HR): save_kpi_scores, finalize_kpi_review.
-- Client hanya SELECT; semua penulisan lewat RPC security definer.
-- Referensi: PRD US-17, US-18, bagian 6.5
-- =====================================================================

-- ---------------------------------------------------------------------
-- kpi_reviews: status 'draft' -> 'final'. Status tampilan di UI:
--   reviewer_id NULL          -> belum dinilai
--   status draft + reviewer   -> draft (skor sudah disimpan)
--   status final              -> final (terlihat oleh karyawan, tidak bisa diubah)
-- ---------------------------------------------------------------------
create table public.kpi_reviews (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.kpi_periods (id) on delete cascade,
  employee_id   uuid not null references public.profiles (id) on delete cascade,
  position_id   uuid references public.positions (id) on delete set null,
  template_id   uuid references public.kpi_templates (id) on delete set null,
  reviewer_id   uuid references public.profiles (id) on delete set null,
  final_score   numeric(4, 1) check (final_score between 0 and 100),
  grade         text check (grade in ('A', 'B', 'C', 'D')),
  note          text check (length(note) <= 1000),
  status        text not null default 'draft' check (status in ('draft', 'final')),
  finalized_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (period_id, employee_id),
  -- Skor akhir, grade, dan waktu final terisi tepat ketika status final.
  check ((status = 'final') = (final_score is not null and grade is not null and finalized_at is not null))
);
create index kpi_reviews_employee_idx on public.kpi_reviews (employee_id, status);
create index kpi_reviews_reviewer_idx on public.kpi_reviews (reviewer_id);

comment on column public.kpi_reviews.position_id is 'Jabatan karyawan saat periode diaktifkan.';
comment on column public.kpi_reviews.template_id is 'Template yang disalin ke kpi_scores saat periode diaktifkan.';
comment on column public.kpi_reviews.reviewer_id is 'HR terakhir yang menyimpan atau memfinalkan skor. NULL = belum dinilai.';

-- ---------------------------------------------------------------------
-- kpi_scores: satu baris per indikator. name/description/weight/target/sort_order adalah
-- salinan indikator saat periode diaktifkan. indicator_id menjadi NULL bila indikator
-- dihapus dari template; skor tetap utuh.
-- ---------------------------------------------------------------------
create table public.kpi_scores (
  id            uuid primary key default gen_random_uuid(),
  review_id     uuid not null references public.kpi_reviews (id) on delete cascade,
  indicator_id  uuid references public.kpi_indicators (id) on delete set null,
  name          text not null,
  description   text,
  weight        integer not null check (weight between 1 and 100),
  target        text,
  sort_order    integer not null default 0,
  score         numeric(5, 2) check (score between 0 and 100),
  note          text check (length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (review_id, indicator_id)
);
create index kpi_scores_indicator_idx on public.kpi_scores (indicator_id);

create trigger set_updated_at before update on public.kpi_reviews
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.kpi_scores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Hak akses + RLS
-- HR baca semua. Karyawan hanya review miliknya yang final, beserta skornya.
-- ---------------------------------------------------------------------
revoke all on public.kpi_reviews, public.kpi_scores from anon, authenticated;
grant select on public.kpi_reviews, public.kpi_scores to authenticated;

alter table public.kpi_reviews enable row level security;
alter table public.kpi_scores  enable row level security;

create policy "kpi_reviews: HR baca semua" on public.kpi_reviews
  for select to authenticated using ((select public.is_hr()));
create policy "kpi_reviews: karyawan baca miliknya yang final" on public.kpi_reviews
  for select to authenticated using (employee_id = (select auth.uid()) and status = 'final');

create policy "kpi_scores: HR baca semua" on public.kpi_scores
  for select to authenticated using ((select public.is_hr()));
create policy "kpi_scores: karyawan baca skor review finalnya" on public.kpi_scores
  for select to authenticated using (
    exists (
      select 1 from public.kpi_reviews r
      where r.id = kpi_scores.review_id
        and r.employee_id = (select auth.uid())
        and r.status = 'final'
    )
  );

-- ---------------------------------------------------------------------
-- Penjaga: penilaian final tidak bisa diubah, bahkan oleh fungsi lain.
-- Pengecualian: kolom FK yang di-NULL-kan otomatis (on delete set null) dan updated_at,
-- supaya mengedit template atau menghapus akun tidak terblokir oleh review lama.
-- ---------------------------------------------------------------------
create or replace function public._kpi_guard_final_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'final'
     and (to_jsonb(new) - array['position_id', 'template_id', 'reviewer_id', 'updated_at'])
         is distinct from (to_jsonb(old) - array['position_id', 'template_id', 'reviewer_id', 'updated_at']) then
    raise exception 'Penilaian sudah final dan tidak bisa diubah.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public._kpi_guard_final_scores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['indicator_id', 'updated_at']) is distinct from (to_jsonb(old) - array['indicator_id', 'updated_at'])
     and exists (select 1 from public.kpi_reviews r where r.id = old.review_id and r.status = 'final') then
    raise exception 'Skor penilaian final tidak bisa diubah.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public._kpi_guard_final_review() from public, anon, authenticated;
revoke all on function public._kpi_guard_final_scores() from public, anon, authenticated;

create trigger guard_final_review before update on public.kpi_reviews
  for each row execute function public._kpi_guard_final_review();
create trigger guard_final_scores before update on public.kpi_scores
  for each row execute function public._kpi_guard_final_scores();

-- ---------------------------------------------------------------------
-- _kpi_grade: A 85–100, B 70–84, C 55–69, D < 55 (PRD 6.5). Dipakai setelah skor dibulatkan.
-- ---------------------------------------------------------------------
create or replace function public._kpi_grade(p_score numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_score is null then null
    when p_score >= 85 then 'A'
    when p_score >= 70 then 'B'
    when p_score >= 55 then 'C'
    else 'D'
  end;
$$;

revoke all on function public._kpi_grade(numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- _kpi_create_reviews: review draft + salinan indikator untuk setiap karyawan aktif yang
-- jabatannya punya template valid. Karyawan tanpa jabatan dilewati. Aman dipanggil ulang
-- (karyawan yang sudah punya review di periode itu tidak disentuh). Hasil: jumlah review baru.
-- ---------------------------------------------------------------------
create or replace function public._kpi_create_reviews(p_period_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with new_reviews as (
    insert into public.kpi_reviews (period_id, employee_id, position_id, template_id)
    select p_period_id, p.id, p.position_id, t.id
    from public.profiles p
    join public.kpi_templates t on t.position_id = p.position_id and t.is_active
    where p.is_active
      and public.template_is_valid(t.id)
    on conflict (period_id, employee_id) do nothing
    returning id, template_id
  ),
  new_scores as (
    insert into public.kpi_scores (review_id, indicator_id, name, description, weight, target, sort_order)
    select r.id, i.id, i.name, i.description, i.weight, i.target, i.sort_order
    from new_reviews r
    join public.kpi_indicators i on i.template_id = r.template_id
    returning review_id
  )
  select count(distinct review_id) into v_count from new_scores;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public._kpi_create_reviews(uuid) from public, anon, authenticated;

-- Trigger: periode draft -> aktif (lewat hr_activate_kpi_period) membuat review draft.
create or replace function public._kpi_on_period_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._kpi_create_reviews(new.id);
  return null;
end;
$$;

revoke all on function public._kpi_on_period_activated() from public, anon, authenticated;

create trigger create_reviews_on_activate
  after update of status on public.kpi_periods
  for each row
  when (old.status = 'draft' and new.status = 'aktif')
  execute function public._kpi_on_period_activated();

-- ---------------------------------------------------------------------
-- _kpi_lock_review: kunci review yang masih boleh diubah (draft, periode aktif).
-- Periode dikunci FOR SHARE agar tidak ditutup selagi skor disimpan.
-- ---------------------------------------------------------------------
create or replace function public._kpi_lock_review(p_review_id uuid)
returns public.kpi_reviews
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_review  public.kpi_reviews;
  v_period  public.kpi_periods;
begin
  select * into v_review from public.kpi_reviews where id = p_review_id for update;
  if not found then
    raise exception 'Penilaian tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_review.status = 'final' then
    raise exception 'Penilaian sudah final. Skor tidak bisa diubah.' using errcode = 'P0001';
  end if;

  select * into v_period from public.kpi_periods where id = v_review.period_id for share;
  if v_period.status <> 'aktif' then
    raise exception 'Periode % tidak aktif. Penilaian hanya bisa diisi selama periode aktif.', v_period.name
      using errcode = 'P0001';
  end if;
  return v_review;
end;
$$;

revoke all on function public._kpi_lock_review(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- save_kpi_scores: simpan skor semua indikator + catatan HR (review tetap draft).
-- p_scores = [{"id": <kpi_scores.id>, "score": 0–100 (maks. 2 desimal), "note"?: teks ≤ 500}, ...]
-- Semua indikator review wajib ada di payload dan diberi skor.
-- Hasil: {"review_id", "status", "score" (pratinjau skor akhir), "grade"}
-- ---------------------------------------------------------------------
create or replace function public.save_kpi_scores(p_review_id uuid, p_scores jsonb, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := public._kpi_require_hr();
  v_review    public.kpi_reviews;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_item      jsonb;
  v_ord       integer := 0;
  v_score_id  uuid;
  v_name      text;
  v_raw       text;
  v_score     numeric;
  v_inote     text;
  v_seen      uuid[] := '{}';
  v_count     integer;
  v_preview   numeric;
begin
  v_review := public._kpi_lock_review(p_review_id);

  if length(v_note) > 1000 then
    raise exception 'Catatan HR maksimal 1000 karakter.' using errcode = '22023';
  end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'array' or jsonb_array_length(p_scores) = 0 then
    raise exception 'Skor indikator wajib diisi.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_scores) loop
    v_ord := v_ord + 1;
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Skor ke-%: indikator tidak valid.', v_ord using errcode = '22023';
    end if;
    v_score_id := (v_item ->> 'id')::uuid;

    select name into v_name from public.kpi_scores where id = v_score_id and review_id = v_review.id;
    if not found then
      raise exception 'Skor ke-%: indikator bukan bagian dari penilaian ini.', v_ord using errcode = '22023';
    end if;
    if v_score_id = any (v_seen) then
      raise exception 'Indikator "%" tercantum lebih dari sekali.', v_name using errcode = '22023';
    end if;
    v_seen := v_seen || v_score_id;

    v_raw := trim(coalesce(v_item ->> 'score', ''));
    if v_raw = '' then
      raise exception 'Indikator "%": skor wajib diisi.', v_name using errcode = '22023';
    end if;
    if v_raw !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then
      raise exception 'Indikator "%": skor harus angka 0–100 (maksimal 2 desimal).', v_name using errcode = '22023';
    end if;
    v_score := v_raw::numeric;
    if v_score > 100 then
      raise exception 'Indikator "%": skor harus angka 0–100 (maksimal 2 desimal).', v_name using errcode = '22023';
    end if;

    v_inote := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if length(v_inote) > 500 then
      raise exception 'Indikator "%": catatan maksimal 500 karakter.', v_name using errcode = '22023';
    end if;

    update public.kpi_scores set score = v_score, note = v_inote where id = v_score_id;
  end loop;

  select count(*) into v_count from public.kpi_scores where review_id = v_review.id;
  if cardinality(v_seen) < v_count then
    raise exception 'Semua indikator wajib diberi skor (% dari % terisi).', cardinality(v_seen), v_count
      using errcode = '22023';
  end if;

  update public.kpi_reviews set note = v_note, reviewer_id = v_uid where id = v_review.id;

  select round(sum(score * weight) / 100.0, 1) into v_preview
  from public.kpi_scores where review_id = v_review.id;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'kpi_reviews', v_review.id,
    jsonb_build_object('period_id', v_review.period_id, 'employee_id', v_review.employee_id,
      'status', 'draft', 'scores', v_count, 'score_preview', v_preview));

  return jsonb_build_object('review_id', v_review.id, 'status', 'draft',
    'score', v_preview, 'grade', public._kpi_grade(v_preview));
end;
$$;

-- ---------------------------------------------------------------------
-- finalize_kpi_review: draft -> final. Skor akhir = Σ(skor × bobot / 100), dibulatkan
-- 1 desimal; grade dari skor yang sudah dibulatkan. Setelah final, review dan skornya
-- terkunci (lihat trigger penjaga) dan terlihat oleh karyawan.
-- ---------------------------------------------------------------------
create or replace function public.finalize_kpi_review(p_review_id uuid)
returns public.kpi_reviews
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := public._kpi_require_hr();
  v_review   public.kpi_reviews;
  v_total    integer;
  v_missing  integer;
  v_final    numeric;
  v_grade    text;
  v_row      public.kpi_reviews;
begin
  v_review := public._kpi_lock_review(p_review_id);

  select count(*), count(*) filter (where score is null), round(sum(score * weight) / 100.0, 1)
    into v_total, v_missing, v_final
  from public.kpi_scores where review_id = v_review.id;

  if v_total = 0 then
    raise exception 'Penilaian ini tidak punya indikator.' using errcode = 'P0001';
  end if;
  if v_missing > 0 then
    raise exception 'Simpan skor semua indikator sebelum finalisasi (% indikator belum diberi skor).', v_missing
      using errcode = 'P0001';
  end if;

  v_grade := public._kpi_grade(v_final);

  update public.kpi_reviews set
    status = 'final', final_score = v_final, grade = v_grade, finalized_at = now(), reviewer_id = v_uid
  where id = v_review.id
  returning * into v_row;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'kpi_reviews', v_review.id,
    jsonb_build_object('period_id', v_review.period_id, 'employee_id', v_review.employee_id,
      'status', jsonb_build_object('old', 'draft', 'new', 'final'),
      'final_score', v_final, 'grade', v_grade));

  return v_row;
end;
$$;

revoke all on function public.save_kpi_scores(uuid, jsonb, text) from public, anon;
revoke all on function public.finalize_kpi_review(uuid)          from public, anon;
grant execute on function public.save_kpi_scores(uuid, jsonb, text) to authenticated;
grant execute on function public.finalize_kpi_review(uuid)          to authenticated;

-- Periode yang sudah aktif sebelum migrasi ini: buat review-nya sekarang.
select public._kpi_create_reviews(id) from public.kpi_periods where status = 'aktif';
