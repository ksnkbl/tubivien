import {
  CUSHION_POSITIONS,
  GARDEN_PLOT_POSITIONS,
  HON_NON_BO_SPEC,
  INTERACTABLES,
  PERGOLA_BENCH_SPECS,
  PERGOLA_SPEC,
  PRECEPTS_STELE_SPEC,
  WORLD_HEIGHT,
  WORLD_MIN_X,
  WORLD_WIDTH,
  type Direction,
  type RitualAction,
} from './types.ts';

export type CourtyardArhatArtVariant = 'tich-truong' | 'thien-dinh' | 'minh-chau';
export type SanctuaryGuardianArtVariant = 'guardian-left' | 'guardian-right';

export interface CourtyardArhatSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: 'left' | 'right';
  artVariant: CourtyardArhatArtVariant;
}

export interface SanctuaryGuardianSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  side: 'left' | 'right';
  artVariant: SanctuaryGuardianArtVariant;
}

export const COURTYARD_ARHAT_SPECS: CourtyardArhatSpec[] = [
  // Hàng bên trái (Cổng Tam Quan -> Sân Lư Hương -> Chánh Điện)
  { id: 'la-han-1', name: 'Tôn Giả Ca Diếp', x: 852, y: 948, facing: 'right', artVariant: 'tich-truong' },
  { id: 'la-han-2', name: 'Tôn Giả A Nan', x: 815, y: 852, facing: 'right', artVariant: 'thien-dinh' },
  { id: 'la-han-3', name: 'Tôn Giả Xá Lợi Phất', x: 815, y: 784, facing: 'right', artVariant: 'minh-chau' },
  { id: 'la-han-4', name: 'Tôn Giả Mục Kiền Liên', x: 815, y: 716, facing: 'right', artVariant: 'tich-truong' },
  { id: 'la-han-5', name: 'Tôn Giả Tu Bồ Đề', x: 815, y: 648, facing: 'right', artVariant: 'thien-dinh' },
  { id: 'la-han-6', name: 'Tôn Giả La Hầu La', x: 852, y: 578, facing: 'right', artVariant: 'minh-chau' },
  // Hàng bên phải (Cổng Tam Quan -> Sân Lư Hương -> Chánh Điện)
  { id: 'la-han-7', name: 'Tôn Giả Kiều Trần Như', x: 1068, y: 948, facing: 'left', artVariant: 'thien-dinh' },
  { id: 'la-han-8', name: 'Tôn Giả Phú Lâu Na', x: 1105, y: 852, facing: 'left', artVariant: 'minh-chau' },
  { id: 'la-han-9', name: 'Tôn Giả Ca Chiên Diên', x: 1105, y: 784, facing: 'left', artVariant: 'tich-truong' },
  { id: 'la-han-10', name: 'Tôn Giả Ưu Ba Ly', x: 1105, y: 716, facing: 'left', artVariant: 'thien-dinh' },
  { id: 'la-han-11', name: 'Tôn Giả A Nậu Lâu Đà', x: 1105, y: 648, facing: 'left', artVariant: 'minh-chau' },
  { id: 'la-han-12', name: 'Phục Hổ La Hán', x: 1068, y: 578, facing: 'left', artVariant: 'tich-truong' },
];

export const SANCTUARY_GUARDIAN_SPECS: SanctuaryGuardianSpec[] = [
  {
    id: 'guardian-left',
    name: 'Thần Giữ Cửa · Hộ Pháp Vi Đà (Khuyến Thiện)',
    x: 856,
    y: 518,
    side: 'left',
    artVariant: 'guardian-left',
  },
  {
    id: 'guardian-right',
    name: 'Thần Giữ Cửa · Hộ Pháp Kim Cang (Trừng Ác)',
    x: 1064,
    y: 518,
    side: 'right',
    artVariant: 'guardian-right',
  },
];

export const WORLD_TO_3D_SCALE = 0.04; // 1920px -> 76.8m, 1260px -> 50.4m

export function world2DTo3D(x: number, y: number): { x: number; z: number } {
  return {
    x: (x - WORLD_WIDTH / 2) * WORLD_TO_3D_SCALE,
    z: (y - WORLD_HEIGHT / 2) * WORLD_TO_3D_SCALE,
  };
}

export function world3DTo2D(x3: number, z3: number): { x: number; y: number } {
  return {
    x: x3 / WORLD_TO_3D_SCALE + WORLD_WIDTH / 2,
    y: z3 / WORLD_TO_3D_SCALE + WORLD_HEIGHT / 2,
  };
}

export function directionToYaw(dir: Direction): number {
  // Three.js camera looks down -Z when yaw = 0; +X is right, +Z is south (down in 2D)
  if (dir === 'up') return 0;
  if (dir === 'down') return Math.PI;
  if (dir === 'left') return Math.PI / 2;
  return -Math.PI / 2;
}

export function yawToDirection(yaw: number): Direction {
  const norm = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  if (norm >= -Math.PI * 0.25 && norm < Math.PI * 0.25) return 'up';
  if (norm >= Math.PI * 0.25 && norm < Math.PI * 0.75) return 'left';
  if (norm >= -Math.PI * 0.75 && norm < -Math.PI * 0.25) return 'right';
  return 'down';
}

export const STUPA_SPEC = {
  x: 960,
  y: -295,
  cx: 960,
  cy: -295,
  radius: 56,
  deckHalf: 68,
};

export const STUPA_DECK_Y_3D = 17.8;
export const STUPA_DECK_WALK_HALF = 36; // ±1.44m inside ±1.98m 9th-tier balustrade

export const MEMORIAL_GRAVE_SPECS = [
  { id: 'grave-1', x: 190, y: -355, label: 'Phần Mộ Cổ Tùng' },
  { id: 'grave-2', x: 470, y: -355, label: 'Phần Mộ Liên Đài' },
  { id: 'grave-3', x: 190, y: -135, label: 'Phần Mộ Trúc Lâm' },
  { id: 'grave-4', x: 470, y: -135, label: 'Phần Mộ Tịnh Độ' },
] as const;

