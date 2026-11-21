# Prompt Implementasi HRIS Blue Rose Tech

Nov 21, 2026 · @A3

## Cara pakai

Ada 18 prompt. Satu prompt mengerjakan satu fitur, dan harus dijalankan **berurutan**, karena prompt berikutnya memakai tabel dan kode dari prompt sebelumnya.

Persiapan sekali saja:

1. Export dokumen PRD sebagai Markdown, lalu simpan di repo sebagai `docs/PRD.md`. Semua prompt merujuk ke file itu.
2. Buat project di supabase.com, lalu install Supabase CLI.
3. Commit dulu kondisi sekarang ke git, supaya setiap fitur bisa di-review atau di-revert sendiri.

Setiap kali satu prompt selesai:

1. Jalankan langkah uji manual yang ditulis AI di akhir jawabannya.
2. Kalau lolos, commit dengan pesan `feat: <nama fitur>`. Kalau gagal, perbaiki di sesi yang sama sebelum lanjut ke prompt berikutnya.
3. Centang prompt itu di dokumen ini.

Semua prompt memakai blok **ATURAN** yang sama di bagian bawah, supaya AI tidak melebar ke fitur lain.

## A. Fondasi

### 1. Setup Supabase dan skema dasar

- [ ] Selesai dan dites

