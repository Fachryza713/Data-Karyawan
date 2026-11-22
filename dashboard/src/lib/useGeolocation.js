import { useCallback, useState } from 'react';

const OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

/** Pesan yang jelas untuk tiap kegagalan Geolocation API. */
export function geolocationMessage(code) {
  switch (code) {
    case 'unsupported':
      return 'Browser ini tidak mendukung lokasi. Gunakan Chrome, Edge, Firefox, atau Safari versi terbaru.';
    case 'insecure':
      return 'Lokasi hanya bisa diakses lewat HTTPS. Buka aplikasi dari alamat https://.';
    case 1: // PERMISSION_DENIED
      return 'Izin lokasi ditolak. Klik ikon gembok di samping alamat situs, izinkan akses Lokasi, lalu coba lagi.';
    case 2: // POSITION_UNAVAILABLE
      return 'GPS tidak tersedia. Aktifkan Lokasi/GPS di perangkat Anda, lalu coba lagi di tempat terbuka.';
    case 3: // TIMEOUT
      return 'Lokasi tidak didapat dalam 10 detik. Pastikan GPS aktif, lalu coba lagi di tempat terbuka.';
    default:
      return 'Lokasi gagal diambil. Coba lagi.';
  }
}

/**
 * Ambil posisi sekali (enableHighAccuracy, timeout 10 detik).
 * getPosition() resolve { lat, lng, accuracy } atau reject Error dengan pesan Bahasa Indonesia.
 */
export function useGeolocation() {
  const [locating, setLocating] = useState(false);

  const getPosition = useCallback(() => new Promise((resolve, reject) => {
    const fail = (code) => reject(new Error(geolocationMessage(code)));
    if (!('geolocation' in navigator)) return fail('unsupported');
    if (!window.isSecureContext) return fail('insecure');

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      (err) => {
        setLocating(false);
        fail(err.code);
      },
      OPTIONS,
    );
    return undefined;
  }), []);

  return { getPosition, locating };
}