export interface PathLanternPostSpec {
  x: number;
  y: number;
  armDir: number; // Direction in radians of overhanging wooden arm in 2D/3D ground plane
  branch: 'hon_non_bo' | 'memorial';
}

// Hệ thống đèn lồng dẫn lối từ Chánh Điện -> Hòn Non Bộ & Công Viên Cầu Siêu
export const PATH_LANTERN_POSTS: PathLanternPostSpec[] = [
  // Tuyến 1: Sân Chánh Điện -> Vườn Bồ Đề -> Bia Ngũ Giới & Hòn Non Bộ
  { x: 616, y: 598, armDir: -0.7, branch: 'hon_non_bo' },
  { x: 544, y: 526, armDir: -0.7, branch: 'hon_non_bo' },
  { x: 486, y: 406, armDir: 2.2, branch: 'hon_non_bo' },
  { x: 406, y: 342, armDir: 2.1, branch: 'hon_non_bo' },
  { x: 222, y: 268, armDir: 1.57, branch: 'hon_non_bo' },
  { x: 152, y: 342, armDir: -1.57, branch: 'hon_non_bo' },
  { x: 36, y: 224, armDir: 1.57, branch: 'hon_non_bo' },
  { x: 36, y: 332, armDir: -1.57, branch: 'hon_non_bo' },
  // Tuyến 2: Sân Chánh Điện -> Hành Lang Tây -> Công Viên Cầu Siêu (và lối nối cổng Nam)
  { x: 604, y: 465, armDir: 0, branch: 'memorial' },
  { x: 604, y: 325, armDir: 0, branch: 'memorial' },
  { x: 604, y: 185, armDir: 0, branch: 'memorial' },
  { x: 604, y: 45, armDir: 0, branch: 'memorial' },
  { x: 608, y: -85, armDir: 0, branch: 'memorial' },
  { x: 626, y: -172, armDir: -2.4, branch: 'memorial' },
  { x: 552, y: -265, armDir: 1.57, branch: 'memorial' },
  { x: 552, y: -185, armDir: -1.57, branch: 'memorial' },
  { x: 282, y: -42, armDir: 0, branch: 'memorial' },
  { x: 378, y: -42, armDir: Math.PI, branch: 'memorial' },
];

export const POND_SPEC = {
  cx: 338,
  cy: 735,
  rx: 224,
  ry: 145,
  bridgeY: 735,
  bridgeHalfW: 24,
  bridgeYMin: 711,
  bridgeYMax: 759,
  bridgeXMin: 110,
  bridgeXMax: 566,
} as const;

export interface MountainWaypoint {
  x: number;
  y: number;
  elev: number;
  label: string;
}

export const MOUNTAIN_SPEC = {
  minX: 1412,
  maxX: 1858,
  minY: -472,
  maxY: 196,
  trailHalfWidth: 38,
  summitX: 1615,
  summitY: -258,
  summitRadius: 54,
  summitElev: 18.2,
} as const;

export const MOUNTAIN_TRAIL_WAYPOINTS: MountainWaypoint[] = [
  { x: 1380, y: 175, elev: 0.0, label: 'Chân Núi Liên Sơn' },
  { x: 1560, y: 162, elev: 3.2, label: 'Bậc Đá Tầng Hạ' },
  { x: 1765, y: 88, elev: 6.8, label: 'Khúc Quanh Rừng Thông' },
  { x: 1760, y: -85, elev: 10.8, label: 'Sườn Đông Vách Đá' },
  { x: 1495, y: -96, elev: 14.6, label: 'Triền Tây Nhìn Bảo Tháp' },
  { x: 1525, y: -242, elev: 17.4, label: 'Cổng Mây Thượng Đỉnh' },
  { x: 1615, y: -258, elev: 18.2, label: 'Đỉnh Núi Liên Sơn · Đài Ngắm Cảnh' },
];

export const MOUNTAIN_PEAKS = [
  { x: 1758, y: -342, height: 24.4, radius: 135, label: 'Đỉnh Chính Liên Sơn' },
  { x: 1622, y: -402, height: 21.8, radius: 118, label: 'Ngọn Bắc Tùng Phong' },
  { x: 1826, y: -175, height: 20.6, radius: 115, label: 'Đỉnh Đông Vân Hải' },
  { x: 1456, y: -378, height: 16.4, radius: 104, label: 'Triền Tây Thiên Thai' },
  { x: 1790, y: 24, height: 12.2, radius: 94, label: 'Sườn Nam Thông Reo' },
] as const;

export interface MountainTrailProjection {
  cx: number;
  cy: number;
  dist: number;
  elev: number;
  segIdx: number;
  t: number;
  onTrail: boolean;
  onSummit: boolean;
}

export function isInsideMountainBase(x: number, y: number): boolean {
  if (x < MOUNTAIN_SPEC.minX || x > MOUNTAIN_SPEC.maxX || y < MOUNTAIN_SPEC.minY || y > MOUNTAIN_SPEC.maxY) {
    return false;
  }
  // Open approach terrace around trailhead P0(1380,175) -> (1450,170)
  if (x < 1450 && y > 132) return false;
  return true;
}

export function projectOntoMountainTrail(x: number, y: number): MountainTrailProjection {
  let bestDist = Infinity;
  let bestCx = MOUNTAIN_TRAIL_WAYPOINTS[0].x;
  let bestCy = MOUNTAIN_TRAIL_WAYPOINTS[0].y;
  let bestElev = 0;
  let bestSegIdx = 0;
  let bestT = 0;

  for (let i = 0; i < MOUNTAIN_TRAIL_WAYPOINTS.length - 1; i++) {
    const a = MOUNTAIN_TRAIL_WAYPOINTS[i];
    const b = MOUNTAIN_TRAIL_WAYPOINTS[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const t =
      lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / lenSq)) : 0;
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestCx = cx;
      bestCy = cy;
      bestElev = a.elev + (b.elev - a.elev) * t;
      bestSegIdx = i;
      bestT = t;
    }
  }

  const summitDist = Math.hypot(x - MOUNTAIN_SPEC.summitX, y - MOUNTAIN_SPEC.summitY);
  const onSummit = summitDist <= MOUNTAIN_SPEC.summitRadius;
  if (onSummit) {
    bestElev = MOUNTAIN_SPEC.summitElev;
    bestSegIdx = MOUNTAIN_TRAIL_WAYPOINTS.length - 2;
    bestT = 1;
  }

  const onTrail = onSummit || bestDist <= MOUNTAIN_SPEC.trailHalfWidth + 6;

  return {
    cx: bestCx,
    cy: bestCy,
    dist: bestDist,
    elev: bestElev,
    segIdx: bestSegIdx,
    t: bestT,
    onTrail,
    onSummit,
  };
}

