export type TimeOfDayPhase = 'dawn' | 'day' | 'sunset' | 'night';
export type WeatherKind = 'clear' | 'breeze' | 'mist' | 'rain';
export type TimeOfDayOverride = 'auto' | TimeOfDayPhase;
export type WeatherOverride = 'auto' | WeatherKind;

export interface AtmospherePreference {
  time: TimeOfDayOverride;
  weather: WeatherOverride;
}

export interface TempleAtmosphereSnapshot {
  dayProgress: number; // 0..1 across full 24h cycle (0 = midnight, 0.25 = 06:00, 0.5 = noon, 0.75 = 18:00)
  virtualHour: number; // 0..24
  timePhase: TimeOfDayPhase;
  timeLabel: string;
  weather: WeatherKind;
  weatherLabel: string;
  isAutoTime: boolean;
  isAutoWeather: boolean;
  nightFactor: number; // 0..1 (1 at deep night)
  dawnDuskFactor: number; // 0..1 (peaks at sunrise / sunset)
  rainIntensity: number; // 0..1 smooth fade
  mistIntensity: number; // 0..1 smooth fade
  breezeIntensity: number; // 0..1 smooth fade
  fireflyIntensity: number; // 0..1 active at calm night/dusk
  skyColorHex: number;
  fogColorHex: number;
  fogDensity: number;
  sunColorHex: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  fillColorHex: number;
  fillIntensity: number;
  exposure: number;
  ambientOverlayCss: string;
  ambientOverlayAlpha: number;
  celestialGlowCss: string;
  celestialGlowAlpha: number;
  lanternGlowMultiplier: number;
}

// 8 minutes for one complete serene day-night temple cycle (2 minutes per major phase)
export const DAY_CYCLE_DURATION_MS = 8 * 60 * 1000;
// Each automatic weather condition lasts 75 seconds with smooth 7-second transitions
export const WEATHER_SEGMENT_DURATION_MS = 75 * 1000;
export const WEATHER_FADE_DURATION_MS = 7 * 1000;

const WEATHER_SEQUENCE: WeatherKind[] = ['clear', 'breeze', 'mist', 'rain'];

export const TIME_PHASE_LABELS: Record<TimeOfDayPhase, string> = {
  dawn: 'Bình minh',
  day: 'Ban ngày',
  sunset: 'Hoàng hôn',
  night: 'Đêm trăng',
};

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: 'Quang đãng',
  breeze: 'Gió hoa rơi',
  mist: 'Sương sớm',
  rain: 'Mưa phùn',
};

const OVERRIDE_DAY_PROGRESS: Record<TimeOfDayPhase, number> = {
  dawn: 0.255,   // ~06:07 sunrise
  day: 0.48,     // ~11:30 bright sunlit day
  sunset: 0.745, // ~17:53 golden sunset
  night: 0.94,   // ~22:34 tranquil moonlit night
};

interface TimeKeyframe {
  t: number;
  sky: number;
  fog: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fillColor: number;
  fillIntensity: number;
  exposure: number;
  nightFactor: number;
  dawnDuskFactor: number;
  overlayR: number;
  overlayG: number;
  overlayB: number;
  overlayAlpha: number;
  glowR: number;
  glowG: number;
  glowB: number;
  glowAlpha: number;
}

