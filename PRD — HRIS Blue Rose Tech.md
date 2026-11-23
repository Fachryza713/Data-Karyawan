# PRD — HRIS Blue Rose Tech

Nov 21, 2026 · @A3

## 1. Ringkasan eksekutif

HRIS Blue Rose Tech adalah aplikasi web Human Resource Information System dengan dua portal: **Portal Karyawan** dan **Portal HR & Admin**. V1 mencakup presensi berbasis GPS dengan izin WFH/dinas luar, pengajuan cuti, data karyawan, penggajian otomatis (gaji + BPJS), dan evaluasi kinerja (KPI) per indikator.

Project ini adalah **portofolio pribadi**. Targetnya aplikasi full-stack yang bisa di-demo online lewat satu link, dengan data dan role yang nyata, bukan mock.

**Kondisi saat ini (Nov 2026):**

- Frontend React 18 + Vite 6 + Tailwind 3 + lucide-react sudah ada di `dashboard/`, dengan dua entry: `index.html` (karyawan) dan `hr/index.html` (HR).
- Halaman karyawan sudah jadi secara UI: login, reset password, beranda, profil, kehadiran & cuti, gaji & manfaat.
- Halaman HR sudah jadi: beranda ringkasan dan kehadiran & cuti. Data karyawan, penggajian, dan KPI masih placeholder "Modul ini sedang dikembangkan".
- Semua data masih hardcoded di komponen. Folder `backend/` baru berisi README.
- Ada folder `frontend/` lama (HTML + CSS + JS) yang sudah digantikan oleh `dashboard/`.

## 2. Problem statement

Perusahaan kecil-menengah sering mengelola SDM dengan spreadsheet, grup chat, dan kertas. Akibatnya HR menghabiskan waktu untuk rekap manual, dan karyawan tidak punya satu tempat untuk melihat haknya.

| Pihak | Masalah | Dampak |
| --- | --- | --- |
| HR | Rekap absensi, cuti, dan gaji dilakukan manual tiap bulan | Rawan salah hitung, lambat, sulit diaudit |
| HR | Absen titip atau absen dari rumah tanpa izin sulit dideteksi | Data kehadiran tidak bisa dipercaya |
| HR | Penilaian kinerja tersebar di dokumen terpisah | Bonus dan evaluasi tidak konsisten |
| Karyawan | Tidak tahu sisa cuti, status pengajuan, atau rincian potongan gaji | Banyak pertanyaan berulang ke HR |
| Karyawan | Pengajuan cuti lewat chat tanpa jejak | Pengajuan hilang atau terlambat disetujui |

**Asumsi:** masalah di atas diturunkan dari skenario perusahaan fiktif Blue Rose Tech (128 karyawan, 6 divisi, Head Office Jakarta), sesuai data contoh di UI. Belum ada riset pengguna nyata karena ini portofolio.

## 3. Pengguna dan role

V1 punya dua role. Semua persetujuan (cuti, izin WFH/dinas luar) dilakukan oleh HR, tidak ada tahap atasan.

| Role | Persona contoh | Portal | Kebutuhan utama |
| --- | --- | --- | --- |
| `employee` | Raditya Pratama, Frontend Developer, divisi Teknologi Informasi | Portal Karyawan (`/`) | Absen cepat dari HP, ajukan cuti/izin, lihat sisa cuti, slip gaji, dan BPJS |
| `hr` | Dian Sastro, HR Manager, Human Capital | Portal HR & Admin (`/hr/`) | Kelola data karyawan, setujui pengajuan, pantau presensi, jalankan payroll, isi dan lihat hasil KPI |

Aturan akses:

- Karyawan hanya bisa membaca dan mengubah data miliknya sendiri, dan hanya field data diri (nama tampilan, foto, telepon). Data organisasi (jabatan, divisi, gaji) "Diatur HR".
- HR bisa membaca dan mengubah data semua karyawan.
- Hasil KPI hanya terlihat oleh HR. Karyawan tidak bisa melihat skor, grade, maupun catatan KPI, termasuk penilaian miliknya sendiri.
- Akun `hr` tetap bisa punya data karyawan sendiri (absen, slip gaji), tapi tidak bisa menyetujui pengajuannya sendiri.
- Login karyawan di portal HR ditolak, dan sebaliknya HR diarahkan ke portal HR.