export function resolveWalkPosition(
  prevX: number,
  prevY: number,
  rawX: number,
  rawY: number
): { x: number; y: number } {
  let x = Math.max(WORLD_MIN_X + 78, Math.min(WORLD_WIDTH - 88, rawX));
  let y = Math.max(-598, Math.min(WORLD_HEIGHT - 115, rawY));

  // South perimeter wall (allow standing in Tam Quan gate archway x: 875..1045)
  if (y > 1090 && (x < 875 || x > 1045)) {
    y = 1090;
  }

  // North perimeter wall shifted north to y = -520..-484 (small coastal back gate x: 924..996)
  if (y < -476 && y > -526 && (x < 924 || x > 996)) {
    if (prevY >= -476) {
      y = -476;
    } else if (prevY <= -526) {
      y = -526;
    } else {
      y = prevY > -501 ? -476 : -526;
    }
  }

  // Coastal sea-view terrace outside the small back door (keep visitors safely on cliff/deck)
  if (y <= -526) {
    x = Math.max(460, Math.min(1460, x));
  }

  // Tam Quan side pillars
  const gatePillars = [
    { x: 855, y: 1125, r: 22 },
    { x: 1065, y: 1125, r: 22 },
  ];
  for (const p of gatePillars) {
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < p.r && d > 0.001) {
      x = p.x + (dx / d) * p.r;
      y = p.y + (dy / d) * p.r;
    }
  }

  // Elongated Main Sanctuary altar & back wall (x: 680..1240, y: -85..122; backyard y < -85 is open)
  if (x >= 680 && x <= 1240 && y >= -85 && y < 122) {
    const dLeft = Math.abs(prevX - 680);
    const dRight = Math.abs(1240 - prevX);
    const dTop = Math.abs(prevY - -85);
    const dBottom = Math.abs(122 - prevY);
    if (prevX < 680 && dLeft <= dTop && dLeft <= dBottom) {
      x = 679;
    } else if (prevX > 1240 && dRight <= dTop && dRight <= dBottom) {
      x = 1241;
    } else if (prevY < -85) {
      y = -86;
    } else {
      y = 122;
    }
  }

  // Memorial Park stone graves (x ±26, y ±20 solid headstone + tomb plinth)
  for (const g of MEMORIAL_GRAVE_SPECS) {
    const minX = g.x - 26;
    const maxX = g.x + 26;
    const minY = g.y - 20;
    const maxY = g.y + 20;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      const dLeft = Math.abs(x - minX);
      const dRight = Math.abs(maxX - x);
      const dTop = Math.abs(y - minY);
      const dBottom = Math.abs(maxY - y);
      const m = Math.min(dLeft, dRight, dTop, dBottom);
      if (m === dBottom) y = maxY;
      else if (m === dTop) y = minY;
      else if (m === dLeft) x = minX;
      else x = maxX;
    }
  }

  // Gian Bếp Chay solid counters & dining table (NE pavilion)
  const kitchenBoxes = [
    { minX: 1474, maxX: 1596, minY: 298, maxY: 348 },
    { minX: 1550, maxX: 1676, minY: 448, maxY: 500 },
    { minX: 1634, maxX: 1756, minY: 298, maxY: 348 },
  ];
  for (const box of kitchenBoxes) {
    if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) {
      const dLeft = Math.abs(x - box.minX);
      const dRight = Math.abs(box.maxX - x);
      const dTop = Math.abs(y - box.minY);
      const dBottom = Math.abs(box.maxY - y);
      const m = Math.min(dLeft, dRight, dTop, dBottom);
      if (m === dBottom) y = box.maxY;
      else if (m === dTop) y = box.minY;
      else if (m === dLeft) x = box.minX;
      else x = box.maxX;
    }
  }

  // Pergola corner wooden pillars & 2 carved stone bench cores
  const pergolaCorners = [
    { x: PERGOLA_SPEC.minX + 16, y: PERGOLA_SPEC.minY + 14, r: 13 },
    { x: PERGOLA_SPEC.maxX - 16, y: PERGOLA_SPEC.minY + 14, r: 13 },
    { x: PERGOLA_SPEC.minX + 16, y: PERGOLA_SPEC.maxY - 14, r: 13 },
    { x: PERGOLA_SPEC.maxX - 16, y: PERGOLA_SPEC.maxY - 14, r: 13 },
  ];

  // Solid circular props (Bảo Tháp, Đài Cầu Siêu, Incense, Bell, Woodfish, Fortune, Bodhi trunk, Wishing Tree, Arhats, Guardians, Pergola posts & bench cores)
  const solidProps = [
    { x: STUPA_SPEC.x, y: STUPA_SPEC.y, r: STUPA_SPEC.radius },
    { x: INTERACTABLES.memorial.x, y: INTERACTABLES.memorial.y, r: 24 },
    { x: INTERACTABLES.incense.x, y: INTERACTABLES.incense.y, r: 30 },
    { x: INTERACTABLES.bell.x, y: INTERACTABLES.bell.y, r: 28 },
    { x: INTERACTABLES.woodfish.x, y: INTERACTABLES.woodfish.y, r: 24 },
    { x: INTERACTABLES.fortune.x, y: INTERACTABLES.fortune.y, r: 24 },
    { x: INTERACTABLES.sweep.x, y: INTERACTABLES.sweep.y, r: 16 },
    { x: INTERACTABLES.wish.x, y: INTERACTABLES.wish.y, r: 28 },
    { x: 285, y: 310, r: 26 },
    ...pergolaCorners,
    ...PERGOLA_BENCH_SPECS.flatMap((b) => [
      { x: b.x - 19, y: b.y - 14, r: 12 },
      { x: b.x + 19, y: b.y - 14, r: 12 },
    ]),
    ...COURTYARD_ARHAT_SPECS.map((a) => ({ x: a.x, y: a.y, r: 16 })),
    ...SANCTUARY_GUARDIAN_SPECS.map((g) => ({ x: g.x, y: g.y, r: 19 })),
    ...PATH_LANTERN_POSTS.map((l) => ({ x: l.x, y: l.y, r: 9 })),
  ];
  for (const prop of solidProps) {
    const dx = x - prop.x;
    const dy = y - prop.y;
    const d = Math.hypot(dx, dy);
    if (d < prop.r) {
      const nx = d > 0.001 ? dx / d : 0;
      const ny = d > 0.001 ? dy / d : 1;
      x = prop.x + nx * prop.r;
      y = prop.y + ny * prop.r;
    }
  }

  // Climbable Back-Right Mountain Range (Dãy Núi Liên Sơn)
  if (isInsideMountainBase(x, y) || isInsideMountainBase(prevX, prevY)) {
    const prevProj = projectOntoMountainTrail(prevX, prevY);
    const rawProj = projectOntoMountainTrail(x, y);
    const wasOnPath = prevProj.dist <= MOUNTAIN_SPEC.trailHalfWidth + 6 || prevProj.onSummit;
    if (wasOnPath || (!isInsideMountainBase(prevX, prevY) && rawProj.dist <= MOUNTAIN_SPEC.trailHalfWidth && rawProj.elev < 2.2)) {
      if (rawProj.onSummit) {
        // Free movement within the Summit Overlook Plateau
        return { x, y };
      }
      if (rawProj.dist <= MOUNTAIN_SPEC.trailHalfWidth && Math.abs(rawProj.elev - prevProj.elev) <= 2.6) {
        return { x, y };
      }
      // Keep inside summit rim if leaving summit plateau toward sheer cliff
      if (prevProj.onSummit) {
        if (rawProj.dist <= MOUNTAIN_SPEC.trailHalfWidth && Math.abs(rawProj.elev - prevProj.elev) <= 2.6) {
          return { x, y };
        }
        const sdx = x - MOUNTAIN_SPEC.summitX;
        const sdy = y - MOUNTAIN_SPEC.summitY;
        const sd = Math.hypot(sdx, sdy);
        if (sd > MOUNTAIN_SPEC.summitRadius && sd > 0.001) {
          return {
            x: MOUNTAIN_SPEC.summitX + (sdx / sd) * MOUNTAIN_SPEC.summitRadius,
            y: MOUNTAIN_SPEC.summitY + (sdy / sd) * MOUNTAIN_SPEC.summitRadius,
          };
        }
      }
      // Clamp cleanly to the walkable trail width around the best nearby segment
      const seg = MOUNTAIN_TRAIL_WAYPOINTS[Math.min(prevProj.segIdx, MOUNTAIN_TRAIL_WAYPOINTS.length - 2)];
      const segNext = MOUNTAIN_TRAIL_WAYPOINTS[Math.min(prevProj.segIdx + 1, MOUNTAIN_TRAIL_WAYPOINTS.length - 1)];
      const abx = segNext.x - seg.x;
      const aby = segNext.y - seg.y;
      const lenSq = abx * abx + aby * aby;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - seg.x) * abx + (y - seg.y) * aby) / lenSq)) : 0;
      const cx = seg.x + abx * t;
      const cy = seg.y + aby * t;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > MOUNTAIN_SPEC.trailHalfWidth && d > 0.001) {
        x = cx + (dx / d) * MOUNTAIN_SPEC.trailHalfWidth;
        y = cy + (dy / d) * MOUNTAIN_SPEC.trailHalfWidth;
      }
      return { x, y };
    } else if (isInsideMountainBase(x, y)) {
      // Walking from flat courtyard into the steep mountain base wall -> push outside
      const dLeft = Math.abs(x - (MOUNTAIN_SPEC.minX - 2));
      const dBottom = Math.abs(MOUNTAIN_SPEC.maxY + 2 - y);
      if (prevX < MOUNTAIN_SPEC.minX || dLeft <= dBottom) {
        x = MOUNTAIN_SPEC.minX - 2;
      } else {
        y = MOUNTAIN_SPEC.maxY + 2;
      }
    }
  }

  // Expanded Lotus Pond + Walkable Horizontal Bridge (Cầu Ao Sen)
  const wasOnBridgeSpan =
    prevX >= POND_SPEC.bridgeXMin + 6 &&
    prevX <= POND_SPEC.bridgeXMax - 6 &&
    Math.abs(prevY - POND_SPEC.bridgeY) <= POND_SPEC.bridgeHalfW + 3;

  const isInsideBridgeCorridor =
    x >= POND_SPEC.bridgeXMin - 10 &&
    x <= POND_SPEC.bridgeXMax + 10 &&
    Math.abs(y - POND_SPEC.bridgeY) <= POND_SPEC.bridgeHalfW;

  if (wasOnBridgeSpan) {
    // Keep character safely between north & south bridge railings while over pond water
    if (x >= POND_SPEC.bridgeXMin + 8 && x <= POND_SPEC.bridgeXMax - 8) {
      y = Math.max(
        POND_SPEC.bridgeY - POND_SPEC.bridgeHalfW + 2,
        Math.min(POND_SPEC.bridgeY + POND_SPEC.bridgeHalfW - 2, y)
      );
      return { x, y };
    }
  }

  if (isInsideBridgeCorridor) {
    return { x, y };
  }

  const ex = (x - POND_SPEC.cx) / POND_SPEC.rx;
  const ey = (y - POND_SPEC.cy) / POND_SPEC.ry;
  const norm = Math.hypot(ex, ey);
  if (norm < 1) {
    const scale = 1 / Math.max(0.01, norm);
    x = POND_SPEC.cx + ex * scale * POND_SPEC.rx;
    y = POND_SPEC.cy + ey * scale * POND_SPEC.ry;
  }

  // Hòn Non Bộ Rockery Basin in Expanded Left Garden
  const hnx = (x - HON_NON_BO_SPEC.cx) / (HON_NON_BO_SPEC.rx + 12);
  const hny = (y - HON_NON_BO_SPEC.cy) / (HON_NON_BO_SPEC.ry + 12);
  const hNorm = Math.hypot(hnx, hny);
  if (hNorm < 1) {
    const hScale = 1 / Math.max(0.01, hNorm);
    x = HON_NON_BO_SPEC.cx + hnx * hScale * (HON_NON_BO_SPEC.rx + 12);
    y = HON_NON_BO_SPEC.cy + hny * hScale * (HON_NON_BO_SPEC.ry + 12);
  }

  // Bia Ngũ Giới Stone Stele plinth beside Hòn Non Bộ
  const sx = x - PRECEPTS_STELE_SPEC.x;
  const sy = y - PRECEPTS_STELE_SPEC.y;
  const sDist = Math.hypot(sx, sy);
  if (sDist < 32) {
    const sScale = 32 / Math.max(0.01, sDist);
    x = PRECEPTS_STELE_SPEC.x + sx * sScale;
    y = PRECEPTS_STELE_SPEC.y + sy * sScale;
  }

  return { x, y };
}

