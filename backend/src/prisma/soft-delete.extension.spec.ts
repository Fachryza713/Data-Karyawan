import { jest } from '@jest/globals';
import {
  ACTIVE_EMPLOYEE,
  excludeSoftDeleted,
  INCLUDE_DELETED,
  withSoftDeleteFilter,
} from './soft-delete.extension.js';

describe('soft delete Employee', () => {
  describe('excludeSoftDeleted', () => {
    it('menambah deletedAt: null jika where kosong', () => {
      expect(excludeSoftDeleted(undefined)).toEqual({ deletedAt: null });
    });

    it('mempertahankan filter lain', () => {
      expect(excludeSoftDeleted({ departmentId: 'd1' })).toEqual({
        departmentId: 'd1',
        deletedAt: null,
      });
    });

    it('tidak menimpa deletedAt yang ditulis pemanggil', () => {
      const onlyDeleted = { deletedAt: { not: null } };
      expect(excludeSoftDeleted(onlyDeleted)).toBe(onlyDeleted);
    });

    it('INCLUDE_DELETED mematikan filter (undefined diabaikan Prisma)', () => {
      const where = excludeSoftDeleted({ ...INCLUDE_DELETED, id: 'e1' });
      expect(where).toEqual({ id: 'e1', deletedAt: undefined });
      expect(Object.hasOwn(where, 'deletedAt')).toBe(true);
    });

    it('tidak mengubah objek where milik pemanggil', () => {
      const where = { id: 'e1' };
      excludeSoftDeleted(where);
      expect(where).toEqual({ id: 'e1' });
    });
  });

  describe('withSoftDeleteFilter (handler query extension)', () => {
    it('meneruskan argumen lain dan memfilter where', async () => {
      const query = jest.fn((args: unknown) => Promise.resolve(args));

      await withSoftDeleteFilter({
        args: { where: { id: 'e1' }, select: { id: true } },
        query,
      });

      expect(query).toHaveBeenCalledWith({
        where: { id: 'e1', deletedAt: null },
        select: { id: true },
      });
    });

    it('tetap aman saat dipanggil tanpa where (count())', async () => {
      const query = jest.fn((args: unknown) => Promise.resolve(args));

      await withSoftDeleteFilter({ args: {}, query });

      expect(query).toHaveBeenCalledWith({ where: { deletedAt: null } });
    });
  });

  it('ACTIVE_EMPLOYEE untuk relasi bertingkat', () => {
    expect(ACTIVE_EMPLOYEE).toEqual({ deletedAt: null });
  });
});