## 4. Arsitektur dan tech stack

Backend memakai **Supabase**, bukan XAMPP. Alasannya: aplikasi bisa di-demo online lewat satu link, dan Auth, Storage, serta RLS sudah tersedia tanpa perlu menulis REST API sendiri.

&#91;embedded content: arsitektur HRIS · frontend Vercel + Supabase\]

Browser hanya memegang anon key. Absen, approval, dan payroll lewat function di server (kotak berwarna), sehingga jarak GPS dan angka gaji tidak bisa diubah dari browser.

| Lapisan | Pilihan | Status |
| --- | --- | --- |
| UI | React 18, Vite 6, Tailwind 3, lucide-react | Sudah ada |
| Routing | React Router (usulan, lihat Open questions) | Belum |
| Data client | `@supabase/supabase-js` v2 | Belum |
| Database | Supabase Postgres + RLS | Belum |
| Auth | Supabase Auth (email + password) | Belum |
| File | Supabase Storage | Belum |
| Logika server | Postgres functions (RPC) + Edge Functions (Deno) | Belum |
| Job terjadwal | pg\_cron | Belum |
| Hosting | Vercel (frontend), Supabase free tier (backend) | Belum |

XAMPP dipertimbangkan, tapi tidak dipilih: hanya jalan lokal dan butuh backend PHP terpisah untuk auth, upload, dan API.

## 5. Fitur dan user stories

Prioritas: **P0** = wajib ada untuk demo, **P1** = masuk V1 tapi boleh menyusul, **P2** = nice-to-have.

### 5.1 Autentikasi (P0)

**US-01** Sebagai pengguna, saya ingin login dengan email kantor dan password, supaya bisa masuk ke portal sesuai role saya.

- [ ] Login memakai Supabase Auth (email + password).
- [ ] Setelah login, role dibaca dari tabel `profiles`. `employee` diarahkan ke `/`, `hr` ke `/hr/`.
- [ ] Pesan error jelas untuk email/password salah, tanpa membocorkan apakah email terdaftar.
- [ ] Sesi tetap aktif setelah refresh. Tombol "Keluar" menghapus sesi.

**US-02** Sebagai pengguna, saya ingin reset password lewat email.

- [ ] Form reset mengirim link reset dari Supabase Auth.
- [ ] Link membuka halaman set password baru, minimal 8 karakter.

Akun dibuat oleh HR (US-10), tidak ada registrasi mandiri.

### 5.2 Presensi (P0)

**US-03** Sebagai karyawan, saya ingin absen masuk dan pulang dari HP, supaya kehadiran tercatat tanpa mesin fingerprint.

- [ ] Tombol Masuk/Pulang meminta izin lokasi browser (Geolocation API).
- [ ] Server menghitung jarak ke kantor (rumus Haversine). Di dalam radius: absen diterima. Di luar radius tanpa izin WFH/dinas yang disetujui: absen ditolak dengan pesan "Absen hanya bisa dilakukan di dalam radius kantor" + jarak saat ini.
- [ ] Tercatat: waktu, koordinat, jarak (meter), akurasi GPS, mode (`office` / `wfh` / `dinas`).
- [ ] Status otomatis: Tepat waktu atau Terlambat (dibanding jam shift + toleransi).
- [ ] Hanya satu absen masuk dan satu absen pulang per hari. Pulang tidak bisa sebelum masuk.
- [ ] Lokasi ditolak atau GPS tidak tersedia: tampil pesan cara mengaktifkan lokasi, absen tidak tercatat.

**US-04** Sebagai karyawan, saya ingin mengajukan izin WFH atau dinas luar, supaya bisa absen dari luar kantor.

- [ ] Form: jenis (WFH / dinas luar), tanggal mulai–selesai, alasan, lokasi tujuan (dinas luar).
- [ ] Status: Menunggu, Disetujui, Ditolak. Hanya yang Disetujui membuka absen di luar radius pada tanggal tersebut.
- [ ] Absen WFH/dinas tetap merekam koordinat untuk jejak audit, tanpa batas radius.

**US-05** Sebagai karyawan, saya ingin melihat riwayat kehadiran per bulan.