export function getZoneName(x: number, y: number): string {
  if (y <= -520) return 'Bờ Biển Sau Chùa';
  const mountainProj = projectOntoMountainTrail(x, y);
  if (mountainProj.onSummit) return 'Đỉnh Núi Liên Sơn · Ngắm Toàn Cảnh';
  if (isInsideMountainBase(x, y) && mountainProj.onTrail && mountainProj.elev > 0.4) {
    return 'Đường Leo Núi Liên Sơn';
  }
  if (x <= 590 && y >= -475 && y < -20) return 'Công Viên Cầu Siêu';
  if (Math.hypot(x - STUPA_SPEC.x, y - STUPA_SPEC.y) <= 130) return 'Bảo Tháp Sau Chánh Điện';
  if (y >= -520 && y < -85) return 'Sân Sau & Bảo Tháp';
  if (x >= 680 && x <= 1240 && y >= -85 && y <= 495) return 'Chánh Điện';
  if (x >= 525 && x < 680 && y >= 425 && y <= 575) return 'Lầu Chuông';
  if (x > 1240 && x <= 1395 && y >= 425 && y <= 575) return 'Gác Mõ';
  if (
    Math.hypot((x - HON_NON_BO_SPEC.cx) / 185, (y - HON_NON_BO_SPEC.cy) / 140) <= 1.15
  ) {
    return 'Hòn Non Bộ · Vườn Bồ Đề';
  }
  if (x <= 540 && y >= -20 && y <= 505) return 'Vườn Bồ Đề & Hòn Non Bộ';
  if (
    x >= POND_SPEC.bridgeXMin &&
    x <= POND_SPEC.bridgeXMax &&
    Math.abs(y - POND_SPEC.bridgeY) <= POND_SPEC.bridgeHalfW + 4
  ) {
    return 'Cầu Ao Sen';
  }
  if (x <= 595 && y >= 555 && y <= 910) return 'Ao Sen Tĩnh Lặng';
  if (x >= 445 && x <= 795 && y >= 920) return 'Vườn Hoa Liên Tâm';
  if (Math.hypot(x - INTERACTABLES.wish.x, y - INTERACTABLES.wish.y) <= 135) return 'Cây Nguyện Ước';
  if (x >= 1425 && y <= 635) return 'Gian Bếp Chay';
  if (
    x >= PERGOLA_SPEC.minX - 18 &&
    x <= PERGOLA_SPEC.maxX + 18 &&
    y >= PERGOLA_SPEC.minY - 12 &&
    y <= PERGOLA_SPEC.maxY + 18
  ) {
    return 'Dàn Hoa Giấy Hồng';
  }
  if (x >= 1410 && y > 635) return 'Rừng Trúc Thanh Tịnh';
  if (y >= 920) return x >= 820 && x <= 1100 ? 'Cổng Tam Quan' : 'Đường Đèn Đá';
  return 'Sân Lư Hương';
}

