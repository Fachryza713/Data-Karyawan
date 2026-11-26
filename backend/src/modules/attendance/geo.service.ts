import { Injectable } from '@nestjs/common';

/** Koordinat dalam derajat desimal. */
export type LatLng = { lat: number; lng: number };

/** Radius rata-rata bumi (meter), sama dengan haversine_m versi Supabase. */
export const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Jarak lingkaran besar antara dua titik (meter), rumus Haversine.
 * Fungsi murni: tanpa I/O dan tanpa state.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  // min(1, ...) mencegah asin() NaN akibat pembulatan float untuk titik berseberangan.
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Perhitungan jarak untuk presensi. Jarak selalu dihitung di server dari
 * koordinat mentah client; client tidak pernah mengirim jarak.
 */
@Injectable()
export class GeoService {
  haversineMeters(a: LatLng, b: LatLng): number {
    return haversineMeters(a, b);
  }
}
