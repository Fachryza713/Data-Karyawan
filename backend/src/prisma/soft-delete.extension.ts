import { Prisma } from '../generated/prisma/client.js';

/**
 * Soft delete untuk model Employee.
 *
 * Query Employee lewat PrismaService.client otomatis memakai
 * `deletedAt: null`, kecuali pemanggil menulis `deletedAt` sendiri di where:
 *
 *   client.employee.findMany()                                   // aktif saja
 *   client.employee.findMany({ where: { deletedAt: { not: null } } }) // terhapus saja
 *   client.employee.findMany({ where: { ...INCLUDE_DELETED } })       // semua
 *
 * Batasan Prisma: filter ini TIDAK berlaku untuk relasi bertingkat
 * (include/select dari model lain, misalnya department.employees). Di sana
 * tulis filternya sendiri dengan ACTIVE_EMPLOYEE.
 */

/** Filter karyawan yang belum dihapus, untuk relasi bertingkat. */
export const ACTIVE_EMPLOYEE = {
  deletedAt: null,
} as const satisfies Prisma.EmployeeWhereInput;

/**
 * Sebar ke where untuk ikut menyertakan karyawan terhapus. Nilai undefined
 * diabaikan Prisma, tetapi keberadaan key-nya mematikan filter otomatis.
 */
export const INCLUDE_DELETED = {
  deletedAt: undefined,
} as const satisfies Prisma.EmployeeWhereInput;

/** Tambahkan deletedAt = null, kecuali where sudah menyebut deletedAt. */
export function excludeSoftDeleted<W extends object>(where: W | undefined): W {
  if (where !== undefined && Object.hasOwn(where, 'deletedAt')) {
    return where;
  }
  return { ...where, deletedAt: null } as W;
}

type QueryCall<A, R> = {
  args: A;
  query: (args: A) => R;
};

/** Handler query extension: jalankan query dengan where yang sudah difilter. */
export function withSoftDeleteFilter<A extends { where?: object }, R>({
  args,
  query,
}: QueryCall<A, R>): R {
  return query({ ...args, where: excludeSoftDeleted(args?.where) });
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'employee-soft-delete',
  query: {
    employee: {
      findUnique: withSoftDeleteFilter,
      findUniqueOrThrow: withSoftDeleteFilter,
      findFirst: withSoftDeleteFilter,
      findFirstOrThrow: withSoftDeleteFilter,
      findMany: withSoftDeleteFilter,
      count: withSoftDeleteFilter,
      aggregate: withSoftDeleteFilter,
      groupBy: withSoftDeleteFilter,
      // Karyawan terhapus tidak bisa diubah: update gagal P2025 (tidak ditemukan).
      update: withSoftDeleteFilter,
      updateMany: withSoftDeleteFilter,
      updateManyAndReturn: withSoftDeleteFilter,
    },
  },
  model: {
    employee: {
      /** Tandai terhapus. Gagal P2025 jika tidak ada atau sudah terhapus. */
      async softDelete(id: string) {
        const employee = Prisma.getExtensionContext(this);
        return employee.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      },
      /** Batalkan soft delete. Gagal P2025 jika tidak sedang terhapus. */
      async restore(id: string) {
        const employee = Prisma.getExtensionContext(this);
        return employee.update({
          where: { id, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
      },
    },
  },
});
