# Backend — Blue Rose Tech HRIS

Folder ini dipersiapkan untuk backend API.

## Belum di-setup

Backend belum dikonfigurasi. Pilihan teknologi yang bisa digunakan:

- **Node.js + Express** — ringan, cepat untuk prototyping
- **Python + FastAPI / Flask** — mudah dipelajari, ecosystem kuat
- **Go + Fiber / Gin** — performa tinggi

## Struktur yang direkomendasikan

```
backend/
├── src/
│   ├── routes/       # endpoint API
│   ├── controllers/  # logika bisnis
│   ├── models/       # skema database
│   ├── middleware/    # auth, logging, dll
│   └── config/       # konfigurasi app & database
├── package.json      # (jika Node.js)
└── .env.example      # template environment variables
```