const TIME_KEYFRAMES: TimeKeyframe[] = [
  {
    t: 0.0, // Midnight
    sky: 0x0b1326,
    fog: 0x101a30,
    fogDensity: 0.0135,
    sunColor: 0x9eb8ff,
    sunIntensity: 0.46,
    hemiSky: 0x3b4d78,
    hemiGround: 0x1c221b,
    hemiIntensity: 0.56,
    fillColor: 0x627ab0,
    fillIntensity: 0.28,
    exposure: 0.82,
    nightFactor: 1.0,
    dawnDuskFactor: 0.0,
    overlayR: 12,
    overlayG: 20,
    overlayB: 48,
    overlayAlpha: 0.44,
    glowR: 150,
    glowG: 185,
    glowB: 255,
    glowAlpha: 0.08,
  },
  {
    t: 0.19, // Pre-dawn
    sky: 0x16223d,
    fog: 0x222c48,
    fogDensity: 0.014,
    sunColor: 0xaac0f5,
    sunIntensity: 0.52,
    hemiSky: 0x4b5c86,
    hemiGround: 0x262b22,
    hemiIntensity: 0.6,
    fillColor: 0x7388b8,
    fillIntensity: 0.3,
    exposure: 0.86,
    nightFactor: 0.82,
    dawnDuskFactor: 0.25,
    overlayR: 22,
    overlayG: 30,
    overlayB: 62,
    overlayAlpha: 0.34,
    glowR: 210,
    glowG: 175,
    glowB: 195,
    glowAlpha: 0.09,
  },
  {
    t: 0.255, // Dawn / Bình minh
    sky: 0xebb99b,
    fog: 0xe6c3aa,
    fogDensity: 0.0135,
    sunColor: 0xffc482,
    sunIntensity: 1.15,
    hemiSky: 0xf4cfb2,
    hemiGround: 0x5c5b43,
    hemiIntensity: 0.78,
    fillColor: 0xc2c8e8,
    fillIntensity: 0.38,
    exposure: 0.98,
    nightFactor: 0.15,
    dawnDuskFactor: 1.0,
    overlayR: 245,
    overlayG: 176,
    overlayB: 120,
    overlayAlpha: 0.12,
    glowR: 255,
    glowG: 210,
    glowB: 150,
    glowAlpha: 0.2,
  },
  {
    t: 0.35, // Morning -> Day
    sky: 0xcde2ea,
    fog: 0xd6e6ea,
    fogDensity: 0.0112,
    sunColor: 0xfff0cc,
    sunIntensity: 1.55,
    hemiSky: 0xd9effc,
    hemiGround: 0x62744a,
    hemiIntensity: 0.85,
    fillColor: 0xbbe0f5,
    fillIntensity: 0.42,
    exposure: 1.08,
    nightFactor: 0.0,
    dawnDuskFactor: 0.05,
    overlayR: 255,
    overlayG: 245,
    overlayB: 220,
    overlayAlpha: 0.0,
    glowR: 255,
    glowG: 242,
    glowB: 206,
    glowAlpha: 0.14,
  },
  {
    t: 0.65, // Afternoon
    sky: 0xcde2ea,
    fog: 0xd6e6ea,
    fogDensity: 0.0112,
    sunColor: 0xfff0cc,
    sunIntensity: 1.55,
    hemiSky: 0xd9effc,
    hemiGround: 0x62744a,
    hemiIntensity: 0.85,
    fillColor: 0xbbe0f5,
    fillIntensity: 0.42,
    exposure: 1.08,
    nightFactor: 0.0,
    dawnDuskFactor: 0.05,
    overlayR: 255,
    overlayG: 230,
    overlayB: 190,
    overlayAlpha: 0.0,
    glowR: 255,
    glowG: 242,
    glowB: 206,
    glowAlpha: 0.14,
  },
  {
    t: 0.745, // Sunset / Hoàng hôn
    sky: 0xd9875c,
    fog: 0xd18a66,
    fogDensity: 0.0128,
    sunColor: 0xffa65c,
    sunIntensity: 1.25,
    hemiSky: 0xf2ad7e,
    hemiGround: 0x524536,
    hemiIntensity: 0.76,
    fillColor: 0x998cc4,
    fillIntensity: 0.35,
    exposure: 0.96,
    nightFactor: 0.22,
    dawnDuskFactor: 1.0,
    overlayR: 220,
    overlayG: 112,
    overlayB: 52,
    overlayAlpha: 0.17,
    glowR: 255,
    glowG: 170,
    glowB: 96,
    glowAlpha: 0.22,
  },
  {
    t: 0.82, // Dusk -> Night
    sky: 0x162038,
    fog: 0x1a243d,
    fogDensity: 0.0135,
    sunColor: 0x9eb8ff,
    sunIntensity: 0.48,
    hemiSky: 0x3f507a,
    hemiGround: 0x1e241d,
    hemiIntensity: 0.58,
    fillColor: 0x647ab0,
    fillIntensity: 0.29,
    exposure: 0.84,
    nightFactor: 0.92,
    dawnDuskFactor: 0.18,
    overlayR: 15,
    overlayG: 22,
    overlayB: 52,
    overlayAlpha: 0.4,
    glowR: 155,
    glowG: 185,
    glowB: 250,
    glowAlpha: 0.09,
  },
  {
    t: 1.0, // Midnight wrap
    sky: 0x0b1326,
    fog: 0x101a30,
    fogDensity: 0.0135,
    sunColor: 0x9eb8ff,
    sunIntensity: 0.46,
    hemiSky: 0x3b4d78,
    hemiGround: 0x1c221b,
    hemiIntensity: 0.56,
    fillColor: 0x627ab0,
    fillIntensity: 0.28,
    exposure: 0.82,
    nightFactor: 1.0,
    dawnDuskFactor: 0.0,
    overlayR: 12,
    overlayG: 20,
    overlayB: 48,
    overlayAlpha: 0.44,
    glowR: 150,
    glowG: 185,
    glowB: 255,
    glowAlpha: 0.08,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerpHexColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return (r << 16) | (g << 8) | b;
}

function getPhaseFromDayProgress(dayProgress: number): TimeOfDayPhase {
  if (dayProgress >= 0.205 && dayProgress < 0.325) return 'dawn';
  if (dayProgress >= 0.325 && dayProgress < 0.68) return 'day';
  if (dayProgress >= 0.68 && dayProgress < 0.805) return 'sunset';
  return 'night';
}

export function getTempleAtmosphere(
  nowMs: number,
  pref?: AtmospherePreference
): TempleAtmosphereSnapshot {
  const timeOverride = pref?.time ?? 'auto';
  const weatherOverride = pref?.weather ?? 'auto';

  // Offset so an arbitrary timestamp cycles smoothly across phases
  const rawDayProgress = ((nowMs % DAY_CYCLE_DURATION_MS) + DAY_CYCLE_DURATION_MS) % DAY_CYCLE_DURATION_MS / DAY_CYCLE_DURATION_MS;
  const dayProgress = timeOverride === 'auto' ? rawDayProgress : OVERRIDE_DAY_PROGRESS[timeOverride];
  const timePhase = getPhaseFromDayProgress(dayProgress);

  // Locate bounding keyframes
  let k0 = TIME_KEYFRAMES[0];
  let k1 = TIME_KEYFRAMES[TIME_KEYFRAMES.length - 1];
  for (let i = 0; i < TIME_KEYFRAMES.length - 1; i++) {
    if (dayProgress >= TIME_KEYFRAMES[i].t && dayProgress <= TIME_KEYFRAMES[i + 1].t) {
      k0 = TIME_KEYFRAMES[i];
      k1 = TIME_KEYFRAMES[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, k1.t - k0.t);
  const localT = clamp01((dayProgress - k0.t) / span);
  const smoothT = localT * localT * (3 - 2 * localT);

  // Resolve weather + smooth crossfade at segment boundaries
  let weather: WeatherKind;
  let weatherFade = 1;
  if (weatherOverride !== 'auto') {
    weather = weatherOverride;
  } else {
    const segIdx = Math.floor(nowMs / WEATHER_SEGMENT_DURATION_MS);
    const segOffset = nowMs % WEATHER_SEGMENT_DURATION_MS;
    weather = WEATHER_SEQUENCE[((segIdx % WEATHER_SEQUENCE.length) + WEATHER_SEQUENCE.length) % WEATHER_SEQUENCE.length];
    if (segOffset < WEATHER_FADE_DURATION_MS) {
      weatherFade = segOffset / WEATHER_FADE_DURATION_MS;
    } else if (segOffset > WEATHER_SEGMENT_DURATION_MS - WEATHER_FADE_DURATION_MS) {
      weatherFade = (WEATHER_SEGMENT_DURATION_MS - segOffset) / WEATHER_FADE_DURATION_MS;
    }
    weatherFade = clamp01(weatherFade);
  }

  const rainIntensity = weather === 'rain' ? weatherFade : 0;
  const mistIntensity = weather === 'mist' ? weatherFade : 0;
  const breezeIntensity = weather === 'breeze' ? weatherFade : 0;

  const nightFactor = lerp(k0.nightFactor, k1.nightFactor, smoothT);
  const dawnDuskFactor = lerp(k0.dawnDuskFactor, k1.dawnDuskFactor, smoothT);

  // Blend sky & fog slightly cooler/slate during rain, softer pale grey during mist
  let skyColorHex = lerpHexColor(k0.sky, k1.sky, smoothT);
  let fogColorHex = lerpHexColor(k0.fog, k1.fog, smoothT);
  let fogDensity = lerp(k0.fogDensity, k1.fogDensity, smoothT);

  if (rainIntensity > 0) {
    const rainSkyTarget = nightFactor > 0.5 ? 0x0b1220 : 0x7c90a0;
    skyColorHex = lerpHexColor(skyColorHex, rainSkyTarget, rainIntensity * 0.65);
    fogColorHex = lerpHexColor(fogColorHex, rainSkyTarget, rainIntensity * 0.65);
    fogDensity += rainIntensity * 0.0065;
  }
  if (mistIntensity > 0) {
    const mistTarget = nightFactor > 0.5 ? 0x1c283e : 0xd8e2e6;
    skyColorHex = lerpHexColor(skyColorHex, mistTarget, mistIntensity * 0.45);
    fogColorHex = lerpHexColor(fogColorHex, mistTarget, mistIntensity * 0.55);
    fogDensity += mistIntensity * 0.009;
  }

  // Sun sweeps smoothly across sky arc during day (0.22..0.78), moon arc during night
  const isSunUp = dayProgress >= 0.21 && dayProgress <= 0.79;
  const arcT = isSunUp
    ? clamp01((dayProgress - 0.21) / 0.58)
    : clamp01(((dayProgress >= 0.79 ? dayProgress - 0.79 : dayProgress + 0.21) / 0.42));
  const arcAngle = arcT * Math.PI;
  const sunX = Math.cos(arcAngle) * -32;
  const sunY = Math.max(8, Math.sin(arcAngle) * 34);
  const sunZ = isSunUp ? 16 : -14;

  const baseSunIntensity = lerp(k0.sunIntensity, k1.sunIntensity, smoothT);
  const sunIntensity = baseSunIntensity * (1 - rainIntensity * 0.35 - mistIntensity * 0.2);

  const hemiIntensity = lerp(k0.hemiIntensity, k1.hemiIntensity, smoothT);
  const fillIntensity = lerp(k0.fillIntensity, k1.fillIntensity, smoothT);
  const exposure = lerp(k0.exposure, k1.exposure, smoothT) - rainIntensity * 0.06;

  // 2D overlay tint: combine time-of-day tint with subtle rain overcast
  let overlayR = lerp(k0.overlayR, k1.overlayR, smoothT);
  let overlayG = lerp(k0.overlayG, k1.overlayG, smoothT);
  let overlayB = lerp(k0.overlayB, k1.overlayB, smoothT);
  let overlayAlpha = lerp(k0.overlayAlpha, k1.overlayAlpha, smoothT);

  if (rainIntensity > 0) {
    overlayR = lerp(overlayR, 28, rainIntensity * 0.5);
    overlayG = lerp(overlayG, 44, rainIntensity * 0.5);
    overlayB = lerp(overlayB, 68, rainIntensity * 0.5);
    overlayAlpha = Math.min(0.56, overlayAlpha + rainIntensity * 0.16);
  }

  const glowR = Math.round(lerp(k0.glowR, k1.glowR, smoothT));
  const glowG = Math.round(lerp(k0.glowG, k1.glowG, smoothT));
  const glowB = Math.round(lerp(k0.glowB, k1.glowB, smoothT));
  const glowAlpha = lerp(k0.glowAlpha, k1.glowAlpha, smoothT) * (1 - rainIntensity * 0.65);

  const fireflyIntensity = clamp01((nightFactor - 0.35) / 0.45) * (1 - rainIntensity * 0.85);

  return {
    dayProgress,
    virtualHour: dayProgress * 24,
    timePhase,
    timeLabel: TIME_PHASE_LABELS[timePhase],
    weather,
    weatherLabel: WEATHER_LABELS[weather],
    isAutoTime: timeOverride === 'auto',
    isAutoWeather: weatherOverride === 'auto',
    nightFactor,
    dawnDuskFactor,
    rainIntensity,
    mistIntensity,
    breezeIntensity,
    fireflyIntensity,
    skyColorHex,
    fogColorHex,
    fogDensity,
    sunColorHex: lerpHexColor(k0.sunColor, k1.sunColor, smoothT),
    sunIntensity,
    sunPosition: [sunX, sunY, sunZ],
    hemiSkyHex: lerpHexColor(k0.hemiSky, k1.hemiSky, smoothT),
    hemiGroundHex: lerpHexColor(k0.hemiGround, k1.hemiGround, smoothT),
    hemiIntensity,
    fillColorHex: lerpHexColor(k0.fillColor, k1.fillColor, smoothT),
    fillIntensity,
    exposure,
    ambientOverlayCss: `rgb(${Math.round(overlayR)}, ${Math.round(overlayG)}, ${Math.round(overlayB)})`,
    ambientOverlayAlpha: overlayAlpha,
    celestialGlowCss: `rgb(${glowR}, ${glowG}, ${glowB})`,
    celestialGlowAlpha: glowAlpha,
    lanternGlowMultiplier: 1 + nightFactor * 1.35 + dawnDuskFactor * 0.45,
  };
}
