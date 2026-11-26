import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import { parseDateOnly } from '../../common/validation/date-only.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  AttendanceMode,
  AttendanceStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmployeeMessages } from '../employees/employees.constants.js';
import { HolidayService } from '../settings/holiday.service.js';
import { toCoordinate } from '../settings/office-locations.service.js';
import {
  evaluateClockIn,
  isEarlyLeave,
  isOutsideRadius,
  monthBounds,
  summarizeMonth,
  toWibClock,
  type WibClock,
} from './attendance-rules.js';
import {
  AttendanceMessages,
  MAX_GPS_ACCURACY_M,
  STATUS_LABELS,
} from './attendance.constants.js';
import {
  ATTENDANCE_SELECT,
  type AttendanceRow,
  toAttendanceDto,
} from './attendance.mapper.js';
import type { ClockLocationDto } from './dto/attendance-request.dto.js';
import type {
  AttendanceResponseDto,
  MyMonthlyAttendanceResponseDto,
  TodayAttendanceResponseDto,
} from './dto/attendance-response.dto.js';
import { GeoService } from './geo.service.js';
import {
  REMOTE_WORK_POLICY,
  type RemoteWorkPolicy,
} from './remote-work.policy.js';

/** Data karyawan yang dibutuhkan untuk menilai absen. */
const EMPLOYEE_CONTEXT_SELECT = {
  id: true,
  officeLocation: {
    select: { name: true, latitude: true, longitude: true, radiusM: true },
  },
  shift: {
    select: { startTime: true, endTime: true, lateToleranceMin: true },
  },
} as const satisfies Prisma.EmployeeSelect;

type EmployeeContext = Prisma.EmployeeGetPayload<{
  select: typeof EMPLOYEE_CONTEXT_SELECT;
}>;

type LocationCheck = {
  distanceM: number;
  mode: AttendanceMode;
  lat: Prisma.Decimal;
  lng: Prisma.Decimal;
  accuracyM: Prisma.Decimal;
};

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

