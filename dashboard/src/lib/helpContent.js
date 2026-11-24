/*
 * Isi halaman Bantuan (statis, tidak disimpan di database).
 * Dipisah per role (employee, hr) lalu per kategori. Setiap jawaban mengikuti
 * perilaku aplikasi yang sebenarnya; perbarui di sini bila aturan di kode berubah.
 *
 * Format jawaban (a): array blok, dirender berurutan:
 *   'teks'              -> paragraf
 *   { steps: [...] }    -> daftar bernomor
 *   { list: [...] }     -> daftar berpoin
 * links: tautan cepat ke halaman terkait di portal yang sama.
 */

const EMPLOYEE = [
  {
    id: 'presensi',
    title: 'Presensi',
    description: 'Absen masuk, absen pulang, dan izin lokasi.',
    items: [
      {
        id: 'absen-ditolak',
        q: 'Kenapa absen saya ditolak?',
        a: [
          'Setiap absen masuk dan pulang memeriksa lokasi GPS Anda di server. Absen ditolak jika:',
          {
            list: [
              'Anda berada di luar radius kantor. Pesan penolakan menyebut jarak Anda saat itu, nama kantor, dan radiusnya. Radius diatur HR per kantor.',
              'Akurasi GPS lebih dari 100 m. Coba lagi di tempat terbuka atau dekat jendela, dan nyalakan Wi-Fi agar lokasi lebih akurat.',
              'Izin lokasi di browser ditolak, atau lokasi tidak didapat dalam 10 detik.',
              'Kantor atau shift Anda belum diatur. Hubungi HR.',
              'Anda sudah absen masuk (atau pulang) hari ini, atau hari ini sudah tercatat sebagai cuti, sakit, atau izin.',
            ],
          },
          'Absen dari luar radius hanya bisa dilakukan pada tanggal yang punya izin WFH atau dinas luar yang sudah disetujui.',
        ],
        links: [{ to: '/app/kehadiran', label: 'Buka Kehadiran & cuti' }],
      },
      {
        id: 'lokasi-android',
        q: 'Bagaimana cara mengizinkan lokasi di Chrome Android?',
        a: [
          {
            steps: [
              'Nyalakan Lokasi di HP: tarik panel notifikasi dari atas layar, lalu ketuk Lokasi.',
              'Buka HRIS di Chrome. Ketuk ikon di sebelah kiri alamat situs, pilih Izin, lalu ubah Lokasi menjadi Izinkan.',
              'Jika situs pernah diblokir: ketuk menu ⋮ > Setelan > Setelan situs > Lokasi, pilih situs HRIS, lalu ubah menjadi Izinkan.',
              'Pastikan Chrome boleh memakai lokasi: buka Setelan HP > Aplikasi > Chrome > Izin > Lokasi, pilih "Izinkan hanya saat aplikasi digunakan", dan aktifkan "Gunakan lokasi akurat".',
              'Muat ulang halaman, lalu tekan tombol absen lagi.',
            ],
          },
          'Nama menu bisa sedikit berbeda tergantung merek dan versi Android.',
        ],
        links: [{ to: '/app/kehadiran', label: 'Coba absen lagi' }],
      },
      {
        id: 'lokasi-iphone',
        q: 'Bagaimana cara mengizinkan lokasi di Safari iPhone?',
        a: [
          {
            steps: [
              'Buka Pengaturan > Privasi & Keamanan > Layanan Lokasi, lalu aktifkan Layanan Lokasi.',
              'Masih di Layanan Lokasi, pilih Situs Web Safari, pilih "Saat Menggunakan App", dan aktifkan Lokasi Akurat.',
              'Buka HRIS di Safari. Ketuk ikon menu halaman (aA) di bilah alamat > Pengaturan Situs Web > Lokasi, lalu pilih Izinkan atau Tanya.',
              'Muat ulang halaman, tekan tombol absen, dan pilih Izinkan jika Safari bertanya.',
            ],
          },
          'Tanpa Lokasi Akurat, iPhone hanya mengirim perkiraan lokasi sehingga akurasinya hampir selalu lebih dari 100 m dan absen ditolak.',
        ],
        links: [{ to: '/app/kehadiran', label: 'Coba absen lagi' }],
      },
      {
        id: 'wfh-dinas',
        q: 'Bisakah saya absen dari rumah atau saat dinas luar?',
        a: [
          'Bisa, asalkan ada pengajuan WFH atau dinas luar yang sudah disetujui HR untuk tanggal tersebut. Tanpa itu, absen di luar radius kantor selalu ditolak.',
          {
            list: [
              'Ajukan lewat Kehadiran & cuti > Ajukan WFH / dinas luar.',
              'Pengajuan paling lambat H-1: tanggal mulai minimal besok.',
              'Dinas luar wajib mengisi lokasi tujuan.',
              'Absen di luar radius hanya terbuka pada tanggal yang disetujui, dan akurasi GPS tetap harus 100 m atau lebih baik.',
              'WFH dan dinas luar tidak mengurangi kuota cuti.',
            ],
          },
        ],
        links: [{ to: '/app/kehadiran', label: 'Ajukan WFH / dinas luar' }],
      },
      {
        id: 'lupa-absen-pulang',
        q: 'Saya lupa absen pulang. Apa yang terjadi?',
        a: [
          'Absen pulang bisa dilakukan sampai pukul 23.59 WIB di hari yang sama, selama Anda berada di dalam radius kantor atau punya izin WFH/dinas untuk hari itu.',
          'Setelah lewat tengah malam, absen pulang hari itu tidak bisa diisi lagi. Jam masuk dan statusnya tetap tercatat, sedangkan kolom Pulang tampil kosong (—).',
          'Aplikasi tidak menyediakan koreksi jam presensi. Jika jam pulang perlu dicatat, hubungi HR dan sebutkan tanggal serta jam pulang Anda.',
        ],
        links: [{ to: '/app/kehadiran', label: 'Lihat riwayat kehadiran' }],
      },
      {
        id: 'terlambat-alpa',
        q: 'Kapan saya tercatat Terlambat, Pulang cepat, atau Alpa?',
        a: [
          {
            list: [
              'Terlambat: absen masuk setelah jam masuk shift ditambah toleransi keterlambatan.',
              'Pulang cepat: absen pulang sebelum jam pulang shift.',
              'Alpa: hari kerja tanpa absen masuk dan tanpa cuti/izin yang disetujui. Sistem menandainya otomatis pukul 23.59 WIB.',
            ],
          },
          'Jika cuti atau sakit untuk hari itu disetujui belakangan, status Alpa otomatis diganti. Sabtu, Minggu, dan hari libur yang didaftarkan HR tidak pernah ditandai Alpa.',
        ],
        links: [{ to: '/app/kehadiran', label: 'Lihat riwayat kehadiran' }],
      },
    ],
  },
  {
    id: 'cuti',
    title: 'Cuti dan izin',
    description: 'Kuota, surat dokter, pembatalan, dan persetujuan.',
    items: [
      {
        id: 'kuota-cuti',
        q: 'Berapa kuota cuti tahunan saya?',
        a: [
          'Kuota cuti tahunan 12 hari kerja per tahun kalender. Sisa kuota tampil di Beranda dan di form pengajuan cuti.',
          {
            list: [
              'Dihitung dalam hari kerja: Sabtu, Minggu, dan hari libur yang didaftarkan HR tidak dihitung.',
              'Pengajuan yang masih menunggu ikut memesan kuota, jadi sisa yang bisa diajukan berkurang sampai pengajuan itu diproses.',
              'Kuota berkurang saat HR menyetujui. Pengajuan yang ditolak atau dibatalkan tidak mengurangi kuota.',
              'Cuti tahunan tidak boleh melewati pergantian tahun. Ajukan terpisah untuk tiap tahun.',
              'Sisa kuota tidak dibawa ke tahun berikutnya. Kuota baru dibuat otomatis setiap 1 Januari.',
              'Sakit dan izin khusus tidak mengurangi kuota.',
            ],
          },
        ],
        links: [
          { to: '/app', label: 'Lihat sisa kuota di Beranda' },
          { to: '/app/kehadiran', label: 'Ajukan cuti' },
        ],
      },
      {
        id: 'surat-dokter',
        q: 'Kapan saya wajib melampirkan surat dokter?',
        a: [
          'Pengajuan Sakit lebih dari 1 hari kerja wajib melampirkan surat dokter. Sakit 1 hari kerja boleh tanpa lampiran.',
          {
            list: [
              'Format JPG, PNG, atau PDF, maksimal 2 MB.',
              'Unggah langsung di form Ajukan cuti / izin dengan jenis Sakit.',
              'Sakit mendadak bisa diajukan setelahnya: tanggal mulai paling lambat 7 hari ke belakang.',
              'Jenis cuti lain boleh menyertakan lampiran, tetapi tidak wajib.',
            ],
          },
        ],
        links: [{ to: '/app/kehadiran', label: 'Ajukan cuti / izin' }],
      },
      {
        id: 'batalkan-pengajuan',
        q: 'Bagaimana cara membatalkan pengajuan?',
        a: [
          {
            steps: [
              'Buka Kehadiran & cuti.',
              'Di kartu Pengajuan saya, cari pengajuan berstatus Menunggu, lalu tekan Batalkan.',
              'Tekan Batalkan pengajuan di jendela konfirmasi.',
            ],
          },
          'Hanya pengajuan yang masih Menunggu yang bisa dibatalkan. Pengajuan yang sudah Disetujui atau Ditolak tidak bisa dibatalkan lewat aplikasi; hubungi HR jika rencana Anda berubah.',
          'Pengajuan yang dibatalkan tidak bisa diaktifkan lagi. Ajukan ulang jika masih diperlukan.',
        ],
        links: [{ to: '/app/kehadiran', label: 'Buka Pengajuan saya' }],
      },
      {
        id: 'lama-persetujuan',
        q: 'Berapa lama pengajuan saya disetujui?',
        a: [
          'Aplikasi tidak menetapkan batas waktu persetujuan. HR memproses pengajuan dari daftar Menunggu.',
          {
            list: [
              'Anda mendapat notifikasi (ikon lonceng) saat pengajuan disetujui atau ditolak.',
              'Jika ditolak, catatan alasan dari HR tampil di kartu Pengajuan saya.',
              'Status tetap Menunggu selama belum diproses. Jika mendekati tanggal mulai belum ada keputusan, hubungi HR lewat kontak di halaman ini.',
            ],
          },
        ],
        links: [{ to: '/app/kehadiran', label: 'Cek status pengajuan' }],
      },
    ],
  },
  {
    id: 'gaji',
    title: 'Gaji dan slip',
    description: 'Jadwal slip, arti potongan, dan cara mencetak.',
    items: [
      {
        id: 'slip-terbit',
        q: 'Kapan slip gaji saya terbit?',
        a: [
          'Slip terbit setelah HR memfinalkan payroll bulan tersebut. Selama payroll masih draft, slip dan nominalnya belum terlihat oleh Anda.',
          {
            list: [
              'Terbit: payroll sudah final, gaji belum ditandai ditransfer.',
              'Ditransfer: HR sudah menandai gaji dibayar. Tanggal transfer tampil di slip.',
              'Anda mendapat notifikasi saat slip terbit.',
              'Jika HR membuka kembali payroll untuk koreksi, slip bulan itu tersembunyi lagi sampai difinalkan ulang.',
            ],
          },
        ],
        links: [{ to: '/app/gaji', label: 'Buka Gaji & manfaat' }],
      },
      {
        id: 'arti-potongan',
        q: 'Apa arti potongan BPJS dan PPh 21 di slip?',
        a: [
          'Potongan dihitung dari gaji pokok + tunjangan tetap (dasar upah). Tarif di bawah adalah tarif yang berlaku saat ini dan bisa berubah mengikuti pengaturan payroll HR.',
          {
            list: [
              'BPJS Kesehatan: 1% bagian karyawan, dengan dasar upah maksimal Rp12.000.000.',
              'JHT (Jaminan Hari Tua, BPJS Ketenagakerjaan): 2% bagian karyawan.',
              'JP (Jaminan Pensiun, BPJS Ketenagakerjaan): 1% bagian karyawan, dengan dasar upah maksimal batas upah JP yang berlaku (Rp10.547.400).',
              'PPh 21: pajak penghasilan bulanan yang dipotong perusahaan. Nominalnya diisi HR saat menyusun payroll.',
              'Lain-lain: potongan di luar BPJS dan pajak, jika ada.',
            ],
          },
          'Iuran bagian perusahaan (BPJS Kesehatan 4%, JHT 3,7%, JP 2%, JKK, dan JKM) dibayar perusahaan dan tidak memotong gaji Anda.',
          'Take home pay = total bruto (gaji pokok + tunjangan tetap + bonus) dikurangi total potongan.',
        ],
        links: [{ to: '/app/gaji', label: 'Lihat rincian slip' }],
      },
      {
        id: 'cetak-slip',
        q: 'Bagaimana cara mencetak atau menyimpan slip gaji?',
        a: [
          {
            steps: [
              'Buka Gaji & manfaat, lalu pilih periode di daftar periode.',
              'Tekan Cetak slip di bawah rincian slip.',
              'Di jendela cetak, pilih printer, atau pilih Simpan sebagai PDF untuk menyimpan file.',
            ],
          },
          'Slip cetak selalu berlatar putih walaupun mode gelap aktif. Simpan file slip di tempat yang aman karena berisi data gaji.',
        ],
        links: [{ to: '/app/gaji', label: 'Buka Gaji & manfaat' }],
      },
    ],
  },
  {
    id: 'akun',
    title: 'Akun dan profil',
    description: 'Foto, data diri, dan kata sandi.',
    items: [
      {
        id: 'ubah-profil',
        q: 'Bagaimana cara mengganti foto dan nomor telepon?',
        a: [
          {
            steps: [
              'Buka Profil, atau ketuk nama Anda di pojok kanan atas.',
              'Foto: tekan Ganti foto, lalu pilih file JPG atau PNG maksimal 2 MB. Tekan Hapus untuk kembali ke inisial nama.',
              'Nomor telepon: isi kolom Nomor telepon, misalnya +62 812-3456-7890, lalu tekan Simpan perubahan.',
            ],
          },
          'Di halaman yang sama Anda juga bisa mengubah nama lengkap, tanggal lahir, dan jenis kelamin.',
        ],
        links: [{ to: '/app/profil', label: 'Buka Profil' }],
      },
      {
        id: 'data-hr',
        q: 'Data apa saja yang hanya bisa diubah HR?',
        a: [
          {
            list: [
              'Email kantor, NIP, tanggal masuk, divisi, dan jabatan. Di halaman Profil, kolom ini tampil terkunci.',
              'Gaji pokok, tunjangan tetap, dan rekening bank.',
              'Kantor dan shift kerja, yang menentukan lokasi dan jam absen Anda.',
              'Data manfaat, misalnya nomor BPJS dan asuransi.',
            ],
          },
          'Jika ada data yang salah, hubungi HR lewat kontak di halaman ini.',
        ],
        links: [{ to: '/app/profil', label: 'Buka Profil' }],
      },
      {
        id: 'lupa-sandi',
        q: 'Saya lupa kata sandi. Bagaimana cara masuk?',
        a: [
          {
            steps: [
              'Di halaman masuk, tekan Lupa kata sandi?',
              'Masukkan email kantor Anda, lalu tekan Kirim link reset.',
              'Buka link di email. Link berlaku 1 jam; periksa juga folder spam.',
              'Buat kata sandi baru minimal 8 karakter, lalu masuk kembali.',
            ],
          },
          'Ingin mengganti kata sandi saat masih masuk? Keluar terlebih dahulu, lalu gunakan Lupa kata sandi? dengan langkah yang sama.',
          'Jika email reset tidak juga masuk, hubungi HR untuk memastikan email kantor Anda benar.',
        ],
      },
    ],
  },
];