- [ ] Tabel tanggal, jam masuk, jam pulang, status, mode. Filter bulan.
- [ ] Ringkasan bulan: hadir, terlambat, cuti, alpa.

**US-06** Sebagai HR, saya ingin memantau log presensi harian.

- [ ] Tabel semua karyawan per tanggal dengan filter divisi dan status (Tepat waktu, Terlambat, Cuti/sakit, Di luar radius, Belum absen).
- [ ] Ringkasan hari ini: jumlah per status, seperti di Beranda HR.
- [ ] Ekspor CSV untuk rentang tanggal.

**US-07** Sebagai HR, saya ingin mengatur lokasi kantor dan shift.

- [ ] CRUD kantor: nama, latitude, longitude, radius (meter, default 100).
- [ ] CRUD shift: nama, jam masuk, jam pulang, toleransi terlambat (menit). Default 08:30–17:30.
- [ ] Setiap karyawan punya satu kantor dan satu shift.

### 5.3 Cuti dan izin (P0)

**US-08** Sebagai karyawan, saya ingin mengajukan cuti tahunan, sakit, atau izin khusus.

- [ ] Form: jenis, tanggal mulai–selesai, alasan, lampiran.
- [ ] Sakit lebih dari 1 hari wajib lampiran surat dokter (JPG/PNG/PDF, maks 2 MB) ke Supabase Storage.
- [ ] Cuti tahunan tidak bisa melebihi sisa kuota. Sisa kuota tampil di form.
- [ ] Pengajuan tidak bisa tumpang tindih dengan pengajuan lain yang Menunggu atau Disetujui.
- [ ] Karyawan bisa membatalkan pengajuan yang masih Menunggu.

**US-09** Sebagai HR, saya ingin menyetujui atau menolak pengajuan cuti, sakit, izin, WFH, dan dinas.

- [ ] Daftar pengajuan Menunggu, urut tanggal mulai terdekat. Badge jumlah di sidebar.
- [ ] Detail pengajuan menampilkan lampiran (misal surat dokter) dan sisa kuota.
- [ ] Setuju atau Tolak, dengan catatan wajib saat menolak.
- [ ] Disetujui: kuota cuti tahunan berkurang, dan hari tersebut tercatat Cuti/Sakit di presensi.

### 5.4 Data karyawan (P0)

**US-10** Sebagai HR, saya ingin menambah karyawan baru.

- [ ] Form: nama, email kantor, NIP (format `BRT-YYYY-NNNN`), divisi, jabatan, tanggal masuk, status (tetap / kontrak), kantor, shift, gaji pokok, tunjangan, data BPJS, rekening bank.
- [ ] Simpan membuat akun Supabase Auth dan mengirim email undangan set password (lewat Edge Function, karena butuh service role key).
- [ ] NIP dan email harus unik.

**US-11** Sebagai HR, saya ingin mencari, melihat, mengubah, dan menonaktifkan karyawan.

- [ ] Tabel dengan pencarian nama/NIP dan filter divisi/status.
- [ ] Nonaktif (soft delete): tidak bisa login, tidak ikut payroll, riwayat tetap tersimpan.
- [ ] CRUD master divisi dan jabatan.

**US-12** Sebagai karyawan, saya ingin melihat dan mengubah data diri.

- [ ] Ubah foto (JPG/PNG maks 2 MB), nama tampilan, nomor telepon.
- [ ] Data organisasi tampil read-only dengan label "Diatur HR".

### 5.5 Penggajian dan manfaat (P0)

**US-13** Sebagai HR, saya ingin menjalankan payroll bulanan.

- [ ] Pilih periode (bulan), sistem membuat draft slip untuk semua karyawan aktif.
- [ ] Dihitung otomatis: gaji pokok, tunjangan tetap, potongan BPJS Kesehatan dan BPJS Ketenagakerjaan bagian karyawan (lihat bagian 6.4).
- [ ] HR mengisi bonus per karyawan secara manual (opsional catatan).
- [ ] Status payroll: Draft, Final, Dibayar. Slip baru terlihat oleh karyawan setelah Final.
- [ ] Slip Final tidak bisa diubah. Koreksi lewat payroll ulang setelah dibuka kembali oleh HR.

**US-14** Sebagai karyawan, saya ingin melihat dan mencetak slip gaji.

