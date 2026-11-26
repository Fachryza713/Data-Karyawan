import { EARTH_RADIUS_M, GeoService, haversineMeters } from './geo.service.js';

// Jarak acuan untuk bola beradius 6.371 km (radius yang sama dengan versi
// Supabase). 1 derajat busur = 6.371.000 x pi / 180 = 111.194,93 m.
const ONE_DEGREE_M = (EARTH_RADIUS_M * Math.PI) / 180;

describe('haversineMeters', () => {
  it.each([
    [
      'titik yang sama',
      { lat: -6.224889, lng: 106.809889 },
      { lat: -6.224889, lng: 106.809889 },
      0,
      0.001,
    ],
    [
      '1 derajat lintang di meridian',
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      ONE_DEGREE_M,
      0.01,
    ],
    [
      '1 derajat bujur di khatulistiwa',
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      ONE_DEGREE_M,
      0.01,
    ],
    [
      '1 derajat bujur di lintang 60 (separuhnya)',
      { lat: 60, lng: 0 },
      { lat: 60, lng: 1 },
      55_597.4,
      1,
    ],
    [
      'titik berseberangan (setengah keliling bumi)',
      { lat: 0, lng: 0 },
      { lat: 0, lng: 180 },
      Math.PI * EARTH_RADIUS_M,
      0.01,
    ],
    [
      'kutub utara ke kutub selatan',
      { lat: 90, lng: 0 },
      { lat: -90, lng: 0 },
      Math.PI * EARTH_RADIUS_M,
      0.01,
    ],
    [
      'Big Ben London ke Patung Liberty New York (5.574,84 km)',
      { lat: 51.5007, lng: -0.1246 },
      { lat: 40.6892, lng: -74.0445 },
      5_574_840,
      50,
    ],
    [
      '0,0009 derajat ke utara dari kantor Jakarta (sekitar 100 m)',
      { lat: -6.224889, lng: 106.809889 },
      { lat: -6.223989, lng: 106.809889 },
      0.0009 * ONE_DEGREE_M,
      0.01,
    ],
  ])('%s', (_name, a, b, expected, toleranceM) => {
    expect(Math.abs(haversineMeters(a, b) - expected)).toBeLessThanOrEqual(
      toleranceM,
    );
  });

  it('simetris: a ke b sama dengan b ke a', () => {
    const jakarta = { lat: -6.175392, lng: 106.827153 };
    const bandung = { lat: -6.902481, lng: 107.61881 };

    expect(haversineMeters(jakarta, bandung)).toBeCloseTo(
      haversineMeters(bandung, jakarta),
      6,
    );
  });

  it('melewati garis bujur 180 mengambil jalur terpendek', () => {
    expect(
      haversineMeters({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 }),
    ).toBeCloseTo(ONE_DEGREE_M, 2);
  });

  it('GeoService memakai fungsi yang sama', () => {
    const a = { lat: -6.2, lng: 106.8 };
    const b = { lat: -6.21, lng: 106.81 };

    expect(new GeoService().haversineMeters(a, b)).toBe(haversineMeters(a, b));
  });
});