```text
Konteks: Saya membangun HRIS "Blue Rose Tech" untuk portofolio. Frontend React 18 + Vite + Tailwind sudah ada di folder dashboard/ (entry karyawan: index.html, entry HR: hr/index.html). Backend memakai Supabase. Baca docs/PRD.md bagian 4, 7, dan 8 sebelum mulai.

Tugas: siapkan fondasi Supabase.
1. Inisialisasi Supabase CLI di root repo (folder supabase/).
2. Install @supabase/supabase-js di dashboard/. Buat dashboard/src/lib/supabase.js yang membaca VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY. Buat dashboard/.env.example, dan pastikan .env ada di .gitignore.
3. Buat migrasi pertama berisi tabel: divisions, positions, offices, shifts, holidays, profiles. Kolom sesuai PRD bagian 7. profiles.id = auth.users.id (on delete cascade). Tambahkan enum role ('employee','hr').
4. Buat fungsi SQL public.is_hr() (security definer, stable) yang mengecek role user saat ini di profiles.
5. Aktifkan RLS di semua tabel tersebut. Policy: semua user login boleh SELECT master data (divisions, positions, offices, shifts, holidays); hanya HR boleh INSERT/UPDATE. profiles: karyawan SELECT barisnya sendiri, HR SELECT/INSERT/UPDATE semua. Tidak ada DELETE dari client.
6. Buat trigger updated_at untuk semua tabel.
7. Buat supabase/seed.sql: 6 divisi, 18 jabatan, kantor "Head Office Jakarta" (koordinat contoh, radius 100 m), shift 08:30-17:30 toleransi 15 menit, dan libur nasional 2026.

Jangan sentuh komponen UI di prompt ini.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 2. Autentikasi dan routing per role

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech, React + Vite di dashboard/, Supabase sudah di-setup (dashboard/src/lib/supabase.js, tabel profiles dengan kolom role). Baca docs/PRD.md bagian 3 dan user story US-01, US-02.

Tugas: hubungkan login, reset password, dan pemisahan portal ke Supabase Auth.
1. Gabungkan dua entry (src/main.jsx untuk karyawan, src/hr-main.jsx untuk HR) menjadi satu app dengan react-router-dom. Rute: /login, /reset-password, /update-password, /app/* untuk karyawan, /hr/* untuk HR. Hapus input hr/index.html dari vite.config.js jika sudah tidak dipakai.
2. Buat AuthProvider (src/context/AuthContext.jsx) yang menyimpan session dan profil (termasuk role), mendengarkan onAuthStateChange, dan menyediakan signIn, signOut, loading.
3. LoginPage.jsx: panggil signInWithPassword. Pesan error umum ("Email atau password salah"). Setelah login, arahkan employee ke /app dan hr ke /hr.
4. ResetPasswordPage.jsx: panggil resetPasswordForEmail dengan redirectTo ke /update-password. Buat halaman UpdatePasswordPage (password minimal 8 karakter, konfirmasi harus sama).
5. Buat ProtectedRoute: tanpa sesi diarahkan ke /login. employee yang membuka /hr/* diarahkan ke /app, dan sebaliknya.
6. Tombol Keluar di Sidebar memanggil signOut.
7. TopHeader memakai nama, jabatan, divisi, dan foto dari profil asli, bukan string hardcoded.
8. Tambahkan dua akun demo ke seed atau dokumentasi: demo.karyawan@bluerose.test (employee) dan demo.hr@bluerose.test (hr).

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

## B. Organisasi

### 3. Data karyawan (HR)

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Supabase, Auth, dan routing per role sudah jalan. Di HRDashboard.jsx, menu "Data karyawan" masih HRPlaceholder. Baca docs/PRD.md user story US-10 dan US-11, serta bagian 7 (tabel profiles, salary_components, benefits).

Tugas: buat modul Data karyawan untuk HR.
1. Migrasi: tabel salary_components (riwayat gaji dengan effective_from, bank_account_last4 saja, bukan nomor rekening penuh) dan benefits. RLS: karyawan SELECT miliknya, HR semua. Tambahkan juga tabel audit_logs (hanya HR yang boleh SELECT, insert lewat trigger).
2. Edge Function supabase/functions/invite-employee: hanya bisa dipanggil HR (cek JWT + role). Membuat user di Auth lewat inviteUserByEmail, lalu insert ke profiles, salary_components, dan benefits dalam satu alur. Kalau satu langkah gagal, hapus user yang sudah terbuat.
3. Halaman HR "Data karyawan" (src/components/hr/EmployeesPage.jsx): tabel karyawan dengan pencarian nama/NIP, filter divisi dan status aktif, pagination 25 baris.
4. Form tambah karyawan (dialog atau halaman): nama, email kantor, NIP format BRT-YYYY-NNNN, jenis kelamin, tanggal lahir, divisi, jabatan (difilter sesuai divisi), tanggal masuk, status tetap/kontrak, kantor, shift, gaji pokok, tunjangan tetap, bank + 4 digit terakhir rekening, nomor BPJS Kesehatan dan BPJS Ketenagakerjaan. Validasi NIP dan email unik.
5. Detail dan edit karyawan. Perubahan gaji membuat baris salary_components baru, bukan menimpa yang lama.
6. Tombol Nonaktifkan: set is_active = false dan ban user di Auth (lewat Edge Function). Riwayat tetap tersimpan.
7. Sub-halaman master Divisi dan Jabatan (tambah, ubah nama).
8. Trigger audit_logs untuk insert/update di profiles dan salary_components oleh HR.
9. Tombol "Tambah karyawan" di beranda HR mengarah ke form ini.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 4. Profil karyawan

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Data karyawan sudah tersimpan di profiles. ProfilePage.jsx masih memakai state lokal dan nama hardcoded. Baca docs/PRD.md user story US-12.

Tugas: hubungkan halaman Profil karyawan ke Supabase.
1. ProfilePage.jsx membaca profil user yang login, beserta nama divisi dan jabatan.
2. Field yang boleh diubah karyawan: nama lengkap, nomor telepon, jenis kelamin, tanggal lahir, foto. Field organisasi (NIP, email kantor, divisi, jabatan, tanggal masuk) tampil read-only dengan badge "Diatur HR".
3. Kunci hal ini di database juga, bukan hanya di UI: buat fungsi RPC update_my_profile(...) yang hanya mengubah field pribadi, dan cabut hak UPDATE langsung karyawan pada profiles.
4. Upload foto ke bucket Storage "avatars" di path <user_id>/avatar.<ext>. Hanya JPG/PNG maksimal 2 MB, dicek di client dan di policy bucket. Bucket boleh dibaca publik, tapi hanya pemiliknya yang boleh menulis.
5. Teks "Terakhir diperbarui" memakai updated_at. Tampilkan toast sukses/gagal saat menyimpan.
6. Foto dan nama di TopHeader langsung ikut berubah setelah disimpan.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 5. Pengaturan kantor, shift, dan hari libur (HR)

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Tabel offices, shifts, dan holidays sudah ada dari migrasi pertama. Tombol "Pengaturan" di sidebar HR belum berfungsi. Baca docs/PRD.md user story US-07 dan bagian 6.1.

Tugas: buat halaman Pengaturan untuk HR.
1. Halaman /hr/pengaturan dengan tiga tab: Kantor, Shift, Hari libur.
2. Kantor: daftar dan form nama, latitude, longitude, radius (meter, default 100, minimal 25). Sediakan tombol "Pakai lokasi saya sekarang" yang mengisi koordinat dari Geolocation API. Tampilkan link "Lihat di Google Maps" untuk mengecek titiknya.
3. Shift: nama, jam masuk, jam pulang, toleransi terlambat (menit). Validasi jam pulang harus setelah jam masuk.
4. Hari libur: daftar per tahun, tambah dan hapus tanggal + nama libur. Hapus diizinkan hanya untuk HR, lewat RPC.
5. Kantor atau shift yang masih dipakai karyawan tidak boleh dihapus. Tampilkan pesan jumlah karyawan yang memakainya.
6. Tombol "Atur shift" di halaman kehadiran HR mengarah ke tab Shift.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

## C. Presensi

### 6. Absen masuk dan pulang berbasis GPS

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Tabel profiles, offices (latitude, longitude, radius_m), shifts, dan holidays sudah ada. AttendancePage.jsx dan AttendanceCard.jsx masih memakai data hardcoded. Baca docs/PRD.md user story US-03 dan bagian 6.1.

Tugas: buat fitur absen masuk/pulang yang divalidasi jarak GPS ke kantor.
1. Migrasi: tabel attendances sesuai PRD bagian 7, unik per (employee_id, date). Kolom status: 'tepat_waktu','terlambat','pulang_cepat','cuti','sakit','izin','alpa'. Kolom mode: 'office','wfh','dinas'. RLS: karyawan hanya SELECT miliknya, HR SELECT semua. TIDAK ADA insert/update langsung dari client.
2. Fungsi SQL haversine_m(lat1, lng1, lat2, lng2) yang mengembalikan jarak dalam meter.
3. RPC clock_in(p_lat, p_lng, p_accuracy) dan clock_out(p_lat, p_lng, p_accuracy), security definer, memakai auth.uid():
   - Tanggal dan jam dihitung di zona Asia/Jakarta.
   - Tolak jika akurasi > 100 m.
   - Hitung jarak ke kantor karyawan. Jika > radius, tolak dengan error yang berisi jarak saat ini (meter).
   - clock_in: tolak jika sudah absen masuk hari ini. Status tepat_waktu atau terlambat (bandingkan dengan jam masuk shift + toleransi), simpan late_minutes.
   - clock_out: tolak jika belum absen masuk atau sudah absen pulang. Tandai pulang_cepat jika sebelum jam pulang shift.
   - Simpan koordinat, jarak, akurasi, dan mode 'office'.
   - Siapkan satu titik cek "izin kerja di luar kantor yang disetujui" sebagai fungsi terpisah has_approved_remote(employee_id, date) yang untuk sementara selalu mengembalikan false. Fungsi ini akan diisi di prompt WFH/dinas.
4. Hook useGeolocation di frontend: enableHighAccuracy true, timeout 10 detik. Tangani izin ditolak, timeout, dan GPS tidak tersedia dengan pesan yang jelas.
5. AttendancePage.jsx dan AttendanceCard.jsx: status hari ini (belum absen / sudah masuk jam X / sudah pulang), tombol Masuk dan Pulang yang aktif sesuai kondisi, shift hari ini, dan pesan penolakan dari server termasuk jaraknya.
6. Tampilkan loading saat mengambil lokasi dan saat memanggil RPC. Cegah klik ganda.

Bagian riwayat dan log HR dikerjakan di prompt berikutnya, jangan dikerjakan di sini.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 7. Riwayat kehadiran, log presensi HR, dan penandaan alpa

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Absen GPS sudah jalan dan tersimpan di tabel attendances. HRAttendancePage.jsx dan bagian riwayat di AttendancePage.jsx masih hardcoded. Baca docs/PRD.md user story US-05 dan US-06.

Tugas: tampilkan riwayat dan log presensi dari database.
1. Karyawan (AttendancePage.jsx): tabel riwayat per bulan (tanggal, jam masuk, jam pulang, status, mode) dengan pemilih bulan. Ringkasan bulan: hadir, terlambat, cuti/izin, alpa.
2. HR (HRAttendancePage.jsx): log presensi per tanggal untuk semua karyawan aktif, termasuk yang belum absen. Filter tanggal, divisi, dan status (Tepat waktu, Terlambat, Cuti/sakit, Di luar radius, Belum absen). Pencarian nama.
3. Buat view atau RPC hr_attendance_summary(p_date) yang mengembalikan jumlah per status untuk hari itu. Pakai di halaman ini.
4. Tombol Ekspor: unduh CSV untuk rentang tanggal yang dipilih (nama, NIP, divisi, tanggal, masuk, pulang, status, mode, jarak).
5. Klik baris membuka detail: koordinat masuk/pulang, jarak, akurasi, dan link Google Maps.
6. Aktifkan pg_cron. Buat fungsi mark_absent() yang berjalan setiap hari pukul 23:59 WIB (16:59 UTC): untuk setiap karyawan aktif yang belum punya baris attendances di hari kerja itu (bukan Sabtu, Minggu, atau tanggal di holidays), insert baris dengan status 'alpa'.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

## D. Cuti, izin WFH/dinas, dan approval HR

### 8. Pengajuan cuti, sakit, dan izin khusus

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Presensi sudah jalan. Form "Ajukan cuti / izin" di AttendancePage.jsx dan LeaveQuotaCard.jsx masih hardcoded. Baca docs/PRD.md user story US-08 dan bagian 6.3.

Tugas: buat pengajuan cuti oleh karyawan (approval HR dikerjakan di prompt lain).
1. Migrasi: tabel leave_types, leave_balances, dan requests sesuai PRD bagian 7. requests.kind berisi 'leave','wfh','dinas' (wfh/dinas dipakai di prompt berikutnya). requests.status berisi 'menunggu','disetujui','ditolak','dibatalkan'. Seed leave_types: cuti tahunan (kuota 12, mengurangi kuota), sakit (wajib lampiran jika > 1 hari, tidak mengurangi kuota), izin khusus.
2. Fungsi working_days(start, end) yang menghitung hari kerja (tanpa Sabtu, Minggu, dan tanggal di holidays).
3. RPC submit_leave(p_type, p_start, p_end, p_reason, p_attachment_path), security definer. Validasi di server:
   - start <= end, dan tidak di masa lalu lebih dari 7 hari.
   - Cuti tahunan tidak boleh melebihi sisa kuota tahun berjalan.
   - Sakit > 1 hari wajib lampiran.
   - Tidak boleh tumpang tindih dengan pengajuan lain yang menunggu atau disetujui.
   Simpan working_days di baris requests.
4. RPC cancel_request(p_id): hanya pemilik, hanya jika masih menunggu.
5. Bucket Storage privat "attachments", path <user_id>/<uuid>.<ext>, JPG/PNG/PDF maksimal 2 MB. Policy: pemilik dan HR boleh membaca, hanya pemilik boleh upload.
6. Buat leave_balances otomatis untuk setiap karyawan aktif di awal tahun (fungsi + pg_cron 1 Januari) dan saat karyawan baru ditambahkan (trigger di profiles).
7. UI: form pengajuan di AttendancePage.jsx (jenis, mulai, selesai, alasan, lampiran yang muncul sesuai aturan), tampilkan jumlah hari kerja dan sisa kuota sebelum dikirim. Daftar "Pengajuan saya" dengan status dan tombol Batalkan. LeaveQuotaCard.jsx memakai data leave_balances.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 9. Pengajuan izin WFH dan dinas luar

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Tabel requests sudah ada dengan kind 'leave','wfh','dinas'. RPC clock_in/clock_out memanggil has_approved_remote(employee_id, date) yang saat ini selalu false. Baca docs/PRD.md user story US-04 dan bagian 6.2.

Tugas: buat pengajuan WFH/dinas luar dan hubungkan ke absen.
1. RPC submit_remote(p_kind, p_start, p_end, p_reason, p_destination): kind hanya 'wfh' atau 'dinas', destination wajib untuk dinas. Diajukan paling lambat H-1 (tanggal mulai minimal besok). Tidak boleh tumpang tindih dengan pengajuan lain yang menunggu atau disetujui. Tidak mengurangi kuota cuti.
2. Isi has_approved_remote: true jika ada requests kind wfh/dinas berstatus disetujui yang mencakup tanggal itu.
3. Ubah clock_in/clock_out lewat migrasi baru (create or replace): jika has_approved_remote true, abaikan batas radius, tetap simpan koordinat dan jarak, dan isi mode 'wfh' atau 'dinas' sesuai pengajuan. Batas akurasi 100 m tetap berlaku.
4. UI karyawan: di AttendancePage.jsx tambahkan pilihan "Ajukan WFH / dinas luar" (bisa berupa tab di form pengajuan yang sudah ada). Daftar "Pengajuan saya" juga menampilkan WFH/dinas.
5. Kartu status hari ini menampilkan "Hari ini: WFH disetujui" atau "Dinas luar ke <tujuan>" jika berlaku, supaya karyawan tahu ia boleh absen di luar kantor.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 10. Approval HR untuk cuti, izin, WFH, dan dinas

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Karyawan sudah bisa mengajukan cuti/sakit/izin (kind 'leave') dan WFH/dinas (kind 'wfh','dinas') ke tabel requests. Tab "Cuti & izin" di HRAttendancePage.jsx masih hardcoded. Baca docs/PRD.md user story US-09.

Tugas: buat alur persetujuan oleh HR.
1. RPC review_request(p_id, p_decision, p_note), security definer, hanya untuk HR:
   - Hanya pengajuan berstatus menunggu yang bisa diproses.
   - HR tidak boleh memproses pengajuannya sendiri.
   - Catatan wajib jika ditolak.
   - Simpan reviewed_by dan reviewed_at.
   - Jika cuti tahunan disetujui: tambah leave_balances.used sebanyak working_days. Cek ulang sisa kuota di dalam transaksi.
   - Jika kind 'leave' disetujui: insert atau update baris attendances untuk setiap hari kerja di rentang itu dengan status 'cuti', 'sakit', atau 'izin'. Dengan begitu mark_absent tidak menandainya alpa.
   - Catat ke audit_logs.
2. UI HR: daftar pengajuan menunggu, diurutkan dari tanggal mulai terdekat, dengan filter jenis. Badge jumlah di menu sidebar "Kehadiran & cuti" memakai angka asli.
3. Dialog detail: data karyawan, jenis, rentang, jumlah hari kerja, alasan, sisa kuota (untuk cuti tahunan), tujuan (untuk dinas), dan pratinjau lampiran memakai signed URL dari bucket attachments.
4. Tombol Setujui dan Tolak (tolak membuka input catatan). Daftar langsung diperbarui setelah aksi.
5. Tab riwayat pengajuan yang sudah diproses, dengan filter status.
6. Di sisi karyawan, status dan catatan HR tampil di daftar "Pengajuan saya".

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

## E. Penggajian

Kedua prompt ini menganggap PPh 21 diinput manual oleh HR, sesuai usulan sementara di PRD. Kalau kamu memutuskan PPh 21 dihitung otomatis, ubah poin PPh 21 di prompt 11 dulu sebelum menjalankannya.

### 11. Payroll bulanan (HR)

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Tabel salary_components (gaji pokok, tunjangan tetap, riwayat per effective_from) sudah ada. Menu HR "Penggajian & manfaat" masih HRPlaceholder. Baca docs/PRD.md user story US-13 dan bagian 6.4.

Tugas: buat modul payroll untuk HR.
1. Migrasi: tabel payroll_settings, payroll_runs, dan payslips sesuai PRD bagian 7. RLS: HR semua; karyawan hanya SELECT payslips miliknya yang run-nya berstatus 'final' atau 'paid'. Karyawan tidak boleh melihat payroll_settings dan payroll_runs berstatus draft.
2. Seed payroll_settings (key, value, effective_from): tarif BPJS Kesehatan 1% karyawan / 4% perusahaan dengan batas upah 12.000.000; JHT 2% / 3,7%; JP 1% / 2% dengan batas upah 10.547.400; JKK 0,24% perusahaan; JKM 0,3% perusahaan. Jangan hardcode tarif di fungsi, selalu baca dari tabel ini.
3. RPC create_payroll_run(p_period 'YYYY-MM'): hanya HR, satu run per periode. Buat draft payslips untuk semua karyawan aktif memakai salary_components yang berlaku di periode itu. Hitung otomatis: gross = gaji pokok + tunjangan + bonus; potongan BPJS karyawan; kontribusi perusahaan disimpan di employer_contributions (jsonb). Bulatkan ke rupiah terdekat.
4. Bonus dan PPh 21 diinput manual oleh HR per karyawan saat run masih draft (RPC update_payslip_manual(p_id, p_bonus, p_pph21, p_note)). Setiap perubahan menghitung ulang gross dan net.
5. RPC finalize_payroll_run (draft ke final) dan mark_payroll_paid (final ke paid). Payslip di run yang sudah final tidak bisa diubah. Sediakan reopen_payroll_run (final ke draft) khusus HR, dicatat ke audit_logs.
6. UI HR: daftar run per periode dengan status dan total. Halaman detail run: tabel karyawan dengan kolom gaji pokok, tunjangan, bonus (bisa diedit), BPJS, PPh 21 (bisa diedit), net. Total di bawah. Tombol Finalisasi dan Tandai dibayar dengan dialog konfirmasi.
7. Ringkasan kontribusi BPJS bagian perusahaan per run (untuk laporan HR).
8. Kartu "Payroll <bulan>" di beranda HR memakai status run terbaru.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 12. Slip gaji dan manfaat karyawan

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Payroll HR sudah jalan dan payslips tersimpan. Tabel benefits sudah ada. SalaryPage.jsx, SalaryCard.jsx, dan BenefitsCard.jsx masih hardcoded. Baca docs/PRD.md user story US-14 dan US-15.

Tugas: tampilkan slip gaji dan manfaat dari database untuk karyawan.
1. SalaryPage.jsx: pemilih periode berisi periode yang sudah ada payslip-nya. Periode dengan run draft tampil "Belum terbit". Rincian penerimaan (gaji pokok, tunjangan, bonus), potongan (BPJS Kesehatan, JHT, JP, PPh 21, lain-lain), total bruto, dan take home pay. Rekening tujuan tampil sebagai "<Bank> •••• <4 digit>".
2. Status pembayaran: "Ditransfer" jika run berstatus paid.
3. Tombol Cetak: tampilan slip khusus print (CSS @media print) dengan kop Blue Rose Tech, nama, NIP, divisi, jabatan, dan periode. Cukup memakai window.print(), tidak perlu library PDF.
4. SalaryCard.jsx di beranda: take home pay slip terakhir yang sudah terbit dan tanggal rilis.
5. BenefitsCard.jsx dan bagian "Manfaat & asuransi" di SalaryPage.jsx memakai tabel benefits: BPJS Kesehatan, BPJS Ketenagakerjaan, dan asuransi swasta (nomor kartu, kelas, tanggungan, status).
6. Pastikan karyawan tidak bisa membuka slip orang lain atau slip dari run draft, meskipun mengganti ID di URL atau query (uji lewat RLS).

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

## F. Evaluasi kinerja (KPI)

### 13. Template KPI dan periode penilaian

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Menu HR "Evaluasi kinerja" masih HRPlaceholder. Tabel positions sudah ada. Baca docs/PRD.md user story US-16 dan bagian 6.5.

Tugas: buat pengelolaan template KPI dan periode untuk HR (penilaian dikerjakan di prompt berikutnya).
1. Migrasi: tabel kpi_templates (satu template aktif per jabatan), kpi_indicators (nama, deskripsi, bobot dalam persen, target), dan kpi_periods (nama seperti "Q1 2026", start_date, end_date, deadline, status 'draft','aktif','selesai'). RLS: HR semua; karyawan SELECT template untuk jabatannya dan periode berstatus aktif/selesai.
2. Validasi di database: total bobot indikator dalam satu template harus 100 sebelum template bisa dipakai. Buat fungsi template_is_valid(template_id) dan pakai saat periode diaktifkan.
3. UI HR, tab Template: daftar jabatan dan status templatenya (belum ada / valid / bobot belum 100). Editor template: tambah, ubah, hapus, dan urutkan indikator, dengan total bobot yang tampil langsung. Tombol "Salin dari jabatan lain".
4. UI HR, tab Periode: buat periode per kuartal, atur tenggat, aktifkan, dan tutup. Hanya satu periode yang boleh aktif. Periode hanya bisa diaktifkan jika semua jabatan yang punya karyawan aktif sudah punya template valid. Jika belum, tampilkan daftar jabatan yang kurang.
5. Seed contoh: template untuk 3 jabatan (misal Frontend Developer, HR Generalist, Sales Executive) dengan 4-5 indikator masing-masing, dan periode Q1 2026.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 14. Penilaian KPI dan hasil untuk karyawan

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Template KPI per jabatan dan periode sudah bisa dikelola HR. Baca docs/PRD.md user story US-17, US-18, dan bagian 6.5.

Tugas: buat alur penilaian KPI oleh HR dan halaman hasil untuk karyawan.
1. Migrasi: tabel kpi_reviews (period_id, employee_id, reviewer_id, final_score, grade, note, status 'draft','final') unik per (period_id, employee_id), dan kpi_scores (review_id, indicator_id, score 0-100, note). RLS: HR semua; karyawan hanya SELECT review miliknya yang berstatus final, beserta skornya.
2. Saat periode diaktifkan, buat otomatis satu review draft untuk setiap karyawan aktif, memakai template jabatannya saat itu.
3. RPC save_kpi_scores(p_review_id, p_scores jsonb, p_note): hanya HR, hanya untuk review draft di periode aktif. Validasi skor 0-100 dan semua indikator terisi.
4. RPC finalize_kpi_review(p_review_id): hitung final_score = jumlah(skor x bobot / 100), dibulatkan 1 desimal. Grade: A 85-100, B 70-84, C 55-69, D di bawah 55. Setelah final, skor tidak bisa diubah.
5. UI HR: daftar karyawan di periode aktif dengan status (belum dinilai / draft / final), filter divisi, dan progres "X / Y sudah dinilai". Form penilaian: indikator, bobot, target, input skor, catatan per indikator, skor akhir dan grade yang dihitung langsung saat mengetik.
6. Kartu "Evaluasi kinerja" di beranda HR memakai progres, tenggat, dan rata-rata skor asli.
7. UI karyawan: tambahkan menu "Kinerja" di portal karyawan. Tampilkan hasil final per periode: skor per indikator, skor akhir, grade, catatan HR, dan riwayat periode sebelumnya.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

## G. Beranda, notifikasi, dan deploy

### 15. Beranda karyawan dengan data asli

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Semua modul karyawan (presensi, cuti, slip gaji, manfaat, KPI) sudah tersambung ke Supabase. Beranda karyawan (WelcomeBanner, AttendanceCard, LeaveQuotaCard, SalaryCard, BenefitsCard) mungkin masih ada sisa data hardcoded. Baca docs/PRD.md user story US-19.

Tugas: pastikan beranda karyawan 100% memakai data asli.
1. Cari semua nilai hardcoded yang tersisa di beranda karyawan (nama, tanggal, angka, status) dan ganti dengan data dari Supabase. Laporkan apa saja yang kamu temukan.
2. WelcomeBanner: sapaan sesuai jam WIB (pagi/siang/sore/malam), nama depan, dan tanggal hari ini.
3. Buat satu RPC my_dashboard() yang mengembalikan semua data beranda dalam satu panggilan: status absen hari ini, shift, izin remote hari ini, sisa cuti, pengajuan menunggu, slip terakhir, jumlah manfaat aktif, grade KPI terakhir.
4. Tampilkan skeleton loading dan state kosong yang wajar (misal "Belum ada slip gaji" untuk karyawan baru).
5. Link di setiap kartu tetap mengarah ke halaman detailnya.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 16. Beranda HR dengan data asli

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Semua modul HR sudah tersambung ke Supabase. HRHome di HRDashboard.jsx masih memakai konstanta seperti ATTENDANCE_SPLIT, angka 128/118, dan daftar tasks yang hardcoded. Baca docs/PRD.md user story US-20.

Tugas: pastikan beranda HR 100% memakai data asli.
1. Buat RPC hr_dashboard() (hanya HR) yang mengembalikan: jumlah karyawan aktif, jumlah divisi dan jabatan, kehadiran hari ini per status, jumlah pengajuan menunggu, status dan progres payroll bulan berjalan, progres KPI periode aktif (dinilai/total, rata-rata skor, tenggat).
2. Ganti semua angka hardcoded di HRHome dengan hasil RPC ini.
3. Daftar "Perlu tindakan" dibangun dari data: pengajuan menunggu (dengan tanggal mulai terdekat), presensi di luar radius hari ini (nama dan jarak), KPI belum dinilai (jumlah dan tenggat), dan payroll bulan ini yang masih draft. Urutkan berdasarkan tenggat terdekat. Sembunyikan item yang jumlahnya 0.
4. Tanggal di judul memakai tanggal hari ini (WIB).
5. Tombol "Laporan bulanan" mengunduh CSV rekap bulan berjalan: kehadiran per karyawan (hadir, terlambat, cuti, alpa) dan total payroll.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 17. Notifikasi in-app

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech. Ikon lonceng di TopHeader menerima notifCount tetap (2 untuk karyawan, 5 untuk HR). Baca docs/PRD.md user story US-21.

Tugas: buat notifikasi in-app.
1. Migrasi: tabel notifications (user_id, type, title, body, link, read_at). RLS: user hanya SELECT dan UPDATE read_at miliknya. Insert hanya lewat trigger atau fungsi security definer.
2. Trigger yang membuat notifikasi:
   - Pengajuan baru (cuti/izin/WFH/dinas): ke semua akun HR.
   - Pengajuan disetujui atau ditolak: ke karyawan yang mengajukan, termasuk catatan HR.
   - Payroll run menjadi final: ke semua karyawan di run itu ("Slip gaji <bulan> sudah terbit").
   - Review KPI menjadi final: ke karyawan yang dinilai.
3. TopHeader: badge jumlah belum dibaca. Klik lonceng membuka panel daftar notifikasi terbaru (20 item), klik item menandai dibaca lalu membuka link-nya. Tombol "Tandai semua dibaca".
4. Pakai Supabase Realtime supaya badge dan panel diperbarui tanpa refresh halaman.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```