export function findNearbyInteraction(
  x: number,
  y: number
):
  | { kind: 'interactable'; action: RitualAction; label: string }
  | { kind: 'cushion'; cushionIndex: number; label: string }
  | { kind: 'bench'; benchIndex: number; label: string }
  | { kind: 'garden_plot'; plotIndex: number; label: string }
  | { kind: 'precepts_stele'; label: string }
  | null {
  if (Math.hypot(x - PRECEPTS_STELE_SPEC.x, y - PRECEPTS_STELE_SPEC.y) <= 64) {
    return { kind: 'precepts_stele', label: `${PRECEPTS_STELE_SPEC.label} (Nhấp để đọc)` };
  }
  for (const b of PERGOLA_BENCH_SPECS) {
    if (Math.hypot(x - b.x, y - b.y) <= 56) {
      return { kind: 'bench', benchIndex: b.index, label: `${b.label} (Tối đa 2 người · Ngồi nghỉ)` };
    }
  }
  for (const plot of GARDEN_PLOT_POSITIONS) {
    if (Math.hypot(x - plot.x, y - plot.y) <= 44) {
      return { kind: 'garden_plot', plotIndex: plot.index, label: `${plot.label} (Gieo hạt / Dâng hoa)` };
    }
  }
  const entries = Object.entries(INTERACTABLES) as [
    RitualAction,
    { x: number; y: number; radius: number; label: string }
  ][];
  for (const [key, item] of entries) {
    if (Math.hypot(x - item.x, y - item.y) <= item.radius + 26) {
      return { kind: 'interactable', action: key, label: item.label };
    }
  }
  for (const c of CUSHION_POSITIONS) {
    if (Math.hypot(x - c.x, y - c.y) <= 46) {
      return { kind: 'cushion', cushionIndex: c.index, label: `${c.label} (Tọa thiền)` };
    }
  }
  return null;
}

