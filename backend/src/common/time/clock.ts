import { Injectable } from '@nestjs/common';

/**
 * Sumber waktu server. Semua aturan berbasis waktu (absen, job harian)
 * mengambil "sekarang" dari sini, bukan dari client, dan test menggantinya
 * dengan waktu tetap.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