- [ ] Pilih periode. Tampil penerimaan, potongan, take home pay, rekening tujuan (4 digit terakhir).
- [ ] Periode yang belum Final tampil "Belum terbit".
- [ ] Tombol Cetak menghasilkan tampilan siap print / PDF lewat browser.

**US-15** Sebagai karyawan, saya ingin melihat info BPJS dan asuransi.

- [ ] Kartu BPJS Kesehatan, BPJS Ketenagakerjaan (JHT, JKK, JKM, JP), dan asuransi swasta: nomor kartu, kelas, tanggungan, status Aktif.

### 5.6 Evaluasi kinerja / KPI (P1)

**US-16** Sebagai HR, saya ingin membuat template KPI per jabatan.

- [ ] Template berisi indikator: nama, deskripsi, bobot (%), target.
- [ ] Total bobot satu template harus 100%.

**US-17** Sebagai HR, saya ingin menilai karyawan per kuartal.

- [ ] Pilih periode (misal Q1 2026) dan karyawan. Isi skor 0–100 per indikator + catatan.
- [ ] Skor akhir = jumlah (skor × bobot). Grade otomatis (bagian 6.5).
- [ ] Progres penilaian tampil di Beranda HR (misal 108 / 128 sudah dinilai) dengan tenggat.
- [ ] Status: Draft, Final. Hasil KPI hanya terlihat oleh HR, juga setelah Final.

### 5.7 Beranda dan notifikasi (P1)

**US-19** Beranda karyawan: status absen hari ini, sisa cuti, slip terakhir, ringkasan manfaat. Data nyata dari database.

**US-20** Beranda HR: karyawan aktif, hadir hari ini, cuti menunggu, progres payroll, daftar "Perlu tindakan", komposisi kehadiran, progres KPI.

**US-21** Notifikasi in-app (ikon lonceng): pengajuan disetujui/ditolak (karyawan), pengajuan baru (HR), slip terbit (karyawan). (P2: email notifikasi.)

### 5.8 Lain-lain

- Dark mode dan toggle Bahasa Indonesia / English sudah ada di UI. V1 cukup Bahasa Indonesia; English P2.
- Pencarian global di header (P2).

## 6. Aturan bisnis

### 6.1 Presensi GPS

1. Karyawan menekan Masuk atau Pulang. Browser mengambil koordinat (`enableHighAccuracy: true`, timeout 10 detik).
2. Koordinat dikirim ke Postgres function `clock_in(lat, lng, accuracy)` / `clock_out(...)`. Jarak dihitung di server, bukan di browser, supaya tidak bisa dimanipulasi dari DevTools.
3. Function mengecek pengajuan WFH/dinas yang Disetujui untuk hari ini:
   - Ada: absen diterima dengan mode `wfh` atau `dinas`, koordinat tetap disimpan.
   - Tidak ada dan jarak <= radius kantor: diterima, mode `office`.
   - Tidak ada dan jarak > radius: ditolak, response berisi jarak (meter).
4. Akurasi GPS > 100 m: absen ditolak, karyawan diminta mencoba di tempat terbuka.
5. Status masuk: `Tepat waktu` jika <= jam masuk + toleransi, selain itu `Terlambat` beserta menit keterlambatan.
6. Pulang sebelum jam pulang shift dicatat sebagai `Pulang cepat`.
7. Hari tanpa absen dan tanpa cuti/izin yang disetujui ditandai `Alpa` oleh job harian (pg\_cron) pukul 23:59 WIB.

Zona waktu semua perhitungan: Asia/Jakarta (WIB). Hari libur nasional dan Sabtu–Minggu tidak dihitung hari kerja; daftar libur dikelola HR.

### 6.2 Izin WFH dan dinas luar

- Diajukan paling lambat H-1, kecuali HR menyetujui pengajuan di hari yang sama.
- Satu pengajuan bisa beberapa hari. Absen di luar radius hanya terbuka pada tanggal yang disetujui.
- WFH dan dinas tidak mengurangi kuota cuti.

### 6.3 Cuti