export function getRitualStandSpot(action: RitualAction): {
  x: number;
  y: number;
  faceDir: Direction;
} {
  const item = INTERACTABLES[action];
  if (action === 'bow') {
    return { x: item.x, y: item.y, faceDir: 'up' };
  }
  if (action === 'stupa') {
    return { x: item.x, y: item.y + 6, faceDir: 'up' };
  }
  if (action === 'memorial') {
    return { x: item.x, y: item.y + 42, faceDir: 'up' };
  }
  if (action === 'kitchen_menu') {
    return { x: item.x, y: 376, faceDir: 'up' };
  }
  if (action === 'kitchen_table') {
    return { x: item.x, y: 526, faceDir: 'up' };
  }
  if (action === 'kitchen_sink') {
    return { x: item.x, y: 376, faceDir: 'up' };
  }
  if (action === 'fish') {
    return { x: 576, y: 830, faceDir: 'left' };
  }
  if (action === 'lantern') {
    return { x: 96, y: 735, faceDir: 'right' };
  }
  if (action === 'feed_koi') {
    return { x: 338, y: 570, faceDir: 'down' };
  }
  if (action === 'feed_birds') {
    return { x: 1615, y: 834, faceDir: 'up' };
  }
  if (action === 'flower') {
    return { x: 595, y: 1000, faceDir: 'down' };
  }
  if (action === 'sweep') {
    return { x: item.x, y: item.y + 34, faceDir: 'up' };
  }
  if (action === 'bell') {
    return { x: item.x, y: item.y + 42, faceDir: 'up' };
  }
  if (action === 'woodfish') {
    return { x: item.x, y: item.y + 38, faceDir: 'up' };
  }
  if (action === 'fortune') {
    return { x: item.x, y: item.y + 40, faceDir: 'up' };
  }
  if (action === 'wish') {
    return { x: item.x, y: item.y + 52, faceDir: 'up' };
  }
  return { x: item.x, y: item.y + 46, faceDir: 'up' };
}

export function getRitualVisualTarget(action: RitualAction): {
  lookX: number;
  lookY: number;
  pitch: number;
} {
  const item = INTERACTABLES[action];
  switch (action) {
    case 'bow':
      return { lookX: 960, lookY: 56, pitch: 0.06 };
    case 'stupa':
      return { lookX: STUPA_SPEC.x, lookY: STUPA_SPEC.y, pitch: 0.22 };
    case 'memorial':
      return { lookX: item.x, lookY: item.y, pitch: -0.05 };
    case 'incense':
      return { lookX: item.x, lookY: item.y, pitch: -0.05 };
    case 'bell':
      return { lookX: item.x, lookY: item.y, pitch: 0.04 };
    case 'woodfish':
      return { lookX: item.x, lookY: item.y, pitch: -0.22 };
    case 'fortune':
      return { lookX: item.x, lookY: item.y, pitch: -0.22 };
    case 'sweep':
      return { lookX: item.x, lookY: item.y, pitch: -0.32 };
    case 'fish':
      return { lookX: 488, lookY: 805, pitch: -0.16 };
    case 'flower':
      return { lookX: 595, lookY: 1035, pitch: -0.26 };
    case 'lantern':
      return { lookX: 338, y: 735, lookY: 735, pitch: -0.15 } as { lookX: number; lookY: number; pitch: number };
    case 'feed_koi':
      return { lookX: 338, lookY: 660, pitch: -0.24 };
    case 'feed_birds':
      return { lookX: 1615, lookY: 758, pitch: -0.22 };
    case 'wish':
      return { lookX: item.x, lookY: item.y, pitch: 0.24 };
    case 'kitchen_menu':
      return { lookX: item.x, lookY: item.y, pitch: -0.18 };
    case 'kitchen_table':
      return { lookX: item.x, lookY: item.y, pitch: -0.24 };
    case 'kitchen_sink':
      return { lookX: item.x, lookY: item.y, pitch: -0.2 };
  }
}

