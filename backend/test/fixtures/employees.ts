import { jest } from '@jest/globals';
import type { StorageService } from '../../src/modules/storage/storage.service.js';
import type { EmployeeRow } from '../../src/modules/employees/employee.select.js';
import { EmployeeSerializer } from '../../src/modules/employees/employee.serializer.js';

// Data dan mock bersama untuk unit test modul karyawan. Disimpan di test/
// supaya tidak ikut ter-build ke dist/.

export const IDS = {
  employee: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10',
  user: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e11',
  department: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e01',
  otherDepartment: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e05',
  position: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e02',
  officeLocation: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e03',
  shift: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e04',
} as const;

export function employeeRow(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: IDS.employee,
    userId: IDS.user,
    nip: 'BRT-2024-0003',
    fullName: 'Raditya Pratama',
    phone: '0812-3456-7890',
    gender: 'MALE',
    birthDate: new Date('1998-04-12T00:00:00.000Z'),
    photoKey: null,
    departmentId: IDS.department,
    positionId: IDS.position,
    officeLocationId: IDS.officeLocation,
    shiftId: IDS.shift,
    joinDate: new Date('2024-03-01T00:00:00.000Z'),
    employmentStatus: 'PERMANENT',
    deletedAt: null,
    createdAt: new Date('2026-11-25T01:00:00.000Z'),
    updatedAt: new Date('2026-11-25T01:00:00.000Z'),
    user: {
      email: 'raditya@bluerose.test',
      role: 'EMPLOYEE',
      isActive: true,
    },
    department: { id: IDS.department, name: 'Teknologi Informasi' },
    position: { id: IDS.position, name: 'Frontend Developer' },
    officeLocation: { id: IDS.officeLocation, name: 'Head Office Jakarta' },
    shift: {
      id: IDS.shift,
      name: 'Reguler',
      startTime: '08:30',
      endTime: '17:30',
      lateToleranceMin: 15,
    },
    ...overrides,
  };
}

/** Argumen query Prisma yang diperiksa di test. */
export type QueryArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: unknown;
  orderBy?: unknown;
  skip?: number;
  take?: number;
};

export const queryMock = () => jest.fn<(args: QueryArgs) => Promise<unknown>>();

/** Storage palsu: presigned URL dibuat dari key, tanpa jaringan. */
export function storageMock() {
  return {
    createPresignedDownload: jest.fn((key: string) =>
      Promise.resolve(`https://storage.test/${key}?signed=1`),
    ),
    createPresignedUpload: jest.fn(
      (key: string, _contentType: string, maxBytes: number) =>
        Promise.resolve({
          key,
          url: 'https://storage.test/hris-files',
          fields: { key, Policy: 'p' },
          maxBytes,
          expiresAt: new Date('2026-11-26T03:05:00.000Z'),
        }),
    ),
    stat: jest.fn<StorageService['stat']>(),
    readStart: jest.fn<StorageService['readStart']>(),
    delete: jest.fn<StorageService['delete']>().mockResolvedValue(undefined),
  };
}

export function serializerWith(storage: ReturnType<typeof storageMock>) {
  return new EmployeeSerializer(storage as unknown as StorageService);
}