| Jenis | Kuota | Lampiran | Mengurangi kuota |
| --- | --- | --- | --- |
| Cuti tahunan | 12 hari kerja per tahun kalender | Tidak | Ya |
| Sakit | Tidak terbatas | Surat dokter wajib jika > 1 hari | Tidak |
| Izin khusus (menikah, duka, dll) | Sesuai jenis, diatur HR | Opsional | Tidak |

- Jumlah hari dihitung dalam hari kerja (tanpa akhir pekan dan libur).
- Karyawan dengan masa kerja < 12 bulan: kuota proporsional. → Asumsi, bisa disederhanakan menjadi 12 hari untuk semua.
- Sisa kuota tidak dibawa ke tahun berikutnya.

### 6.4 Penggajian

```latex
\text{Bruto} = \text{Gaji pokok} + \text{Tunjangan tetap} + \text{Bonus}
```

```latex
\text{Take home pay} = \text{Bruto} - \text{BPJS karyawan} - \text{PPh 21} - \text{Potongan lain}
```

- Gaji pokok dan tunjangan tetap diambil dari data karyawan, otomatis tiap periode.
- Bonus diinput manual oleh HR per karyawan per periode. Default 0.
- Potongan BPJS bagian karyawan dihitung otomatis dari tarif di tabel `payroll_settings`. Tarif tidak di-hardcode, karena batas upah berubah tiap tahun.

| Program | Karyawan | Perusahaan | Dasar upah |
| --- | --- | --- | --- |
| BPJS Kesehatan | 1% | 4% | Gaji pokok + tunjangan tetap, maks Rp12.000.000 |
| JHT | 2% | 3,7% | Gaji pokok + tunjangan tetap |
| Jaminan Pensiun (JP) | 1% | 2% | Maks batas upah JP tahun berjalan (Rp10.547.400 sejak Maret 2025) |
| JKK | 0% | 0,24% (risiko sangat rendah) | Gaji pokok + tunjangan tetap |
| JKM | 0% | 0,3% | Gaji pokok + tunjangan tetap |