export function buildWalkWaypoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): Array<{ x: number; y: number }> {
  let hitsPond = false;
  let hitsSanctuaryBack = false;
  const steps = 18;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sx = fromX + (toX - fromX) * t;
    const sy = fromY + (toY - fromY) * t;

    const onBridge =
      sx >= POND_SPEC.bridgeXMin - 8 &&
      sx <= POND_SPEC.bridgeXMax + 8 &&
      Math.abs(sy - POND_SPEC.bridgeY) <= POND_SPEC.bridgeHalfW - 2;
    const ex = (sx - POND_SPEC.cx) / (POND_SPEC.rx + 4);
    const ey = (sy - POND_SPEC.cy) / (POND_SPEC.ry + 4);
    if (!onBridge && Math.hypot(ex, ey) < 1) {
      hitsPond = true;
    }

    if (sx >= 676 && sx <= 1244 && sy >= -88 && sy < 126) {
      hitsSanctuaryBack = true;
    }
  }

  const waypoints: Array<{ x: number; y: number }> = [];

  if (hitsSanctuaryBack) {
    const sideX = fromX < 960 ? 645 : 1275;
    if (toY < -85) {
      waypoints.push({ x: sideX, y: 155 });
      waypoints.push({ x: sideX, y: -130 });
    } else {
      waypoints.push({ x: sideX, y: 165 });
    }
  }

  // If crossing through shifted north perimeter wall outside back gate (960, -500)
  if ((fromY > -480 && toY < -520) || (fromY < -520 && toY > -480)) {
    const tWall = ((-500 - fromY) / Math.max(1e-4, Math.abs(toY - fromY))) * Math.sign(toY - fromY);
    const gateCrossX = fromX + (toX - fromX) * Math.max(0, Math.min(1, Math.abs(tWall)));
    if (gateCrossX < 928 || gateCrossX > 992) {
      waypoints.push({ x: 960, y: fromY > -500 ? -455 : -545 });
      waypoints.push({ x: 960, y: toY < -500 ? -545 : -455 });
    }
  }

  if (hitsPond) {
    const bridgeAllowed =
      Math.abs(fromY - POND_SPEC.bridgeY) <= 130 &&
      Math.abs(toY - POND_SPEC.bridgeY) <= 130 &&
      ((fromX <= POND_SPEC.bridgeXMin + 12 && toX >= POND_SPEC.bridgeXMax - 12) ||
        (fromX >= POND_SPEC.bridgeXMax - 12 && toX <= POND_SPEC.bridgeXMin + 12));

    if (bridgeAllowed) {
      const enterX = fromX < toX ? POND_SPEC.bridgeXMin - 8 : POND_SPEC.bridgeXMax + 8;
      const exitX = fromX < toX ? POND_SPEC.bridgeXMax + 8 : POND_SPEC.bridgeXMin - 8;
      waypoints.push({ x: enterX, y: POND_SPEC.bridgeY });
      waypoints.push({ x: exitX, y: POND_SPEC.bridgeY });
    } else {
      const candidates = [
        { x: 584, y: 735 },
        { x: 338, y: 568 },
        { x: 338, y: 902 },
        { x: 96, y: 650 },
        { x: 96, y: 825 },
      ];
      let best = candidates[0];
      let bestCost = Infinity;
      for (const c of candidates) {
        const cost = Math.hypot(c.x - fromX, c.y - fromY) + Math.hypot(toX - c.x, toY - c.y);
        if (cost < bestCost) {
          bestCost = cost;
          best = c;
        }
      }
      waypoints.push(best);
    }
  }

  // Avoid bumping head-on into Cây Nguyện Ước, Lư Hương, or Bảo Tháp
  const pointToSegDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
  };

  const trunkStartX = waypoints.length > 0 ? waypoints[waypoints.length - 1].x : fromX;
  const trunkStartY = waypoints.length > 0 ? waypoints[waypoints.length - 1].y : fromY;
  const solidDetours = [
    { x: INTERACTABLES.wish.x, y: INTERACTABLES.wish.y, r: 30, detourOffset: 48 },
    { x: INTERACTABLES.incense.x, y: INTERACTABLES.incense.y, r: 32, detourOffset: 50 },
    { x: STUPA_SPEC.x, y: STUPA_SPEC.y, r: STUPA_SPEC.radius + 4, detourOffset: STUPA_SPEC.radius + 26 },
  ];
  for (const obs of solidDetours) {
    const dStart = Math.hypot(trunkStartX - obs.x, trunkStartY - obs.y);
    const dEnd = Math.hypot(toX - obs.x, toY - obs.y);
    if (
      dStart > obs.r &&
      dEnd > obs.r &&
      pointToSegDist(obs.x, obs.y, trunkStartX, trunkStartY, toX, toY) < obs.r
    ) {
      const side = trunkStartX < obs.x ? -1 : 1;
      waypoints.push({ x: obs.x + side * obs.detourOffset, y: obs.y });
    }
  }

  // Detour gracefully around Hòn Non Bộ basin if straight path crosses it
  const hnStartX = waypoints.length > 0 ? waypoints[waypoints.length - 1].x : fromX;
  const hnStartY = waypoints.length > 0 ? waypoints[waypoints.length - 1].y : fromY;
  let hitsHonNonBo = false;
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    const sx = hnStartX + (toX - hnStartX) * t;
    const sy = hnStartY + (toY - hnStartY) * t;
    if (
      Math.hypot(
        (sx - HON_NON_BO_SPEC.cx) / (HON_NON_BO_SPEC.rx + 8),
        (sy - HON_NON_BO_SPEC.cy) / (HON_NON_BO_SPEC.ry + 8)
      ) < 1
    ) {
      hitsHonNonBo = true;
      break;
    }
  }
  if (hitsHonNonBo) {
    const goNorth = (hnStartY + toY) * 0.5 < HON_NON_BO_SPEC.cy;
    waypoints.push({
      x: HON_NON_BO_SPEC.cx,
      y: HON_NON_BO_SPEC.cy + (goNorth ? -(HON_NON_BO_SPEC.ry + 30) : HON_NON_BO_SPEC.ry + 30),
    });
  }

  // Handle automatic switchback climbing & descending on Dãy Núi Liên Sơn
  const fromInMountain = isInsideMountainBase(fromX, fromY);
  const toInMountain = isInsideMountainBase(toX, toY);
  const fromProj = projectOntoMountainTrail(fromX, fromY);
  const toProj = projectOntoMountainTrail(toX, toY);
  const fromElevated = fromInMountain && fromProj.onTrail && fromProj.elev > 0.6;
  const toElevated = toInMountain && (toProj.elev > 0.6 || toProj.onSummit);

  if (toInMountain && !toProj.onTrail) {
    // Clicking any craggy peak on the mountain guides character smoothly to Summit Overlook
    toX = MOUNTAIN_SPEC.summitX;
    toY = MOUNTAIN_SPEC.summitY;
  }
  const finalToProj = projectOntoMountainTrail(toX, toY);
  const targetIsElevated = isInsideMountainBase(toX, toY) && (finalToProj.elev > 0.6 || finalToProj.onSummit);

  if (!fromElevated && targetIsElevated) {
    const startX = waypoints.length > 0 ? waypoints[waypoints.length - 1].x : fromX;
    const startY = waypoints.length > 0 ? waypoints[waypoints.length - 1].y : fromY;
    if (Math.hypot(startX - MOUNTAIN_TRAIL_WAYPOINTS[0].x, startY - MOUNTAIN_TRAIL_WAYPOINTS[0].y) > 20) {
      waypoints.push({ x: MOUNTAIN_TRAIL_WAYPOINTS[0].x, y: MOUNTAIN_TRAIL_WAYPOINTS[0].y });
    }
    const maxWpIdx = finalToProj.onSummit ? MOUNTAIN_TRAIL_WAYPOINTS.length - 1 : finalToProj.segIdx;
    for (let i = 1; i <= maxWpIdx; i++) {
      waypoints.push({ x: MOUNTAIN_TRAIL_WAYPOINTS[i].x, y: MOUNTAIN_TRAIL_WAYPOINTS[i].y });
    }
    waypoints.push({ x: toX, y: toY });
    return waypoints;
  }

  if (fromElevated && !targetIsElevated) {
    for (let i = fromProj.segIdx; i >= 0; i--) {
      waypoints.push({ x: MOUNTAIN_TRAIL_WAYPOINTS[i].x, y: MOUNTAIN_TRAIL_WAYPOINTS[i].y });
    }
    waypoints.push({ x: toX, y: toY });
    return waypoints;
  }

  if (fromElevated && targetIsElevated) {
    if (finalToProj.segIdx > fromProj.segIdx) {
      for (let i = fromProj.segIdx + 1; i <= finalToProj.segIdx; i++) {
        waypoints.push({ x: MOUNTAIN_TRAIL_WAYPOINTS[i].x, y: MOUNTAIN_TRAIL_WAYPOINTS[i].y });
      }
    } else if (finalToProj.segIdx < fromProj.segIdx) {
      for (let i = fromProj.segIdx; i >= finalToProj.segIdx + 1; i--) {
        waypoints.push({ x: MOUNTAIN_TRAIL_WAYPOINTS[i].x, y: MOUNTAIN_TRAIL_WAYPOINTS[i].y });
      }
    }
    waypoints.push({ x: toX, y: toY });
    return waypoints;
  }

  waypoints.push({ x: toX, y: toY });
  return waypoints;
}

