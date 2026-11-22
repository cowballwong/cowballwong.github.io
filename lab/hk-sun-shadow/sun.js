// HK Sun Shadow: sun position for Hong Kong.
// The NOAA Solar Calculator equations (NOAA Global Monitoring Laboratory, after Meeus, "Astronomical Algorithms"),
// including NOAA's own atmospheric refraction correction, so the numbers can be checked line for line against
// https://gml.noaa.gov/grad/solcalc/ . Hong Kong Time = UTC+8, no daylight saving.
// Checked 22 Nov 2026 against the NOAA calculator for Hong Kong on 21 Dec and 21 Jun at 12:00 HKT
// (see 03_WIP/01_Documents/solar_check.md).

export const HKT_OFFSET_H = 8;
const D = Math.PI / 180;

// Julian day of a UTC instant (milliseconds since 1970-01-01T00:00Z)
const julianDay = (ms) => ms / 86400000 + 2440587.5;

// ms of a Hong Kong clock time on a calendar date
export function hktToMs(y, m, d, minutesOfDay) {
  return Date.UTC(y, m - 1, d, 0, 0, 0) + (minutesOfDay - HKT_OFFSET_H * 60) * 60000;
}

function refraction(elev) {                     // degrees, NOAA's piecewise fit
  if (elev > 85) return 0;
  const te = Math.tan(elev * D);
  let r;
  if (elev > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) r = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else r = -20.774 / te;
  return r / 3600;
}

// sun position at a UTC instant. Returns degrees: elevation (refraction corrected, as NOAA shows it),
// geometric elevation, azimuth clockwise from true north, declination; equation of time in minutes.
export function sunPosition(ms, lat, lon) {
  const T = (julianDay(ms) - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * D) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * D) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * D) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D);
  const decl = Math.asin(Math.sin(eps * D) * Math.sin(lambda * D)) / D;
  const y = Math.tan((eps / 2) * D) ** 2;
  const eqTime = 4 / D * (y * Math.sin(2 * L0 * D) - 2 * e * Math.sin(M * D) + 4 * e * y * Math.sin(M * D) * Math.cos(2 * L0 * D)
    - 0.5 * y * y * Math.sin(4 * L0 * D) - 1.25 * e * e * Math.sin(2 * M * D));
  const utcMin = ((ms / 60000) % 1440 + 1440) % 1440;
  let tst = (utcMin + eqTime + 4 * lon) % 1440; if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180; if (ha < -180) ha += 360;
  const la = lat * D, de = decl * D;
  const cz = Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha * D)));
  const zen = Math.acos(cz) / D;
  const elevGeo = 90 - zen;
  const sz = Math.sin(zen * D);
  let az;
  if (Math.abs(sz) < 1e-9) az = 180;
  else {
    const ca = Math.max(-1, Math.min(1, (Math.sin(la) * Math.cos(zen * D) - Math.sin(de)) / (Math.cos(la) * sz)));
    const a = Math.acos(ca) / D;
    az = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  const elev = elevGeo + refraction(elevGeo);
  return { elev, elevGeo, az, decl, eqTime, ha };
}

// sun at a Hong Kong clock time
export function sunAtHKT(y, m, d, minutesOfDay, lat, lon) {
  return sunPosition(hktToMs(y, m, d, minutesOfDay), lat, lon);
}

// sunrise / solar noon / sunset in HKT minutes (apparent upper limb at -0.833 deg, as NOAA), by bisection
export function sunTimes(y, m, d, lat, lon) {
  const f = (min) => sunAtHKT(y, m, d, min, lat, lon).elevGeo + 0.833;
  const root = (a, b) => { let fa = f(a); for (let k = 0; k < 40; k++) { const c = (a + b) / 2, fc = f(c); if ((fc > 0) === (fa > 0)) { a = c; fa = fc; } else b = c; } return (a + b) / 2; };
  // solar noon: when the hour angle crosses 0
  let lo = 600, hi = 900;
  for (let k = 0; k < 40; k++) { const c = (lo + hi) / 2; if (sunAtHKT(y, m, d, c, lat, lon).ha < 0) lo = c; else hi = c; }
  const noon = (lo + hi) / 2;
  return { sunrise: root(180, noon), noon, sunset: root(noon, 1380) };
}

export const fmtHM = (min) => {
  const t = Math.round(min); const h = Math.floor(t / 60), m = t % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