Bagian perusahaan ditampilkan di laporan HR, bukan memotong slip karyawan. Batas upah JP 2026 perlu dicek ulang di BPJS Ketenagakerjaan sebelum demo ([sumber 2025](https://ramco.com/hubfs/compliance-portal/surat-informasi-ketentuan-batasan-upah-jaminan-pensiun-tahun-2025.pdf)).

PPh 21: lihat Open questions (bagian 10).

- Pembulatan ke rupiah terdekat.
- Karyawan yang masuk atau keluar di tengah bulan: gaji prorata berdasarkan hari kerja. → Asumsi, bisa ditunda ke V2.

### 6.5 KPI

```latex
\text{Skor akhir} = \sum_{i=1}^{n} \text{skor}_i \times \frac{\text{bobot}_i}{100}
```

| Grade | Rentang skor |
| --- | --- |
| A | 85–100 |
| B | 70–84 |
| C | 55–69 |
| D | < 55 |

- Periode per kuartal (Q1–Q4). Tenggat pengisian diatur HR per periode.
- Template mengikuti jabatan karyawan saat periode dibuka. Perubahan template tidak mengubah penilaian yang sudah Final.
- Skor KPI tidak otomatis mengubah bonus. HR memakainya sebagai acuan saat input bonus manual.
- Hasil KPI hanya terlihat oleh HR. Karyawan tidak bisa membaca tabel KPI (template, indikator, periode, penilaian, skor), tidak ada menu Kinerja atau kartu KPI di Portal Karyawan, dan karyawan tidak menerima notifikasi saat penilaiannya difinalkan.

## 7. Model data

Semua tabel di schema `public` Supabase (Postgres), dengan `id uuid`, `created_at`, `updated_at`. `profiles.id` = `auth.users.id`.

&#91;embedded content: ERD backend · 22 tabel dalam 6 kelompok\]

Panah menunjuk dari tabel yang memegang foreign key ke tabel yang dirujuk. Hampir semua tabel modul merujuk `profiles` lewat `employee_id`. Relasi lintas kelompok yang tidak digambar: `kpi_templates.position_id` ke `positions`, `requests.reviewed_by` dan `kpi_reviews.reviewer_id` ke `profiles` (HR).

| Tabel | Kolom utama | Catatan |
| --- | --- | --- |
| `profiles` | id, nip, full\_name, email, phone, gender, birth\_date, photo\_url, role (`employee`/`hr`), division\_id, position\_id, office\_id, shift\_id, join\_date, employment\_status, is\_active | Satu baris per akun |
| `divisions` | id, name | 6 divisi contoh |
| `positions` | id, name, division\_id | 18 jabatan contoh |
| `offices` | id, name, latitude, longitude, radius\_m | Head Office Jakarta |
| `shifts` | id, name, start\_time, end\_time, late\_tolerance\_min | 08:30–17:30 |
| `holidays` | date, name | Libur nasional |
| `attendances` | id, employee\_id, date, clock\_in\_at, clock\_in\_lat, clock\_in\_lng, clock\_in\_distance\_m, clock\_in\_accuracy\_m, clock\_out\_at, clock\_out\_lat, clock\_out\_lng, mode (`office`/`wfh`/`dinas`), status, late\_minutes | Unik per (employee\_id, date) |
| `leave_types` | id, code, name, annual\_quota, deducts\_quota, requires\_attachment\_after\_days | Tahunan, sakit, izin khusus |
| `leave_balances` | employee\_id, year, quota, used | Sisa = quota − used |
| `requests` | id, employee\_id, kind (`leave`/`wfh`/`dinas`), leave\_type\_id, start\_date, end\_date, working\_days, reason, destination, attachment\_path, status, reviewed\_by, reviewed\_at, review\_note | Satu tabel untuk cuti dan izin kerja di luar kantor |
| `salary_components` | employee\_id, base\_salary, fixed\_allowance, bank\_name, bank\_account\_last4, bpjs\_kes\_no, bpjs\_tk\_no, effective\_from | Riwayat perubahan gaji |
| `payroll_settings` | key, value, effective\_from | Tarif dan batas upah BPJS |
| `payroll_runs` | id, period (YYYY-MM), status (`draft`/`final`/`paid`), finalized\_by, finalized\_at | Satu per bulan |
| `payslips` | id, run\_id, employee\_id, base\_salary, allowance, bonus, gross, bpjs\_kes, bpjs\_jht, bpjs\_jp, pph21, other\_deductions, net, employer\_contributions (jsonb) | Snapshot angka, tidak dihitung ulang |
| `benefits` | employee\_id, provider, program, card\_no, class, dependents, status | BPJS dan asuransi swasta |
| `kpi_templates` | id, position\_id, name | Per jabatan |
| `kpi_indicators` | id, template\_id, name, description, weight, target | Total bobot 100 |
| `kpi_periods` | id, name (Q1 2026), start\_date, end\_date, deadline, status |  |
| `kpi_reviews` | id, period\_id, employee\_id, reviewer\_id, final\_score, grade, note, status |  |
| `kpi_scores` | review\_id, indicator\_id, score, note | Skor 0–100 |
| `notifications` | id, user\_id, type, title, body, link, read\_at | In-app |
| `audit_logs` | id, actor\_id, action, table\_name, record\_id, diff (jsonb) | Perubahan oleh HR |

Storage buckets: `avatars` (publik baca, tulis hanya pemilik) dan `attachments` (privat: pemilik dan HR).

## 8. Kebutuhan non-fungsional dan keamanan

| Area | Kebutuhan |
| --- | --- |
| Keamanan data | Row Level Security aktif di semua tabel. Policy: karyawan `select` baris miliknya (`employee_id = auth.uid()`), kecuali tabel KPI yang hanya bisa dibaca HR; HR `select/insert/update` semua. Tidak ada `delete` dari client. |
| Logika sensitif | Absen, approval, payroll, dan KPI final lewat Postgres function `security definer` atau Edge Function. Client tidak pernah menulis langsung ke `attendances` dan `payslips`. |
| Secret | Hanya `anon key` di frontend (`.env`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). `service_role key` hanya di Edge Function. `.env` masuk `.gitignore`. |
| Data pribadi | Nomor rekening disimpan 4 digit terakhir saja. Data demo memakai nama dan nomor fiktif. Lokasi GPS hanya direkam saat absen. |
| Audit | Setiap approval, perubahan gaji, finalisasi payroll, dan perubahan data karyawan oleh HR tercatat di `audit_logs`. |
| Performa | Halaman utama tampil < 2 detik di 4G. Query list memakai pagination (25 baris). |
| Responsif | Portal Karyawan mobile-first (absen dari HP). Portal HR desktop-first, tetap bisa dipakai di tablet. |
| Aksesibilitas | Navigasi keyboard, label ARIA, kontras cukup di light dan dark mode (sudah sebagian di UI). |
| Browser | Chrome, Edge, Firefox, Safari versi terbaru. Geolocation butuh HTTPS (otomatis di Vercel). |
| Kualitas kode | ESLint + Prettier. Migrasi database lewat Supabase CLI (`supabase/migrations`) supaya bisa direproduksi. Seed data demo. |

## 9. Metrik keberhasilan

Karena ini portofolio, sukses diukur dari kelengkapan dan kualitas demo, bukan jumlah pengguna.

| Metrik | Target |
| --- | --- |
| Semua user story P0 lolos acceptance criteria | 100% |
| Demo online | Satu URL publik (Vercel) + akun demo `employee` dan `hr` di README |
| Alur end-to-end tanpa error | Absen > ajukan cuti > HR setujui > payroll > karyawan lihat slip |
| Data hardcoded di komponen | 0, semua dari Supabase |
| Uji RLS | Karyawan A tidak bisa membaca data karyawan B (diuji manual + test SQL) |
| Lighthouse (Portal Karyawan, mobile) | Performance dan Accessibility >= 90 |
| Dokumentasi | README berisi screenshot, arsitektur, cara setup lokal, dan skema database |

## 10. Out of scope, risiko, urutan kerja, open questions

### Out of scope V1

- Role Atasan/Manager dan approval bertingkat. Semua approval oleh HR.
- Foto selfie atau face recognition saat absen.
- Multi kantor per karyawan dan shift rotasi. Satu karyawan = satu kantor, satu shift.
- Lembur dan perhitungan upah lembur.
- Pinjaman/kasbon karyawan, reimbursement.
- Transfer gaji otomatis ke bank, e-SPT / pelaporan pajak ke DJP.
- Rekrutmen, onboarding, training.
- Aplikasi mobile native. Cukup web responsif (bisa PWA di V2).
- Email notifikasi dan bahasa English (P2).

### Risiko

| Risiko | Mitigasi |
| --- | --- |
| GPS di laptop/indoor tidak akurat, absen sering ditolak | Batas akurasi 100 m, pesan jelas, radius kantor bisa diatur HR |
| Lokasi palsu (fake GPS app) | Diakui sebagai batasan web. Simpan akurasi + koordinat untuk audit HR. |
| RLS salah konfigurasi, data bocor antar karyawan | Tulis test policy, uji dengan dua akun demo sebelum rilis |
| Aturan BPJS/PPh 21 berubah | Tarif di `payroll_settings`, bukan di kode |
| Free tier Supabase pause setelah 7 hari tidak aktif | Catat di README, atau jadwalkan ping berkala |
| Scope V1 terlalu besar untuk dikerjakan sendiri | Kerjakan berurutan per modul, KPI (P1) terakhir |

### Urutan kerja

1. Setup Supabase project, migrasi skema, RLS, seed data demo.
2. Auth: login, reset password, redirect per role, proteksi route.
3. Data karyawan (HR) + profil (karyawan). Fondasi untuk modul lain.
4. Presensi GPS + izin WFH/dinas + log presensi HR.
5. Cuti + approval HR.
6. Payroll + slip gaji + manfaat.
7. KPI.
8. Beranda dengan data nyata, notifikasi, deploy Vercel, README.

### Open questions

- [ ] **PPh 21:** dihitung otomatis (metode TER sesuai PP 58/2023, butuh status PTKP per karyawan) atau diinput manual oleh HR seperti bonus? Usulan: manual di V1, otomatis di V2.
- [ ] Frontend tetap dua entry (`/` dan `/hr/`) atau digabung jadi satu app dengan React Router dan redirect per role? Usulan: satu app + React Router, supaya auth guard cukup satu.
- [ ] Folder `frontend/` lama (HTML/CSS/JS) dihapus atau disimpan?
- [ ] Kuota cuti proporsional untuk karyawan < 12 bulan, atau rata 12 hari?
- [ ] Radius default kantor: 100 m cukup?