const HR = [
  {
    id: 'karyawan',
    title: 'Karyawan dan akun',
    description: 'Menambah karyawan dan undangan login.',
    items: [
      {
        id: 'tambah-karyawan',
        q: 'Bagaimana alur menambah karyawan dan mengirim undangan?',
        a: [
          {
            steps: [
              'Buka Data karyawan > Tambah karyawan, atau tombol Tambah karyawan di Beranda.',
              'Isi data diri dan data organisasi: nama, email kantor, NIP (format BRT-YYYY-NNNN), divisi, jabatan, tanggal masuk, status karyawan, kantor, dan shift.',
              'Isi gaji pokok, tunjangan tetap, bank, dan 4 digit terakhir rekening. Nomor rekening lengkap tidak disimpan.',
              'Biarkan Kirim email undangan aktif, lalu simpan. Karyawan menerima link untuk membuat kata sandi sendiri.',
            ],
          },
          {
            list: [
              'Akun login dibuat otomatis, dan kuota cuti tahun berjalan langsung tersedia.',
              'Matikan Kirim email undangan untuk email demo (.test) yang tidak bisa menerima email.',
              'Undangan tidak sampai? Minta karyawan memakai Lupa kata sandi? di halaman masuk dengan email kantornya.',
              'Kantor dan shift wajib diisi agar karyawan bisa absen.',
            ],
          },
        ],
        links: [
          { to: '/hr/karyawan/baru', label: 'Tambah karyawan' },
          { to: '/hr/karyawan', label: 'Buka Data karyawan' },
        ],
      },
    ],
  },
  {
    id: 'pengajuan',
    title: 'Persetujuan pengajuan',
    description: 'Cuti, sakit, izin, WFH, dan dinas luar.',
    items: [
      {
        id: 'proses-pengajuan',
        q: 'Bagaimana menyetujui atau menolak pengajuan?',
        a: [
          {
            steps: [
              'Buka Kehadiran & cuti. Angka di menu menunjukkan jumlah pengajuan yang menunggu.',
              'Buka pengajuan untuk melihat detail: tanggal, jumlah hari kerja, alasan, lampiran (misalnya surat dokter), dan sisa kuota.',
              'Tekan Setujui, atau tekan Tolak dan isi catatan penolakan (wajib, maksimal 500 karakter). Catatan tampil ke karyawan.',
            ],
          },
          'Setelah disetujui:',
          {
            list: [
              'Cuti tahunan mengurangi kuota. Sisa kuota diperiksa ulang saat itu, jadi persetujuan ditolak jika kuota tidak cukup.',
              'Hari kerja dalam rentang tercatat sebagai cuti, sakit, atau izin di presensi. Hari yang sudah punya absen masuk tidak ditimpa.',
              'WFH atau dinas luar membuka absen di luar radius kantor pada tanggal tersebut.',
              'Karyawan mendapat notifikasi keputusan Anda.',
            ],
          },
          'Pengajuan yang sudah diproses tidak bisa diubah lagi. Anda juga tidak bisa memproses pengajuan milik sendiri; minta HR lain memprosesnya.',
        ],
        links: [{ to: '/hr/kehadiran', label: 'Buka Kehadiran & cuti' }],
      },
    ],
  },
  {
    id: 'payroll',
    title: 'Payroll',
    description: 'Draft, Final, Dibayar, dan koreksi.',
    items: [
      {
        id: 'alur-payroll',
        q: 'Bagaimana alur payroll bulanan?',
        a: [
          {
            steps: [
              'Buat: di Penggajian & manfaat, tekan Buat payroll dan pilih periode. Sistem membuat slip untuk semua karyawan aktif yang punya data gaji; yang belum punya dilewati dan dilaporkan.',
              'Draft: isi bonus, PPh 21, dan catatan per karyawan. BPJS dihitung otomatis dari tarif pengaturan payroll. Tekan Hitung ulang jika data gaji karyawan berubah.',
              'Final: tekan Finalisasi. Slip terbit ke karyawan, mereka mendapat notifikasi, dan angka terkunci.',
              'Dibayar: setelah transfer, tekan Tandai dibayar. Slip karyawan menampilkan tanggal transfer.',
            ],
          },
          'Finalisasi ditolak jika ada slip dengan take home pay negatif. Perbaiki bonus atau PPh 21 terlebih dahulu.',
        ],
        links: [{ to: '/hr/penggajian', label: 'Buka Penggajian & manfaat' }],
      },
      {
        id: 'buka-kembali-payroll',
        q: 'Bagaimana mengoreksi payroll yang sudah final?',
        a: [
          {
            steps: [
              'Buka payroll berstatus Final, lalu tekan Buka kembali.',
              'Isi alasan (wajib, maksimal 500 karakter). Alasan tercatat di audit log.',
              'Payroll kembali ke Draft dan slip bulan itu tersembunyi lagi dari karyawan. Perbaiki angka, lalu tekan Finalisasi lagi.',
            ],
          },
          'Payroll yang sudah ditandai Dibayar tidak bisa dibuka kembali.',
        ],
        links: [{ to: '/hr/penggajian', label: 'Buka Penggajian & manfaat' }],
      },
    ],
  },
  {
    id: 'kpi',
    title: 'Evaluasi kinerja (KPI)',
    description: 'Template, periode, penilaian, dan finalisasi.',
    items: [
      {
        id: 'alur-kpi',
        q: 'Bagaimana alur KPI dari template sampai finalisasi?',
        a: [
          {
            steps: [
              'Template: di Evaluasi kinerja > Template, susun template per jabatan berisi 1–20 indikator dengan total bobot tepat 100%.',
              'Periode: di tab Periode, tekan Buat periode (kuartal Q1–Q4 dan tenggat), lalu tekan Aktifkan. Hanya satu periode yang boleh aktif.',
              'Penilaian: saat periode diaktifkan, sistem membuat penilaian draft untuk setiap karyawan aktif dengan salinan indikator jabatannya. Isi skor 0–100 per indikator di tab Penilaian, lalu simpan.',
              'Finalisasi: setelah semua indikator berskor, tekan Finalisasi. Skor akhir dan grade terkunci.',
              'Tutup periode setelah semua penilaian selesai. Periode yang sudah selesai tidak bisa diubah.',
            ],
          },
          {
            list: [
              'Aktivasi ditolak jika ada jabatan yang punya karyawan aktif tetapi belum punya template valid.',
              'Skor akhir = rata-rata skor berbobot, dibulatkan 1 desimal.',
              'Grade: A 85–100, B 70–84, C 55–69, D di bawah 55.',
              'Hasil KPI hanya terlihat oleh HR. Karyawan tidak melihat KPI di portalnya.',
            ],
          },
        ],
        links: [
          { to: '/hr/kpi/template', label: 'Buka Template KPI' },
          { to: '/hr/kpi/periode', label: 'Buka Periode KPI' },
        ],
      },
    ],
  },
  {
    id: 'pengaturan',
    title: 'Pengaturan',
    description: 'Kantor, radius, shift, hari libur, dan kontak HR.',
    items: [
      {
        id: 'kantor-radius',
        q: 'Bagaimana mengatur kantor dan radius absen?',
        a: [
          {
            steps: [
              'Buka Pengaturan > Kantor, lalu tekan Tambah kantor (atau ikon ubah pada kantor yang ada).',
              'Isi nama, latitude, dan longitude. Saat berada di kantor, Anda bisa menekan Pakai lokasi saya sekarang.',
              'Isi radius dalam meter: default 100, minimal 25.',
              'Cek titiknya lewat Lihat di Google Maps, lalu simpan.',
              'Pasang kantor ke karyawan di Data karyawan.',
            ],
          },
          'Absen juga ditolak jika akurasi GPS ponsel lebih dari 100 m, jadi radius yang terlalu kecil membuat karyawan sering ditolak. Kantor yang masih dipakai karyawan tidak bisa dihapus.',
        ],
        links: [{ to: '/hr/pengaturan/kantor', label: 'Buka Pengaturan kantor' }],
      },
      {
        id: 'shift-libur',
        q: 'Bagaimana mengatur shift dan hari libur?',
        a: [
          {
            list: [
              'Shift: Pengaturan > Shift. Isi jam masuk dan jam pulang (WIB) serta toleransi terlambat dalam menit. Absen masuk setelah jam masuk + toleransi tercatat Terlambat; absen pulang sebelum jam pulang tercatat Pulang cepat.',
              'Hari libur: Pengaturan > Hari libur. Pilih tanggal, isi nama libur, lalu tekan Tambah. Hari libur tidak dihitung sebagai hari kerja untuk cuti dan tidak ditandai Alpa.',
              'Shift yang masih dipakai karyawan tidak bisa dihapus. Pindahkan karyawan ke shift lain terlebih dahulu.',
            ],
          },
        ],
        links: [
          { to: '/hr/pengaturan/shift', label: 'Buka Pengaturan shift' },
          { to: '/hr/pengaturan/libur', label: 'Buka Hari libur' },
        ],
      },
      {
        id: 'kontak-hr',
        q: 'Bagaimana mengubah kontak HR yang dilihat karyawan?',
        a: [
          'Buka Pengaturan > Kontak HR. Isi email, nomor WhatsApp (format 62…), dan jam layanan, lalu tekan Simpan. Karyawan melihat kontak baru saat membuka halaman Bantuan berikutnya.',
          'Kontak admin sistem di halaman ini dikelola oleh tim admin sistem, bukan dari menu Pengaturan.',
        ],
        links: [{ to: '/hr/pengaturan/kontak', label: 'Buka Kontak HR' }],
      },
    ],
  },
  {
    id: 'ekspor',
    title: 'Ekspor data',
    description: 'Unduh data ke CSV.',
    items: [
      {
        id: 'ekspor-csv',
        q: 'Bagaimana mengekspor data ke CSV?',
        a: [
          {
            list: [
              'Log presensi: Kehadiran & cuti > Ekspor. Pilih rentang tanggal (maksimal 93 hari), lalu tekan Unduh CSV. Kolom: nama, NIP, divisi, tanggal, masuk, pulang, status, mode, dan jarak.',
              'Laporan bulanan: Beranda > Laporan bulanan. Berisi rekap kehadiran per karyawan (hadir, terlambat, cuti, sakit/izin, alpa) dan gaji bruto/neto periode payroll yang tampil di Beranda, diakhiri baris total.',
            ],
          },
          'File CSV memakai pemisah koma dan UTF-8, sehingga bisa langsung dibuka di Excel atau Google Sheets.',
        ],
        links: [
          { to: '/hr/kehadiran', label: 'Buka Kehadiran & cuti' },
          { to: '/hr', label: 'Buka Beranda' },
        ],
      },
    ],
  },
];

export const HELP_CONTENT = { employee: EMPLOYEE, hr: HR };

/** Teks polos satu jawaban (untuk pencarian). */
export function answerText(blocks) {
  return blocks
    .map((b) => (typeof b === 'string' ? b : (b.steps ?? b.list ?? []).join(' ')))
    .join(' ');
}