export interface TempleRoofZone {
  id: 'main' | 'bell' | 'woodfish' | 'kitchen' | 'gate' | 'stupa';
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  roofEavesY3D: number;
  roofPeakY3D: number;
}

export const TEMPLE_ROOF_ZONES: TempleRoofZone[] = [
  { id: 'main', minX: 645, maxX: 1275, minY: -115, maxY: 512, roofEavesY3D: 4.85, roofPeakY3D: 9.1 },
  { id: 'bell', minX: 522, maxX: 688, minY: 422, maxY: 583, roofEavesY3D: 3.7, roofPeakY3D: 5.9 },
  { id: 'woodfish', minX: 1232, maxX: 1398, minY: 422, maxY: 583, roofEavesY3D: 3.7, roofPeakY3D: 5.9 },
  { id: 'kitchen', minX: 1428, maxX: 1798, minY: 235, maxY: 625, roofEavesY3D: 3.85, roofPeakY3D: 6.2 },
  { id: 'gate', minX: 815, maxX: 1105, minY: 1038, maxY: 1165, roofEavesY3D: 4.05, roofPeakY3D: 6.45 },
  { id: 'stupa', minX: 892, maxX: 1028, minY: -363, maxY: -227, roofEavesY3D: 20.8, roofPeakY3D: 24.8 },
];

export function getTempleRoofAt(x: number, y: number): TempleRoofZone | null {
  for (const zone of TEMPLE_ROOF_ZONES) {
    if (x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY) {
      return zone;
    }
  }
  return null;
}

export function isUnderTempleRoof(x: number, y: number): boolean {
  return getTempleRoofAt(x, y) !== null;
}

export function getRoofSurfaceHeight3D(x: number, y: number): number {
  const zone = getTempleRoofAt(x, y);
  if (!zone) return 0;
  const cx = (zone.minX + zone.maxX) * 0.5;
  const cy = (zone.minY + zone.maxY) * 0.5;
  const hw = Math.max(1, (zone.maxX - zone.minX) * 0.5);
  const hh = Math.max(1, (zone.maxY - zone.minY) * 0.5);
  const edgeFrac = Math.min(1, Math.max(Math.abs(x - cx) / hw, Math.abs(y - cy) / hh));
  return zone.roofEavesY3D + (1 - edgeFrac) * (zone.roofPeakY3D - zone.roofEavesY3D);
}

export function getGroundElevation3D(x: number, y: number): number {
  // Climbable Mountain Trail & Summit Overlook Plateau (Dãy Núi Liên Sơn)
  if (isInsideMountainBase(x, y)) {
    const mProj = projectOntoMountainTrail(x, y);
    if (mProj.onSummit || mProj.dist <= MOUNTAIN_SPEC.trailHalfWidth + 6) {
      return mProj.elev;
    }
  }
  // Arched wooden bridge across Ao Sen
  if (
    x >= POND_SPEC.bridgeXMin &&
    x <= POND_SPEC.bridgeXMax &&
    Math.abs(y - POND_SPEC.bridgeY) <= POND_SPEC.bridgeHalfW + 2
  ) {
    const t = Math.max(0, Math.min(1, (x - POND_SPEC.bridgeXMin) / (POND_SPEC.bridgeXMax - POND_SPEC.bridgeXMin)));
    return 0.24 + Math.sin(t * Math.PI) * 0.68;
  }
  // Bảo Tháp stone plaza deck behind Chánh Điện
  if (Math.hypot(x - STUPA_SPEC.x, y - STUPA_SPEC.y) <= STUPA_SPEC.deckHalf + 18) return 0.16;
  // Đài Cầu Siêu terrace in Công Viên Cầu Siêu
  if (Math.hypot(x - INTERACTABLES.memorial.x, y - INTERACTABLES.memorial.y) <= 68) return 0.12;
  // Coastal timber viewing deck behind north wall
  if (x >= 840 && x <= 1080 && y >= -605 && y <= -522) return 0.12;
  // Gian Bếp Chay wooden platform in NE courtyard
  if (x >= 1442 && x <= 1784 && y >= 262 && y <= 612) return 0.14;
  // Flagstone patio under Pink Bougainvillea Pergola
  if (
    x >= PERGOLA_SPEC.minX - 6 &&
    x <= PERGOLA_SPEC.maxX + 6 &&
    y >= PERGOLA_SPEC.minY - 6 &&
    y <= PERGOLA_SPEC.maxY + 6
  ) {
    return 0.08;
  }
  // Chánh Điện raised wooden terrace
  if (x >= 680 && x <= 1240 && y >= -85 && y <= 495) return 0.24;
  // Lầu Chuông & Gác Mõ raised base
  if (x >= 537 && x <= 673 && y >= 443 && y <= 567) return 0.14;
  if (x >= 1247 && x <= 1383 && y >= 443 && y <= 567) return 0.14;
  return 0;
}