### 18. Uji keamanan, deploy, dan README

- [ ] Selesai dan dites

```text
Konteks: HRIS Blue Rose Tech sudah lengkap secara fitur. Ini project portofolio yang harus bisa di-demo online. Baca docs/PRD.md bagian 8 dan 9.

Tugas: siapkan rilis demo.
1. Audit RLS: buat file supabase/tests/rls.sql (pgTAP atau skrip SQL biasa) yang membuktikan: karyawan A tidak bisa membaca atau mengubah data karyawan B di setiap tabel; karyawan tidak bisa memanggil RPC khusus HR; karyawan tidak bisa insert langsung ke attendances atau payslips. Laporkan tabel atau RPC yang gagal tes, lalu perbaiki.
2. Cari sisa data hardcoded atau console.log di dashboard/src dan bersihkan.
3. Tambahkan ESLint + Prettier jika belum ada, dan pastikan npm run build lolos tanpa error.
4. Lengkapi seed demo: sekitar 30 karyawan fiktif di 6 divisi, riwayat absen 2 bulan, beberapa pengajuan di semua status, 2 payroll run (satu paid, satu draft), dan satu periode KPI berjalan. Semua nama dan nomor fiktif.
5. Siapkan deploy ke Vercel: vercel.json dengan rewrite SPA ke index.html, daftar environment variable yang perlu diisi, dan Site URL + Redirect URLs Supabase Auth untuk domain Vercel.
6. Hapus folder frontend/ lama jika sudah tidak dipakai (tanyakan dulu ke saya sebelum menghapus).
7. Tulis README.md di root: deskripsi singkat, link demo, akun demo, fitur per role, tech stack, diagram arsitektur (Mermaid), cara setup lokal langkah demi langkah, struktur folder, dan tempat untuk screenshot.

ATURAN:
- Kerjakan HANYA fitur ini. Jangan ubah fitur lain.
- Migrasi baru ditulis di supabase/migrations/<timestamp>_<nama>.sql. Jangan edit migrasi lama.
- Setiap tabel baru wajib RLS aktif: karyawan hanya data miliknya, HR semua data (pakai public.is_hr()).
- Pertahankan gaya UI yang ada (src/components/ui.jsx, token Tailwind yang ada, dark mode, Bahasa Indonesia).
- Jangan pernah menaruh service_role key di frontend.
- Di akhir, tulis: daftar file yang dibuat/diubah, perintah yang harus saya jalankan, dan langkah uji manual.
```