/**
 * Presensi karyawan yang sedang login. Semua waktu dari server (Clock) dan
 * dihitung dalam WIB; jarak dihitung server dari koordinat mentah.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidayService,
    private readonly geo: GeoService,
    private readonly clock: Clock,
    @Inject(REMOTE_WORK_POLICY)
    private readonly remoteWork: RemoteWorkPolicy,
  ) {}

  /**
   * Absen masuk. Urutan cek: akurasi GPS, hari kerja, absen yang sudah ada,
   * lokasi (izin WFH/dinas atau radius kantor). Absen ganda ditolak 409,
   * termasuk dua request bersamaan (unique employeeId + date).
   */
  async clockIn(
    userId: string,
    dto: ClockLocationDto,
  ): Promise<AttendanceResponseDto> {
    assertAccuracy(dto.accuracy);
    const now = this.clock.now();
    const wib = toWibClock(now);
    await this.assertWorkingDay(wib);
    const employee = await this.findEmployee(userId);
    const date = parseDateOnly(wib.date);

    const existing = await this.prisma.client.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date } },
      select: ATTENDANCE_SELECT,
    });
    if (existing) {
      throw alreadyRecorded(existing);
    }

    const location = await this.checkLocation(employee, wib.date, dto);
    const { status, lateMinutes } = evaluateClockIn(
      wib.secondsOfDay,
      employee.shift,
    );

    try {
      const row = await this.prisma.client.attendance.create({
        data: {
          employeeId: employee.id,
          date,
          clockInAt: now,
          clockInLat: location.lat,
          clockInLng: location.lng,
          clockInDistanceM: location.distanceM,
          clockInAccuracyM: location.accuracyM,
          mode: location.mode,
          status,
          lateMinutes,
        },
        select: ATTENDANCE_SELECT,
      });
      return toAttendanceDto(row);
    } catch (error) {
      // Request lain menyisipkan baris yang sama di antara cek dan insert.
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(AttendanceMessages.alreadyClockedIn);
      }
      throw error;
    }
  }

  /**
   * Absen pulang. Ditolak jika belum absen masuk hari ini. Pulang sebelum
   * jam pulang shift mengubah status menjadi EARLY_LEAVE (menit terlambat
   * tetap tersimpan).
   */
  async clockOut(
    userId: string,
    dto: ClockLocationDto,
  ): Promise<AttendanceResponseDto> {
    assertAccuracy(dto.accuracy);
    const now = this.clock.now();
    const wib = toWibClock(now);
    await this.assertWorkingDay(wib);
    const employee = await this.findEmployee(userId);

    const existing = await this.prisma.client.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: parseDateOnly(wib.date),
        },
      },
      select: ATTENDANCE_SELECT,
    });
    if (!existing?.clockInAt) {
      throw new UnprocessableEntityException(AttendanceMessages.notClockedIn);
    }
    if (existing.clockOutAt) {
      throw new ConflictException(
        `${AttendanceMessages.alreadyClockedOut} pukul ${toWibClock(existing.clockOutAt).time}`,
      );
    }

    const location = await this.checkLocation(employee, wib.date, dto);
    const status = isEarlyLeave(wib.secondsOfDay, employee.shift)
      ? AttendanceStatus.EARLY_LEAVE
      : existing.status;

    try {
      const row = await this.prisma.client.attendance.update({
        // clockOutAt: null di where: klik ganda bersamaan hanya satu yang berhasil.
        where: { id: existing.id, clockOutAt: null },
        data: {
          clockOutAt: now,
          clockOutLat: location.lat,
          clockOutLng: location.lng,
          clockOutDistanceM: location.distanceM,
          clockOutAccuracyM: location.accuracyM,
          status,
        },
        select: ATTENDANCE_SELECT,
      });
      return toAttendanceDto(row);
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new ConflictException(AttendanceMessages.alreadyClockedOut);
      }
      throw error;
    }
  }

  /** Status absen hari ini beserta aturan shift dan kantor karyawan. */
  async today(userId: string): Promise<TodayAttendanceResponseDto> {
    const wib = toWibClock(this.clock.now());
    const employee = await this.findEmployee(userId);
    const [isWorkingDay, row, remote] = await Promise.all([
      this.holidays.isWorkingDay(wib.date),
      this.prisma.client.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId: employee.id,
            date: parseDateOnly(wib.date),
          },
        },
        select: ATTENDANCE_SELECT,
      }),
      this.remoteWork.hasApprovedRemote(employee.id, wib.date),
    ]);
    return {
      date: wib.date,
      isWorkingDay,
      shift: employee.shift,
      office: {
        name: employee.officeLocation.name,
        radiusM: employee.officeLocation.radiusM,
      },
      approvedRemoteMode: remote?.mode ?? null,
      attendance: row ? toAttendanceDto(row) : null,
    };
  }

  /** Riwayat satu bulan (default bulan ini, WIB) beserta ringkasannya. */
  async myMonth(
    userId: string,
    month?: string,
  ): Promise<MyMonthlyAttendanceResponseDto> {
    const targetMonth = month ?? toWibClock(this.clock.now()).date.slice(0, 7);
    const { from, to } = monthBounds(targetMonth);
    const employee = await this.findEmployee(userId);
    const [rows, workingDays] = await Promise.all([
      this.prisma.client.attendance.findMany({
        where: {
          employeeId: employee.id,
          date: { gte: parseDateOnly(from), lte: parseDateOnly(to) },
        },
        orderBy: { date: 'asc' },
        select: ATTENDANCE_SELECT,
      }),
      this.holidays.workingDaysBetween(from, to),
    ]);
    return {
      month: targetMonth,
      workingDays,
      summary: summarizeMonth(rows),
      items: rows.map(toAttendanceDto),
    };
  }

  private async assertWorkingDay(wib: WibClock): Promise<void> {
    if (!(await this.holidays.isWorkingDay(wib.date))) {
      throw new UnprocessableEntityException(AttendanceMessages.notWorkingDay);
    }
  }

  /** ID karyawan selalu dari akun di JWT, tidak pernah dari parameter. */
  private async findEmployee(userId: string): Promise<EmployeeContext> {
    const employee = await this.prisma.client.employee.findUnique({
      where: { userId },
      select: EMPLOYEE_CONTEXT_SELECT,
    });
    if (!employee) {
      throw new NotFoundException(EmployeeMessages.noEmployeeRecord);
    }
    return employee;
  }

  /**
   * Izin WFH/dinas yang disetujui: diterima dengan mode izinnya. Tanpa izin:
   * harus di dalam radius kantor (422 dengan distanceM dan radiusM).
   * Koordinat dan jarak tetap disimpan di kedua kasus.
   */
  private async checkLocation(
    employee: EmployeeContext,
    date: string,
    dto: ClockLocationDto,
  ): Promise<LocationCheck> {
    const office = employee.officeLocation;
    const lat = toCoordinate(dto.lat);
    const lng = toCoordinate(dto.lng);
    const distanceM = Math.round(
      this.geo.haversineMeters(
        { lat: lat.toNumber(), lng: lng.toNumber() },
        { lat: office.latitude.toNumber(), lng: office.longitude.toNumber() },
      ),
    );
    const remote = await this.remoteWork.hasApprovedRemote(employee.id, date);
    if (!remote && isOutsideRadius(distanceM, office.radiusM)) {
      throw new UnprocessableEntityException({
        message: `Anda di luar radius kantor: ${distanceM} m dari ${office.name} (radius ${office.radiusM} m). Absen di luar kantor butuh izin WFH/dinas yang disetujui.`,
        details: { distanceM, radiusM: office.radiusM },
      });
    }
    return {
      distanceM,
      mode: remote?.mode ?? AttendanceMode.OFFICE,
      lat,
      lng,
      accuracyM: new Prisma.Decimal(dto.accuracy).toDecimalPlaces(
        1,
        Prisma.Decimal.ROUND_HALF_UP,
      ),
    };
  }
}

function assertAccuracy(accuracy: number): void {
  if (accuracy > MAX_GPS_ACCURACY_M) {
    throw new UnprocessableEntityException({
      message: `Akurasi GPS terlalu rendah (${Math.round(accuracy)} m, maksimal ${MAX_GPS_ACCURACY_M} m). Coba lagi di tempat terbuka.`,
      details: {
        accuracyM: Math.round(accuracy),
        maxAccuracyM: MAX_GPS_ACCURACY_M,
      },
    });
  }
}

function alreadyRecorded(existing: AttendanceRow): ConflictException {
  if (existing.clockInAt) {
    return new ConflictException(
      `${AttendanceMessages.alreadyClockedIn} pukul ${toWibClock(existing.clockInAt).time}`,
    );
  }
  return new ConflictException(
    `Kehadiran hari ini sudah tercatat sebagai ${STATUS_LABELS[existing.status]}`,
  );
}
