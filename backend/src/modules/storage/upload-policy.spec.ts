import { BadRequestException } from '@nestjs/common';
import {
  assertUploadAllowed,
  AVATAR_UPLOAD_POLICY,
  detectImageType,
} from './upload-policy.js';

const MB = 1024 * 1024;

describe('assertUploadAllowed (avatar: JPG/PNG maks 2 MB)', () => {
  it.each([
    ['image/jpeg', 245_760],
    ['image/png', 2 * MB],
  ])('menerima %s %d byte', (contentType, size) => {
    expect(() =>
      assertUploadAllowed(AVATAR_UPLOAD_POLICY, { contentType, size }),
    ).not.toThrow();
  });

  it.each(['image/gif', 'image/webp', 'application/pdf', 'text/html'])(
    'menolak tipe %s',
    (contentType) => {
      expect(() =>
        assertUploadAllowed(AVATAR_UPLOAD_POLICY, { contentType, size: 1000 }),
      ).toThrow(
        new BadRequestException(
          'Tipe file harus JPG/PNG (image/jpeg, image/png)',
        ),
      );
    },
  );

  it('menolak file lebih dari 2 MB', () => {
    expect(() =>
      assertUploadAllowed(AVATAR_UPLOAD_POLICY, {
        contentType: 'image/png',
        size: 2 * MB + 1,
      }),
    ).toThrow(new BadRequestException('Ukuran file maksimal 2 MB'));
  });

  it.each([0, -1, 1.5])('menolak ukuran tidak valid %p', (size) => {
    expect(() =>
      assertUploadAllowed(AVATAR_UPLOAD_POLICY, {
        contentType: 'image/png',
        size,
      }),
    ).toThrow('Ukuran file tidak valid');
  });
});

describe('detectImageType (magic bytes)', () => {
  it('mengenali PNG dan JPEG dari isi file', () => {
    expect(
      detectImageType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(
      detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])),
    ).toBe('image/jpeg');
  });

  it('null untuk file lain walau namanya .png (HTML, GIF, kosong)', () => {
    expect(detectImageType(new TextEncoder().encode('<html>'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});
