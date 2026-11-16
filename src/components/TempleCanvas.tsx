import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  CHARACTERS,
  CUSHION_POSITIONS,
  FLOWER_CATALOG,
  GARDEN_PLOT_POSITIONS,
  HON_NON_BO_SPEC,
  INTERACTABLES,
  PERGOLA_BENCH_SPECS,
  PERGOLA_SPEC,
  PRECEPTS_STELE_SPEC,
  STUPA_DECK_CAPACITY,
  STUPA_DECK_SLOTS,
  VEGETARIAN_DRINK_MENU,
  VEGETARIAN_FOOD_MENU,
  WORLD_HEIGHT,
  WORLD_MIN_X,
  WORLD_MIN_Y,
  WORLD_TOTAL_HEIGHT,
  WORLD_TOTAL_WIDTH,
  WORLD_WIDTH,
  getBenchOccupancy,
  getEffectiveFlowerStage,
  type Direction,
  type GardenPlotState,
  type KitchenMealState,
  type LanternColor,
  type PlayerPose,
  type PondLanternState,
  type RitualAction,
  type RoomPlayer,
  type RoomState,
  type TreeWishState,
} from '../shared/types.ts';
import buddhaAltarPortraitUrl from '../assets/images/buddha_statue_majestic_1794566773955.jpg';
import quanAmAltarPortraitUrl from '../assets/images/quan_am_statue_majestic_1794566774640.jpg';
import laHanTichTruongUrl from '../assets/images/la_han_tich_truong_cutout.png';
import laHanThienDinhUrl from '../assets/images/la_han_thien_dinh_cutout.png';
import laHanMinhChauUrl from '../assets/images/la_han_minh_chau_cutout.png';
import thanHoPhapTraiUrl from '../assets/images/than_ho_phap_trai_cutout.png';
import thanHoPhapPhaiUrl from '../assets/images/than_ho_phap_phai_cutout.png';
import {
  COURTYARD_ARHAT_SPECS,
  MEMORIAL_GRAVE_SPECS,
  MOUNTAIN_PEAKS,
  MOUNTAIN_SPEC,
  MOUNTAIN_TRAIL_WAYPOINTS,
  PATH_LANTERN_POSTS,
  POND_SPEC,
  SANCTUARY_GUARDIAN_SPECS,
  STUPA_DECK_WALK_HALF,
  STUPA_SPEC,
  buildWalkWaypoints,
  findNearbyInteraction,
  getGroundElevation3D,
  getRitualStandSpot,
  getZoneName,
  isUnderTempleRoof,
  resolveWalkPosition,
  type CourtyardArhatArtVariant,
  type CourtyardArhatSpec,
  type PathLanternPostSpec,
  type SanctuaryGuardianArtVariant,
  type SanctuaryGuardianSpec,
} from '../shared/templeNavigation.ts';
import {
  getTempleAtmosphere,
  type AtmospherePreference,
  type TempleAtmosphereSnapshot,
} from '../shared/templeAtmosphere.ts';

const cachedAltarImages: Partial<Record<'buddha' | 'quanAm', HTMLImageElement>> = {};
function getAltarImage(kind: 'buddha' | 'quanAm'): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  if (!cachedAltarImages[kind]) {
    const img = new Image();
    img.src = kind === 'quanAm' ? quanAmAltarPortraitUrl : buddhaAltarPortraitUrl;
    cachedAltarImages[kind] = img;
  }
  const img = cachedAltarImages[kind];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

const COURTYARD_STATUE_IMAGE_URLS: Record<
  CourtyardArhatArtVariant | SanctuaryGuardianArtVariant,
  string
> = {
  'tich-truong': laHanTichTruongUrl,
  'thien-dinh': laHanThienDinhUrl,
  'minh-chau': laHanMinhChauUrl,
  'guardian-left': thanHoPhapTraiUrl,
  'guardian-right': thanHoPhapPhaiUrl,
};

const cachedCourtyardStatueImages: Partial<
  Record<CourtyardArhatArtVariant | SanctuaryGuardianArtVariant, HTMLImageElement>
> = {};
function getCourtyardStatueImage(
  variant: CourtyardArhatArtVariant | SanctuaryGuardianArtVariant
): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  if (!cachedCourtyardStatueImages[variant]) {
    const img = new Image();
    img.src = COURTYARD_STATUE_IMAGE_URLS[variant];
    cachedCourtyardStatueImages[variant] = img;
  }
  const img = cachedCourtyardStatueImages[variant];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export interface VisualEffect {
  id: number;
  kind: RitualAction;
  x: number;
  y: number;
  createdAt: number;
}

export interface RitualRequest {
  id: number;
  action: RitualAction;
}

interface TempleCanvasProps {
  room: RoomState;
  currentUserId: string;
  lowResourceMode: boolean;
  effects: VisualEffect[];
  ritualRequest?: RitualRequest | null;
  kitchenMeals?: KitchenMealState[];
  initialPosition?: { x: number; y: number; direction: Direction } | null;
  livePositionRef?: MutableRefObject<{ x: number; y: number; direction: Direction }>;
  paused?: boolean;
  topHudInsetPx?: number;
  bottomHudInsetPx?: number;
  atmospherePref?: AtmospherePreference;
  zoomScale?: number;
  onZoomChange?: (nextZoom: number) => void;
  viewingStupa?: boolean;
  activeIncenseCount?: number;
  latestMemorial?: { deceasedName: string; createdAt: number } | null;
  onMoveLocal: (x: number, y: number, direction: Direction, pose: PlayerPose) => void;
  onSitCushion: (cushionIndex: number) => void;
  onSitBench: (benchIndex: number) => void;
  onTriggerInteractable: (action: RitualAction) => void;
  onKitchenMealTap?: (target: 'food' | 'drink', mealId?: string) => void;
  onSelectGardenPlot?: (plotIndex: number) => void;
  onInspectPrecepts?: () => void;
}

interface RenderPos {
  x: number;
  y: number;
  direction: Direction;
  pose: PlayerPose;
}

interface WalkTarget {
  x: number;
  y: number;
  waypoints?: Array<{ x: number; y: number }>;
  createdAt: number;
  pendingAction?: () => void;
}

interface ActiveRitualState {
  action: RitualAction;
  phase: 'walk' | 'perform';
  startedPerformAt: number;
  targetX: number;
  targetY: number;
  faceDir: Direction;
  mealTarget?: 'food' | 'drink';
  mealId?: string;
}

interface ViewportMetrics {
  cssW: number;
  cssH: number;
  dpr: number;
  worldScale: number;
  viewW: number;
  viewH: number;
}

const STONE_LANTERNS = [
  { x: 830, y: 1035 },
  { x: 1090, y: 1035 },
  { x: 830, y: 895 },
  { x: 1090, y: 895 },
  { x: 548, y: 695 },
  { x: 158, y: 695 },
  { x: 705, y: 575 },
  { x: 1215, y: 575 },
  { x: 1420, y: 625 },
  { x: 440, y: 395 },
  { x: -310, y: 265 },
  { x: 45, y: 115 },
  { x: 45, y: 425 },
  { x: 845, y: -592 },
  { x: 1075, y: -592 },
  { x: 165, y: -395 },
  { x: 495, y: -395 },
  { x: 165, y: -110 },
  { x: 495, y: -110 },
];

const BAMBOO_CLUSTERS = [
  { x: 1450, y: 885, stalks: 5 },
  { x: 1615, y: 920, stalks: 6 },
  { x: 1775, y: 875, stalks: 5 },
  { x: 1530, y: 1005, stalks: 6 },
  { x: 1715, y: 1015, stalks: 5 },
  { x: 170, y: 1015, stalks: 5 },
  { x: 310, y: 1045, stalks: 4 },
];

function computeViewportMetrics(
  cssW: number,
  cssH: number,
  lowResourceMode: boolean,
  zoomScale = 1
): ViewportMetrics {
  const safeW = Math.max(320, cssW);
  const safeH = Math.max(360, cssH);
  const dpr = lowResourceMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  const minScaleToFitWorld = Math.max(safeW / WORLD_TOTAL_WIDTH, safeH / WORLD_TOTAL_HEIGHT);
  const targetPortraitScale = Math.min(1.0, Math.max(0.68, safeW / 540));
  const baseScale = Math.max(minScaleToFitWorld, targetPortraitScale);
  const worldScale = Math.max(minScaleToFitWorld, Math.min(2.5, baseScale * zoomScale));

  const viewW = Math.min(WORLD_TOTAL_WIDTH, safeW / worldScale);
  const viewH = Math.min(WORLD_TOTAL_HEIGHT, safeH / worldScale);

  return { cssW: safeW, cssH: safeH, dpr, worldScale, viewW, viewH };
}

function getMiniMapRect(viewW: number, topInsetWorld: number) {
  const w = Math.min(144, Math.max(108, Math.round(viewW * 0.22)));
  const h = Math.round(w * (WORLD_TOTAL_HEIGHT / WORLD_TOTAL_WIDTH));
  return {
    x: viewW - w - 12,
    y: topInsetWorld + 8,
    w,
    h,
  };
}

export function TempleCanvas({
  room,
  currentUserId,
  lowResourceMode,
  effects,
  ritualRequest = null,
  kitchenMeals = [],
  initialPosition = null,
  livePositionRef,
  paused = false,
  topHudInsetPx = 60,
  bottomHudInsetPx = 120,
  atmospherePref,
  zoomScale = 1,
  onZoomChange,
  viewingStupa = false,
  activeIncenseCount,
  latestMemorial = null,
  onMoveLocal,
  onSitCushion,
  onSitBench,
  onTriggerInteractable,
  onKitchenMealTap,
  onSelectGardenPlot,
  onInspectPrecepts,
}: TempleCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectiveZoom = viewingStupa ? 0.52 : zoomScale;
  const metricsRef = useRef<ViewportMetrics>(
    typeof window !== 'undefined'
      ? computeViewportMetrics(window.innerWidth, window.innerHeight, lowResourceMode, effectiveZoom)
      : { cssW: 390, cssH: 844, dpr: 1, worldScale: 0.72, viewW: 540, viewH: 1170 }
  );
  const insetsRef = useRef({ top: topHudInsetPx, bottom: bottomHudInsetPx });
  insetsRef.current = { top: topHudInsetPx, bottom: bottomHudInsetPx };
  const atmospherePrefRef = useRef<AtmospherePreference | undefined>(atmospherePref);
  atmospherePrefRef.current = atmospherePref;
  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const viewingStupaRef = useRef(viewingStupa);
  viewingStupaRef.current = viewingStupa;
  const activeIncenseRef = useRef(activeIncenseCount ?? Math.min(2, Math.max(1, room.incenseCount)));
  activeIncenseRef.current = activeIncenseCount ?? Math.min(2, Math.max(1, room.incenseCount));
  const latestMemorialRef = useRef(latestMemorial);
  latestMemorialRef.current = latestMemorial;

  const keysRef = useRef<Set<string>>(new Set());
  const targetPointRef = useRef<WalkTarget | null>(null);
  const activeRitualRef = useRef<ActiveRitualState | null>(null);
  const lastHandledRitualReqIdRef = useRef<number | null>(ritualRequest?.id ?? null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  if (paused || viewingStupa) {
    targetPointRef.current = null;
    activeRitualRef.current = null;
    keysRef.current.clear();
  }
  const koiTimeRef = useRef<number>(0);
  const smoothFeedPullRef = useRef<number>(0);
  const renderPositionsRef = useRef<Map<string, RenderPos>>(new Map());
  const localPosRef = useRef<RenderPos>({
    x: initialPosition?.x ?? 960,
    y: initialPosition?.y ?? 1040,
    direction: initialPosition?.direction ?? 'up',
    pose: 'idle',
  });
  const cameraRef = useRef<{ x: number; y: number; initialized: boolean }>({
    x: (initialPosition?.x ?? 960) - metricsRef.current.viewW / 2,
    y: (initialPosition?.y ?? 1040) - metricsRef.current.viewH / 2,
    initialized: false,
  });
  const roofAlphaRef = useRef<{
    main: number;
    bell: number;
    woodfish: number;
    gate: number;
    kitchen: number;
  }>({
    main: 1,
    bell: 1,
    woodfish: 1,
    gate: 1,
    kitchen: 1,
  });
  const lastNetSentRef = useRef<number>(0);
  const hoverLabelRef = useRef<{ text: string; x: number; y: number } | null>(null);
  const onTriggerInteractableRef = useRef(onTriggerInteractable);
  onTriggerInteractableRef.current = onTriggerInteractable;
  const onKitchenMealTapRef = useRef(onKitchenMealTap);
  onKitchenMealTapRef.current = onKitchenMealTap;
  const kitchenMealsRef = useRef(kitchenMeals);
  kitchenMealsRef.current = kitchenMeals;
  const onSelectGardenPlotRef = useRef(onSelectGardenPlot);
  onSelectGardenPlotRef.current = onSelectGardenPlot;
  const onInspectPreceptsRef = useRef(onInspectPrecepts);
  onInspectPreceptsRef.current = onInspectPrecepts;

  // Sync canvas backing dimensions & zoom metrics smoothly on resize / zoom change
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const metrics = computeViewportMetrics(
        rect.width,
        rect.height,
        lowResourceMode,
        viewingStupa ? 0.52 : zoomScale
      );
      metricsRef.current = metrics;
      const targetW = Math.round(metrics.cssW * metrics.dpr);
      const targetH = Math.round(metrics.cssH * metrics.dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      cameraRef.current.x = clampCamX(cameraRef.current.x, metrics.viewW);
      cameraRef.current.y = clampCamY(cameraRef.current.y, metrics.viewH);
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [lowResourceMode, zoomScale, viewingStupa]);

  // Wheel & Two-Finger Pinch Zoom on 2D Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      if (pausedRef.current) return;
      e.preventDefault();
      const next = Math.max(0.45, Math.min(2.2, zoomScaleRef.current - e.deltaY * 0.0012));
      onZoomChangeRef.current?.(Number(next.toFixed(2)));
    };

    let lastTouchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.hypot(dx, dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDist > 0) {
        e.preventDefault();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = dist - lastTouchDist;
        lastTouchDist = dist;
        const next = Math.max(0.45, Math.min(2.2, zoomScaleRef.current + delta * 0.0038));
        onZoomChangeRef.current?.(Number(next.toFixed(2)));
      }
    };
    const onTouchEnd = () => {
      lastTouchDist = 0;
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Sync local position when ascending/descending Bảo Tháp 9th-tier Observation Deck
  const prevViewingStupaRef = useRef(viewingStupa);
  const me = room.players.find((p) => p.userId === currentUserId);
  useEffect(() => {
    const wasViewing = prevViewingStupaRef.current;
    prevViewingStupaRef.current = viewingStupa;
    if (viewingStupa && !wasViewing) {
      const slotIdx =
        me?.stupaSlot !== null && me?.stupaSlot !== undefined && me.stupaSlot >= 0
          ? me.stupaSlot
          : Math.max(0, room.stupaSlots.indexOf(currentUserId));
      const slotPos = STUPA_DECK_SLOTS[Math.min(STUPA_DECK_SLOTS.length - 1, Math.max(0, slotIdx))];
      targetPointRef.current = null;
      activeRitualRef.current = null;
      localPosRef.current = {
        x: slotPos.x,
        y: slotPos.y,
        direction: 'down',
        pose: 'idle',
      };
      if (livePositionRef) {
        livePositionRef.current = { x: slotPos.x, y: slotPos.y, direction: 'down' };
      }
    } else if (!viewingStupa && wasViewing) {
      targetPointRef.current = null;
      activeRitualRef.current = null;
      localPosRef.current = {
        x: INTERACTABLES.stupa.x,
        y: INTERACTABLES.stupa.y,
        direction: 'down',
        pose: 'idle',
      };
      if (livePositionRef) {
        livePositionRef.current = {
          x: INTERACTABLES.stupa.x,
          y: INTERACTABLES.stupa.y,
          direction: 'down',
        };
      }
    }
  }, [viewingStupa, me?.stupaSlot, room.stupaSlots, currentUserId, livePositionRef]);

  // Sync local position when room initializes or self cushion/bench state changes
  useEffect(() => {
    if (!me) return;
    const isSeated =
      me.cushionIndex !== null || (me.benchIndex !== null && me.benchIndex !== undefined);
    if (isSeated) {
      if (targetPointRef.current || activeRitualRef.current || localPosRef.current.pose === 'walk') {
        return;
      }
      localPosRef.current = {
        x: me.x,
        y: me.y,
        direction: me.direction,
        pose: me.pose,
      };
      targetPointRef.current = null;
    } else if (!renderPositionsRef.current.has(currentUserId)) {
      const startX = initialPosition?.x ?? me.x;
      const startY = initialPosition?.y ?? me.y;
      const startDir = initialPosition?.direction ?? me.direction;
      localPosRef.current = {
        x: startX,
        y: startY,
        direction: startDir,
        pose: me.pose,
      };
      const { viewW, viewH } = metricsRef.current;
      cameraRef.current = {
        x: clampCamX(startX - viewW / 2, viewW),
        y: clampCamY(startY - viewH / 2, viewH),
        initialized: true,
      };
    }
  }, [me?.cushionIndex, me?.benchIndex, me?.x, me?.y, currentUserId]);

  const startRitualSequence = (
    action: RitualAction,
    mealTarget?: 'food' | 'drink',
    mealId?: string
  ) => {
    const spot = getRitualStandSpot(action);
    const local = localPosRef.current;
    const dist = Math.hypot(local.x - spot.x, local.y - spot.y);

    if (
      dist <= 10 &&
      me?.cushionIndex === null &&
      (me?.benchIndex === null || me?.benchIndex === undefined)
    ) {
      targetPointRef.current = null;
      local.x = spot.x;
      local.y = spot.y;
      local.direction = spot.faceDir;
      local.pose = 'pray';
      activeRitualRef.current = {
        action,
        phase: 'perform',
        startedPerformAt: performance.now(),
        targetX: spot.x,
        targetY: spot.y,
        faceDir: spot.faceDir,
        mealTarget,
        mealId,
      };
      onMoveLocal(Math.round(local.x), Math.round(local.y), spot.faceDir, 'pray');
      return;
    }

    const waypoints = buildWalkWaypoints(local.x, local.y, spot.x, spot.y);
    const firstWaypoint = waypoints[0] ?? { x: spot.x, y: spot.y };
    activeRitualRef.current = {
      action,
      phase: 'walk',
      startedPerformAt: 0,
      targetX: spot.x,
      targetY: spot.y,
      faceDir: spot.faceDir,
      mealTarget,
      mealId,
    };
    targetPointRef.current = {
      x: firstWaypoint.x,
      y: firstWaypoint.y,
      waypoints: waypoints.slice(1),
      createdAt: performance.now(),
      pendingAction: () => {
        const cur = localPosRef.current;
        cur.x = spot.x;
        cur.y = spot.y;
        cur.direction = spot.faceDir;
        cur.pose = 'pray';
        activeRitualRef.current = {
          action,
          phase: 'perform',
          startedPerformAt: performance.now(),
          faceDir: spot.faceDir,
          targetX: spot.x,
          targetY: spot.y,
          mealTarget,
          mealId,
        };
        onMoveLocal(Math.round(cur.x), Math.round(cur.y), spot.faceDir, 'pray');
      },
    };
  };

  // Trigger automatic walk + ritual performance when user selects a ritual from HUD
  useEffect(() => {
    if (!ritualRequest) return;
    if (lastHandledRitualReqIdRef.current === ritualRequest.id) return;
    lastHandledRitualReqIdRef.current = ritualRequest.id;
    startRitualSequence(ritualRequest.action);
  }, [ritualRequest]);

  // Keyboard movement & E-interact listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
        keysRef.current.add(k);
        targetPointRef.current = null;
        if (activeRitualRef.current) {
          activeRitualRef.current = null;
        }
      }

      if (k === 'e') {
        if (activeRitualRef.current?.phase === 'perform') return;
        const nearby = findNearbyInteraction(localPosRef.current.x, localPosRef.current.y);
        if (nearby?.kind === 'precepts_stele') {
          onInspectPreceptsRef.current?.();
        } else if (nearby?.kind === 'garden_plot') {
          onSelectGardenPlotRef.current?.(nearby.plotIndex);
        } else if (nearby?.kind === 'interactable') {
          startRitualSequence(nearby.action);
        } else if (nearby?.kind === 'cushion') {
          onSitCushion(nearby.cushionIndex);
        } else if (nearby?.kind === 'bench') {
          onSitBench(nearby.benchIndex);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onSitCushion, onSitBench]);

  // Main lightweight animation, camera & game loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastDrawTime = 0;
    const minFrameMs = lowResourceMode ? 1000 / 24 : 1000 / 60;

    const step = (now: number) => {
      rafId = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Update local movement (frozen while transitioning to 3D so position stays exact)
      const keys = keysRef.current;
      let vx = 0;
      let vy = 0;
      if (!pausedRef.current) {
        if (keys.has('w') || keys.has('arrowup')) vy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) vy += 1;
        if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
        if (keys.has('d') || keys.has('arrowright')) vx += 1;
      }

      const local = localPosRef.current;
      let moved = false;
      let nextPose: PlayerPose = local.pose;
      let nextDir: Direction = local.direction;

      if (pausedRef.current) {
        if (local.pose === 'walk') {
          nextPose = 'idle';
        }
      } else if (viewingStupaRef.current) {
        if (vx !== 0 || vy !== 0) {
          const len = Math.hypot(vx, vy);
          const deckSpeed = 115;
          const rawX = local.x + (vx / len) * deckSpeed * dt;
          const rawY = local.y + (vy / len) * deckSpeed * dt;
          local.x = Math.max(
            STUPA_SPEC.cx - STUPA_DECK_WALK_HALF,
            Math.min(STUPA_SPEC.cx + STUPA_DECK_WALK_HALF, rawX)
          );
          local.y = Math.max(
            STUPA_SPEC.cy - STUPA_DECK_WALK_HALF,
            Math.min(STUPA_SPEC.cy + STUPA_DECK_WALK_HALF, rawY)
          );
          nextDir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
          nextPose = 'walk';
          moved = true;
        } else if (local.pose === 'walk') {
          nextPose = 'idle';
          moved = true;
        }
      } else if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy);
        const speed = 195;
        const resolved = resolveWalkPosition(
          local.x,
          local.y,
          local.x + (vx / len) * speed * dt,
          local.y + (vy / len) * speed * dt
        );
        local.x = resolved.x;
        local.y = resolved.y;
        nextDir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
        nextPose = 'walk';
        moved = true;
      } else if (activeRitualRef.current?.phase === 'perform') {
        const activeRitual = activeRitualRef.current;
        const performDur = activeRitual.action === 'bow' ? 1250 : 950;
        nextDir = activeRitual.faceDir;
        nextPose = 'pray';
        if (now - activeRitual.startedPerformAt >= performDur) {
          const completedAction = activeRitual.action;
          const mealTarget = activeRitual.mealTarget;
          const mealId = activeRitual.mealId;
          activeRitualRef.current = null;
          nextPose = 'idle';
          moved = true;
          if (completedAction === 'kitchen_table' && mealTarget && onKitchenMealTapRef.current) {
            onKitchenMealTapRef.current(mealTarget, mealId);
          } else {
            onTriggerInteractableRef.current(completedAction);
          }
        }
      } else if (targetPointRef.current) {
        const target = targetPointRef.current;
        const dx = target.x - local.x;
        const dy = target.y - local.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 7) {
          const resolved = resolveWalkPosition(local.x, local.y, target.x, target.y);
          local.x = resolved.x;
          local.y = resolved.y;
          if (target.waypoints && target.waypoints.length > 0) {
            const [nextWp, ...restWps] = target.waypoints;
            targetPointRef.current = {
              x: nextWp.x,
              y: nextWp.y,
              waypoints: restWps,
              createdAt: now,
              pendingAction: target.pendingAction,
            };
            nextPose = 'walk';
            moved = true;
          } else {
            const pending = target.pendingAction;
            targetPointRef.current = null;
            nextPose = 'idle';
            moved = true;
            if (pending) {
              pending();
              nextPose = local.pose;
              nextDir = local.direction;
            }
          }
        } else {
          const speed = 215;
          const stepX = local.x + (dx / dist) * speed * dt;
          const stepY = local.y + (dy / dist) * speed * dt;
          const resolved = resolveWalkPosition(local.x, local.y, stepX, stepY);
          const actualMove = Math.hypot(resolved.x - local.x, resolved.y - local.y);
          local.x = resolved.x;
          local.y = resolved.y;
          nextDir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
          nextPose = 'walk';
          moved = true;
          if (actualMove < 0.35 && now - target.createdAt > 180) {
            if (target.waypoints && target.waypoints.length > 0) {
              const [nextWp, ...restWps] = target.waypoints;
              targetPointRef.current = {
                x: nextWp.x,
                y: nextWp.y,
                waypoints: restWps,
                createdAt: now,
                pendingAction: target.pendingAction,
              };
            } else {
              const pending = target.pendingAction;
              targetPointRef.current = null;
              nextPose = 'idle';
              if (pending && Math.hypot(target.x - local.x, target.y - local.y) < 75) {
                pending();
                nextPose = local.pose;
                nextDir = local.direction;
              } else {
                activeRitualRef.current = null;
              }
            }
          }
        }
      } else if (local.pose === 'walk') {
        nextPose = 'idle';
        moved = true;
      }

      local.direction = nextDir;
      local.pose = nextPose;

      if (livePositionRef) {
        livePositionRef.current = { x: local.x, y: local.y, direction: local.direction };
      }

      if (moved && (now - lastNetSentRef.current > 80 || nextPose === 'idle' || nextPose === 'pray')) {
        lastNetSentRef.current = now;
        onMoveLocal(Math.round(local.x), Math.round(local.y), nextDir, nextPose);
      }

      // Smoothly update camera to follow local player or frame panoramic overlook from Bảo Tháp summit
      const metrics = metricsRef.current;
      const cam = cameraRef.current;
      const bottomInsetWorld = insetsRef.current.bottom / metrics.worldScale;
      const topInsetWorld = insetsRef.current.top / metrics.worldScale;
      const verticalBias = (bottomInsetWorld - topInsetWorld) * 0.25;
      const focusX = viewingStupaRef.current ? STUPA_SPEC.cx : local.x;
      const focusY = viewingStupaRef.current ? 180 : local.y;
      const desiredCamX = clampCamX(focusX - metrics.viewW / 2, metrics.viewW);
      const desiredCamY = clampCamY(focusY - (metrics.viewH / 2 - verticalBias), metrics.viewH);

      if (!cam.initialized) {
        cam.x = desiredCamX;
        cam.y = desiredCamY;
        cam.initialized = true;
      } else {
        const camLerp = Math.min(1, dt * (viewingStupaRef.current ? 4.5 : 7.5));
        cam.x += (desiredCamX - cam.x) * camLerp;
        cam.y += (desiredCamY - cam.y) * camLerp;
      }

      // Smoothly fade roofs when player walks under Chánh Điện / Pavilions / Tam Quan / Gian Bếp Chay
      const insideMain = local.x >= 675 && local.x <= 1245 && local.y >= -95 && local.y <= 515;
      const insideBell = local.x >= 525 && local.x <= 685 && local.y >= 420 && local.y <= 575;
      const insideWoodfish = local.x >= 1235 && local.x <= 1395 && local.y >= 420 && local.y <= 575;
      const underGate = local.x >= 815 && local.x <= 1105 && local.y >= 1065;
      const insideKitchen = local.x >= 1432 && local.x <= 1794 && local.y >= 252 && local.y <= 622;
      const alphaLerp = Math.min(1, dt * 8);
      roofAlphaRef.current.main += ((insideMain ? 0.16 : 1) - roofAlphaRef.current.main) * alphaLerp;
      roofAlphaRef.current.bell += ((insideBell ? 0.22 : 1) - roofAlphaRef.current.bell) * alphaLerp;
      roofAlphaRef.current.woodfish += ((insideWoodfish ? 0.22 : 1) - roofAlphaRef.current.woodfish) * alphaLerp;
      roofAlphaRef.current.gate += ((underGate ? 0.3 : 1) - roofAlphaRef.current.gate) * alphaLerp;
      roofAlphaRef.current.kitchen += ((insideKitchen ? 0.2 : 1) - roofAlphaRef.current.kitchen) * alphaLerp;

      // Interpolate remote players smoothly
      const activeIds = new Set<string>();
      for (const p of room.players) {
        activeIds.add(p.userId);
        if (p.userId === currentUserId) {
          renderPositionsRef.current.set(p.userId, { ...local });
        } else {
          const cur = renderPositionsRef.current.get(p.userId);
          if (!cur) {
            renderPositionsRef.current.set(p.userId, {
              x: p.x,
              y: p.y,
              direction: p.direction,
              pose: p.pose,
            });
          } else {
            cur.x += (p.x - cur.x) * Math.min(1, dt * 12);
            cur.y += (p.y - cur.y) * Math.min(1, dt * 12);
            cur.direction = p.direction;
            cur.pose = p.pose;
          }
        }
      }
      for (const uid of renderPositionsRef.current.keys()) {
        if (!activeIds.has(uid)) {
          renderPositionsRef.current.delete(uid);
        }
      }

      const activeFeedEf = effects.find((e) => e.kind === 'feed_koi' && now - e.createdAt < 9000);
      const rawFeedPull = activeFeedEf
        ? Math.sin(Math.min(1, (now - activeFeedEf.createdAt) / 9000) * Math.PI)
        : 0;
      smoothFeedPullRef.current +=
        (rawFeedPull - smoothFeedPullRef.current) * Math.min(1, dt * 2.5);
      koiTimeRef.current += dt * 1000 * (1 + smoothFeedPullRef.current * 0.32);

      if (now - lastDrawTime < minFrameMs) return;
      lastDrawTime = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(
        metrics.dpr * metrics.worldScale,
        0,
        0,
        metrics.dpr * metrics.worldScale,
        0,
        0
      );

      const atmosphere = getTempleAtmosphere(Date.now(), atmospherePrefRef.current);

      drawTempleScene(
        ctx,
        now,
        room,
        currentUserId,
        renderPositionsRef.current,
        local,
        cam,
        metrics,
        topInsetWorld,
        bottomInsetWorld,
        roofAlphaRef.current,
        targetPointRef.current,
        activeRitualRef.current,
        effects,
        lowResourceMode,
        hoverLabelRef.current,
        kitchenMealsRef.current,
        koiTimeRef.current,
        smoothFeedPullRef.current,
        atmosphere,
        activeIncenseRef.current,
        latestMemorialRef.current,
        viewingStupaRef.current
      );
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [room, currentUserId, lowResourceMode, effects, onMoveLocal]);

  const toCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const metrics = metricsRef.current;
    if (!canvas) {
      return { vx: 240, vy: 400, wx: 960, wy: 900 };
    }
    const rect = canvas.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * metrics.viewW;
    const vy = ((clientY - rect.top) / rect.height) * metrics.viewH;
    return {
      vx,
      vy,
      wx: vx + cameraRef.current.x,
      wy: vy + cameraRef.current.y,
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pausedRef.current || viewingStupaRef.current) return;
    const { vx, vy, wx, wy } = toCoords(e.clientX, e.clientY);
    const metrics = metricsRef.current;
    const topInsetWorld = insetsRef.current.top / metrics.worldScale;
    const miniMapRect = getMiniMapRect(metrics.viewW, topInsetWorld);

    // Clicking inside corner mini-map walks toward that point in the temple world
    if (
      vx >= miniMapRect.x &&
      vx <= miniMapRect.x + miniMapRect.w &&
      vy >= miniMapRect.y &&
      vy <= miniMapRect.y + miniMapRect.h
    ) {
      const mx = WORLD_MIN_X + ((vx - miniMapRect.x) / miniMapRect.w) * WORLD_TOTAL_WIDTH;
      const my = WORLD_MIN_Y + ((vy - miniMapRect.y) / miniMapRect.h) * WORLD_TOTAL_HEIGHT;
      const safe = resolveWalkPosition(localPosRef.current.x, localPosRef.current.y, mx, my);
      const waypoints = buildWalkWaypoints(localPosRef.current.x, localPosRef.current.y, safe.x, safe.y);
      const firstWp = waypoints[0] ?? safe;
      activeRitualRef.current = null;
      targetPointRef.current = {
        x: firstWp.x,
        y: firstWp.y,
        waypoints: waypoints.slice(1),
        createdAt: performance.now(),
      };
      return;
    }

    // Check individual flower garden plots first so players can pick any specific bed
    for (const plotPos of GARDEN_PLOT_POSITIONS) {
      if (Math.hypot(wx - plotPos.x, wy - plotPos.y) <= 28) {
        activeRitualRef.current = null;
        const distFromPlayer = Math.hypot(
          localPosRef.current.x - plotPos.x,
          localPosRef.current.y - plotPos.y
        );
        if (distFromPlayer <= 46) {
          onSelectGardenPlotRef.current?.(plotPos.index);
        } else {
          const standX = plotPos.x;
          const standY = plotPos.y + 28;
          const waypoints = buildWalkWaypoints(
            localPosRef.current.x,
            localPosRef.current.y,
            standX,
            standY
          );
          const firstWp = waypoints[0] ?? { x: standX, y: standY };
          targetPointRef.current = {
            x: firstWp.x,
            y: firstWp.y,
            waypoints: waypoints.slice(1),
            createdAt: performance.now(),
            pendingAction: () => {
              localPosRef.current.direction = 'up';
              onSelectGardenPlotRef.current?.(plotPos.index);
            },
          };
        }
        return;
      }
    }

    // Check interactable click in world coordinates
    const entries = Object.entries(INTERACTABLES) as [
      RitualAction,
      { x: number; y: number; radius: number; label: string }
    ][];
    for (const [key, item] of entries) {
      if (key === 'flower') {
        // Trigger flower ritual when clicking the Garden Water Jar / Sign beside the beds
        if (Math.hypot(wx - 768, wy - 1000) <= 40) {
          startRitualSequence('flower');
          return;
        }
        continue;
      }
      if (Math.hypot(wx - item.x, wy - item.y) <= item.radius) {
        if (key === 'kitchen_table' && kitchenMealsRef.current.length > 0) {
          const mealSlots = getKitchen2DMealSlots(item.x, item.y, kitchenMealsRef.current);
          let bestMeal = mealSlots[0];
          let bestDist = Infinity;
          for (const slot of mealSlots) {
            const d = Math.hypot(wx - slot.cx, wy - slot.cy);
            if (d < bestDist) {
              bestDist = d;
              bestMeal = slot;
            }
          }
          const targetMeal = bestMeal?.meal ?? kitchenMealsRef.current[0];
          const mealTarget: 'food' | 'drink' = wx <= (bestMeal?.cx ?? item.x) ? 'food' : 'drink';
          startRitualSequence('kitchen_table', mealTarget, targetMeal.id);
          return;
        }
        startRitualSequence(key);
        return;
      }
    }

    // Check Pergola & Courtyard Stone Bench click in world coordinates
    for (const bench of PERGOLA_BENCH_SPECS) {
      if (Math.hypot(wx - bench.x, wy - bench.y) <= 50) {
        activeRitualRef.current = null;
        const distFromPlayer = Math.hypot(localPosRef.current.x - bench.x, localPosRef.current.y - bench.y);
        if (distFromPlayer <= 66) {
          onSitBench(bench.index);
        } else {
          const waypoints = buildWalkWaypoints(
            localPosRef.current.x,
            localPosRef.current.y,
            bench.x,
            bench.y + 20
          );
          const firstWp = waypoints[0] ?? { x: bench.x, y: bench.y + 20 };
          targetPointRef.current = {
            x: firstWp.x,
            y: firstWp.y,
            waypoints: waypoints.slice(1),
            createdAt: performance.now(),
            pendingAction: () => onSitBench(bench.index),
          };
        }
        return;
      }
    }

    // Check Bia Ngũ Giới Stone Stele click in world coordinates
    if (
      Math.hypot(wx - PRECEPTS_STELE_SPEC.x, wy - (PRECEPTS_STELE_SPEC.y - 18)) <= 42
    ) {
      activeRitualRef.current = null;
      const distFromPlayer = Math.hypot(
        localPosRef.current.x - PRECEPTS_STELE_SPEC.x,
        localPosRef.current.y - PRECEPTS_STELE_SPEC.y
      );
      if (distFromPlayer <= 74) {
        localPosRef.current.direction = 'up';
        onInspectPreceptsRef.current?.();
      } else {
        const standX = PRECEPTS_STELE_SPEC.x;
        const standY = PRECEPTS_STELE_SPEC.y + 42;
        const waypoints = buildWalkWaypoints(
          localPosRef.current.x,
          localPosRef.current.y,
          standX,
          standY
        );
        const firstWp = waypoints[0] ?? { x: standX, y: standY };
        targetPointRef.current = {
          x: firstWp.x,
          y: firstWp.y,
          waypoints: waypoints.slice(1),
          createdAt: performance.now(),
          pendingAction: () => {
            localPosRef.current.direction = 'up';
            onInspectPreceptsRef.current?.();
          },
        };
      }
      return;
    }

    // Check meditation cushion click in world coordinates
    for (const cushion of CUSHION_POSITIONS) {
      if (Math.hypot(wx - cushion.x, wy - cushion.y) <= 36) {
        activeRitualRef.current = null;
        const distFromPlayer = Math.hypot(localPosRef.current.x - cushion.x, localPosRef.current.y - cushion.y);
        if (distFromPlayer <= 60) {
          onSitCushion(cushion.index);
        } else {
          const waypoints = buildWalkWaypoints(
            localPosRef.current.x,
            localPosRef.current.y,
            cushion.x,
            cushion.y + 12
          );
          const firstWp = waypoints[0] ?? { x: cushion.x, y: cushion.y + 12 };
          targetPointRef.current = {
            x: firstWp.x,
            y: firstWp.y,
            waypoints: waypoints.slice(1),
            createdAt: performance.now(),
            pendingAction: () => onSitCushion(cushion.index),
          };
        }
        return;
      }
    }

    // Otherwise walk to clicked world coordinate
    activeRitualRef.current = null;
    const safe = resolveWalkPosition(localPosRef.current.x, localPosRef.current.y, wx, wy);
    const waypoints = buildWalkWaypoints(localPosRef.current.x, localPosRef.current.y, safe.x, safe.y);
    const firstWp = waypoints[0] ?? safe;
    targetPointRef.current = {
      x: firstWp.x,
      y: firstWp.y,
      waypoints: waypoints.slice(1),
      createdAt: performance.now(),
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { vx, vy, wx, wy } = toCoords(e.clientX, e.clientY);
    const metrics = metricsRef.current;
    const topInsetWorld = insetsRef.current.top / metrics.worldScale;
    const miniMapRect = getMiniMapRect(metrics.viewW, topInsetWorld);

    if (
      vx >= miniMapRect.x &&
      vx <= miniMapRect.x + miniMapRect.w &&
      vy >= miniMapRect.y &&
      vy <= miniMapRect.y + miniMapRect.h
    ) {
      hoverLabelRef.current = null;
      return;
    }

    for (const plotPos of GARDEN_PLOT_POSITIONS) {
      if (Math.hypot(wx - plotPos.x, wy - plotPos.y) <= 28) {
        const plotState = room.gardenPlots.find((p) => p.plotIndex === plotPos.index);
        const effectiveStage = plotState ? getEffectiveFlowerStage(plotState, Date.now()) : 0;
        if (!plotState || plotState.species === 'none' || effectiveStage === 0) {
          hoverLabelRef.current = {
            text: `${plotPos.label} · Đất trống (Nhấp để gieo hạt)`,
            x: plotPos.x,
            y: plotPos.y - 26,
          };
        } else {
          const sp = FLOWER_CATALOG.find((f) => f.id === plotState.species);
          const stageLabel =
            effectiveStage >= 3
              ? 'Nở rộ! Nhấp hái dâng Phật'
              : effectiveStage === 2
              ? 'Đang kết nụ · Sắp nở hoa'
              : 'Đang nảy mầm · Tự lớn dần';
          hoverLabelRef.current = {
            text: `${plotPos.label} · ${sp?.name ?? 'Hoa'} (${stageLabel})`,
            x: plotPos.x,
            y: plotPos.y - 32,
          };
        }
        return;
      }
    }

    const nowMs = performance.now();
    for (let i = 0; i < room.lanterns.length; i++) {
      const l = room.lanterns[i];
      const lp = getPondLanternWorldPos(l, i, nowMs);
      if (Math.hypot(wx - lp.x, wy - lp.y) <= 18) {
        hoverLabelRef.current = {
          text: `${l.displayName}: “${l.wish}”`,
          x: lp.x,
          y: lp.y - 22,
        };
        return;
      }
    }

    for (const [key, item] of Object.entries(INTERACTABLES) as [
      RitualAction,
      { x: number; y: number; radius: number; label: string }
    ][]) {
      if (key === 'flower') {
        if (Math.hypot(wx - 768, wy - 1000) <= 38) {
          hoverLabelRef.current = { text: item.label, x: 768, y: 956 };
          return;
        }
        continue;
      }
      if (Math.hypot(wx - item.x, wy - item.y) <= item.radius) {
        if (key === 'wish') {
          const latestWish = room.wishes[room.wishes.length - 1];
          const text = latestWish
            ? `Cây Nguyện Ước (${room.wishes.length} dải băng) · “${latestWish.wish}”`
            : item.label;
          hoverLabelRef.current = { text, x: item.x, y: item.y - 68 };
          return;
        }
        if (key === 'kitchen_table' && kitchenMealsRef.current.length > 0) {
          const mealSlots = getKitchen2DMealSlots(item.x, item.y, kitchenMealsRef.current);
          let bestMeal = mealSlots[0];
          let bestDist = Infinity;
          for (const slot of mealSlots) {
            const d = Math.hypot(wx - slot.cx, wy - slot.cy);
            if (d < bestDist) {
              bestDist = d;
              bestMeal = slot;
            }
          }
          const m = bestMeal?.meal ?? kitchenMealsRef.current[0];
          const foodInfo =
            VEGETARIAN_FOOD_MENU.find((f) => f.id === m.foodId) ?? VEGETARIAN_FOOD_MENU[0];
          const drinkInfo =
            VEGETARIAN_DRINK_MENU.find((d) => d.id === m.drinkId) ?? VEGETARIAN_DRINK_MENU[0];
          const ownerTag =
            m.recipientMode === 'all'
              ? 'Mời cả chùa'
              : m.targetName
              ? `Phần ${m.targetName}`
              : m.orderedByName;
          const hoverText =
            wx <= (bestMeal?.cx ?? item.x)
              ? m.foodEaten
                ? `Đã ăn xong ${foodInfo.name} (${ownerTag})`
                : `Nhấp để ăn ${foodInfo.name} · ${ownerTag}`
              : m.drinkDrunk
              ? `Đã uống xong ${drinkInfo.name} (${ownerTag})`
              : `Nhấp để uống ${drinkInfo.name} · ${ownerTag}`;
          hoverLabelRef.current = { text: hoverText, x: bestMeal?.cx ?? item.x, y: item.y - 44 };
          return;
        }
        hoverLabelRef.current = { text: item.label, x: item.x, y: item.y - 52 };
        return;
      }
    }
    for (const bench of PERGOLA_BENCH_SPECS) {
      if (Math.hypot(wx - bench.x, wy - bench.y) <= 50) {
        const occ = getBenchOccupancy(room.benches, bench.index);
        hoverLabelRef.current = {
          text:
            occ.count >= occ.capacity
              ? `${bench.label} · Đã đủ ${occ.count}/${occ.capacity} người ngồi`
              : `${bench.label} (${occ.count}/${occ.capacity} chỗ) · Nhấp để ngồi (tối đa 2 người)`,
          x: bench.x,
          y: bench.y - 38,
        };
        return;
      }
    }
    const summitWp = MOUNTAIN_TRAIL_WAYPOINTS[MOUNTAIN_TRAIL_WAYPOINTS.length - 1];
    if (Math.hypot(wx - summitWp.x, wy - summitWp.y) <= 46) {
      hoverLabelRef.current = {
        text: 'Đỉnh Núi Liên Sơn (18.2m · Nhấp để leo lên ngắm toàn cảnh)',
        x: summitWp.x,
        y: summitWp.y - 42,
      };
      return;
    }
    for (const cushion of CUSHION_POSITIONS) {
      if (Math.hypot(wx - cushion.x, wy - cushion.y) <= 36) {
        const occupied = room.cushions[cushion.index];
        hoverLabelRef.current = {
          text: occupied ? `${cushion.label} (Đã có người ngồi)` : `${cushion.label} (Nhấp để tọa thiền)`,
          x: cushion.x,
          y: cushion.y - 34,
        };
        return;
      }
    }
    for (const guardian of SANCTUARY_GUARDIAN_SPECS) {
      if (Math.hypot(wx - guardian.x, wy - (guardian.y - 36)) <= 32) {
        hoverLabelRef.current = {
          text: guardian.name,
          x: guardian.x,
          y: guardian.y - 86,
        };
        return;
      }
    }
    for (const arhat of COURTYARD_ARHAT_SPECS) {
      if (Math.hypot(wx - arhat.x, wy - (arhat.y - 28)) <= 26) {
        hoverLabelRef.current = {
          text: `Tượng ${arhat.name} · La Hán`,
          x: arhat.x,
          y: arhat.y - 72,
        };
        return;
      }
    }
    if (Math.hypot(wx - PRECEPTS_STELE_SPEC.x, wy - (PRECEPTS_STELE_SPEC.y - 18)) <= 42) {
      hoverLabelRef.current = {
        text: 'Bia Ngũ Giới · Nhấp để đọc Năm Giới Của Phật',
        x: PRECEPTS_STELE_SPEC.x,
        y: PRECEPTS_STELE_SPEC.y - 68,
      };
      return;
    }
    if (
      Math.hypot(
        (wx - HON_NON_BO_SPEC.cx) / HON_NON_BO_SPEC.rx,
        (wy - HON_NON_BO_SPEC.cy) / HON_NON_BO_SPEC.ry
      ) <= 1.08
    ) {
      hoverLabelRef.current = {
        text: 'Hòn Non Bộ · Tiểu Cảnh Sơn Thủy Tĩnh Tâm',
        x: HON_NON_BO_SPEC.cx,
        y: HON_NON_BO_SPEC.cy - HON_NON_BO_SPEC.ry - 14,
      };
      return;
    }
    hoverLabelRef.current = null;
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#4E6340]">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          hoverLabelRef.current = null;
        }}
        className="w-full h-full block cursor-pointer select-none touch-manipulation"
      />
    </div>
  );
}

function clampCamX(x: number, viewW: number): number {
  return Math.max(WORLD_MIN_X, Math.min(Math.max(WORLD_MIN_X, WORLD_WIDTH - viewW), x));
}

function clampCamY(y: number, viewH: number): number {
  return Math.max(WORLD_MIN_Y, Math.min(Math.max(WORLD_MIN_Y, WORLD_HEIGHT - viewH), y));
}

function drawTempleScene(
  ctx: CanvasRenderingContext2D,
  now: number,
  room: RoomState,
  currentUserId: string,
  positions: Map<string, RenderPos>,
  localPos: RenderPos,
  cam: { x: number; y: number },
  metrics: ViewportMetrics,
  topInsetWorld: number,
  bottomInsetWorld: number,
  roofAlpha: { main: number; bell: number; woodfish: number; gate: number; kitchen: number },
  walkTarget: WalkTarget | null,
  activeRitual: ActiveRitualState | null,
  effects: VisualEffect[],
  lowResourceMode: boolean,
  hoverLabel: { text: string; x: number; y: number } | null,
  kitchenMeals: KitchenMealState[],
  koiTimeMs: number,
  smoothFeedPull: number,
  atmosphere: TempleAtmosphereSnapshot,
  activeIncenseCount: number,
  latestMemorial: { deceasedName: string; createdAt: number } | null,
  viewingStupa: boolean
) {
  const { viewW, viewH } = metrics;
  ctx.clearRect(0, 0, viewW, viewH);

  // Fill bright sunlit moss backdrop
  ctx.fillStyle = '#536844';
  ctx.fillRect(0, 0, viewW, viewH);

  // Enter World-Space Camera Transform
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

  // 1. Temple Grounds, Ocean Vista, Passing Boats, Back Gate, Memorial Plaza & Courtyards
  drawGroundsAndPaths(ctx, now, lowResourceMode);

  // 1b. Dãy Núi Liên Sơn (Back-Right Climbable Mountain Range & Trail)
  drawMountainRange2D(ctx, now);

  // 2. Gian Bếp Chay (NE Vegetarian Kitchen Pavilion)
  drawVegetarianKitchen(ctx, kitchenMeals, now, lowResourceMode);

  // 2a. Dàn Hoa Giấy Hồng Patio Floor
  drawPergolaPatio2D(ctx);

  // 2b. Vườn Hoa Liên Tâm (South-West Flower Garden)
  drawFlowerGarden(ctx, room.gardenPlots, now, lowResourceMode);

  // 3. Expanded Lotus Pond, Floating Wish Lanterns & Cầu Ao Sen Bridge Deck
  drawLotusPond(ctx, now, lowResourceMode, room.lanterns, effects, koiTimeMs, smoothFeedPull);

  // 4. Chánh Điện Platform, Altar & Dual Sacred Images (Phật & Bồ Tát side-by-side)
  drawSanctuaryBaseAndAltar(ctx, now, lowResourceMode);

  // 4b. Bảo Tháp Stone Terrace & South Entry Steps behind Chánh Điện
  drawStupaTerrace2D(ctx);

  // 5. Bell Pavilion & Woodfish Pavilion Bases
  drawSidePavilionBase(ctx, 605, 505, 'LẦU CHUÔNG');
  drawSidePavilionBase(ctx, 1315, 505, 'GÁC MÕ');

  // 6. Meditation Cushions inside Chánh Điện
  for (const cushion of CUSHION_POSITIONS) {
    const occupiedBy = room.cushions[cushion.index];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cushion.x, cushion.y + 11, 29, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = occupiedBy ? '#A65D3B' : '#7C4B32';
    ctx.beginPath();
    ctx.ellipse(cushion.x, cushion.y + 8, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#D99B52';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(243, 199, 132, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cushion.x, cushion.y + 8, 17, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 7. Walk destination marker on ground
  if (walkTarget) {
    const pulse = 0.55 + Math.sin(now * 0.008) * 0.25;
    ctx.save();
    ctx.strokeStyle = `rgba(217, 155, 82, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(walkTarget.x, walkTarget.y + 8, 15, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 8. Courtyard Benches & Stone Planters
  drawCourtyardProps(ctx);

  // 9. Bodhi Tree & Wishing Tree Trunks
  drawBodhiTrunkAndBench(ctx);
  drawWishingTreeTrunk(ctx, INTERACTABLES.wish.x, INTERACTABLES.wish.y);

  // 10. Depth-Sorted World Entities
  type DepthEntity = { y: number; draw: () => void };
  const entities: DepthEntity[] = [];

  const bellEffect = effects.find((e) => e.kind === 'bell' && now - e.createdAt < 2500);
  entities.push({
    y: INTERACTABLES.bell.y,
    draw: () =>
      drawBell(
        ctx,
        INTERACTABLES.bell.x,
        INTERACTABLES.bell.y,
        bellEffect ? (now - bellEffect.createdAt) / 1000 : null
      ),
  });

  const woodEffect = effects.find((e) => e.kind === 'woodfish' && now - e.createdAt < 600);
  entities.push({
    y: INTERACTABLES.woodfish.y,
    draw: () =>
      drawWoodfish(
        ctx,
        INTERACTABLES.woodfish.x,
        INTERACTABLES.woodfish.y,
        woodEffect ? (now - woodEffect.createdAt) / 1000 : null
      ),
  });

  entities.push({
    y: INTERACTABLES.incense.y,
    draw: () =>
      drawIncenseBurner(
        ctx,
        INTERACTABLES.incense.x,
        INTERACTABLES.incense.y,
        activeIncenseCount,
        now,
        lowResourceMode
      ),
  });

  // Khu Công Viên Cầu Siêu: Cypresses, 4 Graves (Mộ Phần) & Đài Cầu Siêu
  const memorialCypresses = [
    { x: 118, y: -425 }, { x: 330, y: -445 }, { x: 540, y: -425 },
    { x: 118, y: -250 }, { x: 118, y: -75 }, { x: 540, y: -75 },
  ];
  for (const cy of memorialCypresses) {
    entities.push({
      y: cy.y,
      draw: () => drawCypressTree2D(ctx, cy.x, cy.y),
    });
  }
  for (const grave of MEMORIAL_GRAVE_SPECS) {
    entities.push({
      y: grave.y,
      draw: () => drawMemorialGrave2D(ctx, grave.x, grave.y, grave.label),
    });
  }
  entities.push({
    y: INTERACTABLES.memorial.y,
    draw: () =>
      drawMemorialAltar2D(
        ctx,
        INTERACTABLES.memorial.x,
        INTERACTABLES.memorial.y,
        now,
        latestMemorial
      ),
  });
  const stupaDeckPlayers: Array<{
    player: RoomPlayer;
    pos: RenderPos;
    isSelf: boolean;
    performingAction: RitualAction | null;
  }> = [];
  const mountainClimbers: Array<{
    player: RoomPlayer;
    pos: RenderPos;
    isSelf: boolean;
    performingAction: RitualAction | null;
    elev: number;
  }> = [];

  for (const bench of PERGOLA_BENCH_SPECS) {
    const occ = getBenchOccupancy(room.benches, bench.index);
    entities.push({
      y: bench.y - 6,
      draw: () => drawPergolaBench2D(ctx, bench, occ.count),
    });
  }

  const birdFeedEffect = effects.find((e) => e.kind === 'feed_birds' && now - e.createdAt < 11500);
  entities.push({
    y: INTERACTABLES.feed_birds.y,
    draw: () =>
      drawBirdFeederStand2D(
        ctx,
        INTERACTABLES.feed_birds.x,
        INTERACTABLES.feed_birds.y,
        Boolean(birdFeedEffect)
      ),
  });
  if (birdFeedEffect) {
    entities.push({
      y: 774,
      draw: () => drawScatteredBirdSeeds2D(ctx, now, birdFeedEffect.createdAt),
    });
  }

  for (const player of room.players) {
    const pos = positions.get(player.userId) || {
      x: player.x,
      y: player.y,
      direction: player.direction,
      pose: player.pose,
    };
    const isSelf = player.userId === currentUserId;
    const performingAction =
      isSelf && activeRitual?.phase === 'perform' ? activeRitual.action : null;
    const isOnDeck =
      (player.stupaSlot !== null && player.stupaSlot !== undefined && player.stupaSlot >= 0) ||
      (isSelf && viewingStupa);
    if (isOnDeck) {
      stupaDeckPlayers.push({ player, pos, isSelf, performingAction });
    } else {
      const elev = getGroundElevation3D(pos.x, pos.y);
      if (elev > 0.35) {
        mountainClimbers.push({ player, pos, isSelf, performingAction, elev });
      } else {
        entities.push({
          y: pos.y,
          draw: () => drawPlayerCharacter(ctx, player, pos, isSelf, now, performingAction),
        });
      }
    }
  }

  // Bảo Tháp 9-tier structure with 9th-tier Observation Deck centered at STUPA_SPEC
  entities.push({
    y: STUPA_SPEC.cy + 46,
    draw: () => drawStupaTower2D(ctx, STUPA_SPEC.cx, STUPA_SPEC.cy, stupaDeckPlayers, now),
  });
  // South handrail of Cầu Ao Sen rendered in depth order over water/under foreground
  entities.push({
    y: POND_SPEC.bridgeYMax + 2,
    draw: () => drawBridgeSouthRail2D(ctx),
  });

  entities.push({
    y: INTERACTABLES.fortune.y,
    draw: () => drawFortuneBox(ctx, INTERACTABLES.fortune.x, INTERACTABLES.fortune.y),
  });

  const sweepEffect = effects.find((e) => e.kind === 'sweep' && now - e.createdAt < 2400);
  entities.push({
    y: INTERACTABLES.sweep.y,
    draw: () =>
      drawLeafSweepingSpot(
        ctx,
        INTERACTABLES.sweep.x,
        INTERACTABLES.sweep.y,
        sweepEffect ? (now - sweepEffect.createdAt) / 1000 : null,
        lowResourceMode
      ),
  });

  const fishEffect = effects.find((e) => e.kind === 'fish' && now - e.createdAt < 3000);
  entities.push({
    y: INTERACTABLES.fish.y,
    draw: () =>
      drawFishReleasePier(
        ctx,
        INTERACTABLES.fish.x,
        INTERACTABLES.fish.y,
        fishEffect ? (now - fishEffect.createdAt) / 1000 : null,
        now,
        lowResourceMode
      ),
  });

  entities.push({
    y: INTERACTABLES.lantern.y,
    draw: () =>
      drawLanternTable(ctx, INTERACTABLES.lantern.x, INTERACTABLES.lantern.y, now, lowResourceMode),
  });

  const koiFeedEffect = effects.find((e) => e.kind === 'feed_koi' && now - e.createdAt < 9000);
  entities.push({
    y: INTERACTABLES.feed_koi.y,
    draw: () =>
      drawKoiFeedJar(
        ctx,
        INTERACTABLES.feed_koi.x,
        INTERACTABLES.feed_koi.y,
        Boolean(koiFeedEffect)
      ),
  });

  for (const lantern of STONE_LANTERNS) {
    entities.push({
      y: lantern.y,
      draw: () => drawStoneLantern(ctx, lantern.x, lantern.y, now, lowResourceMode),
    });
  }

  for (const post of PATH_LANTERN_POSTS) {
    entities.push({
      y: post.y,
      draw: () => drawPathLanternPost2D(ctx, post, now, lowResourceMode),
    });
  }

  for (const arhat of COURTYARD_ARHAT_SPECS) {
    entities.push({
      y: arhat.y,
      draw: () => drawArhatStatue2D(ctx, arhat, now, lowResourceMode),
    });
  }

  for (const guardian of SANCTUARY_GUARDIAN_SPECS) {
    entities.push({
      y: guardian.y,
      draw: () => drawSanctuaryGuardian2D(ctx, guardian, now, lowResourceMode),
    });
  }

  for (const cluster of BAMBOO_CLUSTERS) {
    entities.push({
      y: cluster.y,
      draw: () => drawBambooCluster(ctx, cluster.x, cluster.y, cluster.stalks, now, lowResourceMode),
    });
  }

  entities.push({
    y: HON_NON_BO_SPEC.cy,
    draw: () => drawHonNonBo2D(ctx, now, lowResourceMode),
  });
  entities.push({
    y: PRECEPTS_STELE_SPEC.y,
    draw: () => drawPreceptsStele2D(ctx, now, lowResourceMode),
  });
  entities.push({
    y: 115,
    draw: () => drawCypressTree2D(ctx, -310, 115),
  });
  entities.push({
    y: 425,
    draw: () => drawCypressTree2D(ctx, -305, 425),
  });

  entities.push({
    y: 1125,
    draw: () => drawTamQuanPillars(ctx),
  });

  // Ground players already collected and sorted above alongside Bảo Tháp deck occupants

  entities.sort((a, b) => a.y - b.y);
  for (const ent of entities) {
    ent.draw();
  }

  // Render climbers on Dãy Núi Liên Sơn sorted by elevation so higher climbers overlap gracefully
  mountainClimbers.sort((a, b) => a.elev - b.elev || a.pos.y - b.pos.y);
  for (const mc of mountainClimbers) {
    drawPlayerCharacter(ctx, mc.player, mc.pos, mc.isSelf, now, mc.performingAction, mc.elev);
  }

  // 11. Active Ripple Effects
  for (const ef of effects) {
    const age = (now - ef.createdAt) / 1000;
    if (age < 0 || age > 2.2) continue;
    const alpha = Math.max(0, 1 - age / 2.2);
    const rx = ef.kind === 'fish' ? ef.x - 42 : ef.kind === 'feed_koi' ? POND_SPEC.cx : ef.x;
    const ry = ef.kind === 'fish' ? ef.y - 24 : ef.kind === 'feed_koi' ? 635 : ef.y;
    ctx.save();
    ctx.strokeStyle =
      ef.kind === 'bell'
        ? `rgba(217, 155, 82, ${alpha})`
        : ef.kind === 'fish' || ef.kind === 'feed_koi'
        ? `rgba(158, 234, 234, ${alpha})`
        : ef.kind === 'flower'
        ? `rgba(164, 224, 152, ${alpha})`
        : ef.kind === 'lantern'
        ? `rgba(255, 214, 130, ${alpha})`
        : ef.kind === 'wish'
        ? `rgba(235, 86, 86, ${alpha})`
        : ef.kind === 'memorial'
        ? `rgba(255, 226, 138, ${alpha})`
        : ef.kind === 'sweep'
        ? `rgba(235, 198, 118, ${alpha})`
        : `rgba(232, 207, 165, ${alpha})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(rx, ry, 22 + age * 72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 12. Overhead Architectural Roofs & Tree Canopies
  drawBodhiCanopy(ctx, now, lowResourceMode);
  drawWishingTreeCanopyAndRibbons(
    ctx,
    INTERACTABLES.wish.x,
    INTERACTABLES.wish.y,
    room.wishes,
    effects,
    now,
    lowResourceMode
  );
  drawPergolaCanopy2D(ctx, now, lowResourceMode);
  drawPergolaBirds2D(ctx, now, lowResourceMode, birdFeedEffect);
  drawVegetarianKitchenRoof(ctx, roofAlpha.kitchen);
  drawSanctuaryRoof(ctx, roofAlpha.main);
  drawPavilionRoof(ctx, 605, 505, 'LẦU CHUÔNG', roofAlpha.bell);
  drawPavilionRoof(ctx, 1315, 505, 'GÁC MÕ', roofAlpha.woodfish);
  drawTamQuanRoof(ctx, roofAlpha.gate);

  // 13. World-space Hover Tooltip clamped to visible camera viewport
  if (hoverLabel) {
    ctx.save();
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    const textWidth = ctx.measureText(hoverLabel.text).width;
    const boxW = textWidth + 22;
    const boxH = 28;
    const bx = Math.max(
      cam.x + 12,
      Math.min(cam.x + viewW - boxW - 12, hoverLabel.x - boxW / 2)
    );
    const by = Math.max(cam.y + topInsetWorld + 12, hoverLabel.y - boxH);

    ctx.fillStyle = 'rgba(24, 19, 16, 0.94)';
    roundRect(ctx, bx, by, boxW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = '#D99B52';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#F5EFE6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hoverLabel.text, bx + boxW / 2, by + boxH / 2);
    ctx.restore();
  }

  // 14. World-Space Day/Night Atmospheric Lighting, Lantern Glow Pools, Fireflies & Mist
  drawWorldAtmosphere2D(ctx, now, cam, viewW, viewH, room, atmosphere, lowResourceMode);

  ctx.restore(); // Exit World-Space -> Screen-Space HUD

  // 15. Screen-Space Celestial Sunlight/Moonlight Glow & Falling Weather Particles
  drawScreenWeather2D(ctx, now, cam, viewW, viewH, atmosphere, lowResourceMode);

  // 16. Off-screen Companion Indicator (kept inside HUD-safe zone)
  for (const player of room.players) {
    if (player.userId === currentUserId) continue;
    const pos = positions.get(player.userId) || {
      x: player.x,
      y: player.y,
      direction: player.direction,
      pose: player.pose,
    };
    const sx = pos.x - cam.x;
    const sy = pos.y - cam.y;
    if (
      sx < 18 ||
      sx > viewW - 18 ||
      sy < topInsetWorld + 18 ||
      sy > viewH - bottomInsetWorld - 18
    ) {
      drawOffscreenFriendMarker(ctx, player.displayName, sx, sy, viewW, viewH, topInsetWorld, bottomInsetWorld);
    }
  }

  // 17. Top-left Zone Plaque (positioned neatly below top floating bar)
  const zoneName = viewingStupa
    ? 'Đài Quan Sát · Bảo Tháp Tầng 9'
    : getZoneName(localPos.x, localPos.y);
  drawZonePlaque(ctx, zoneName, topInsetWorld + 8);

  // 18. Top-right Mini-Map (positioned neatly below top floating bar)
  drawMiniMap(ctx, room, currentUserId, positions, cam, viewW, viewH, topInsetWorld);

  // 19. Bottom-center Ritual Action Progress or Proximity Interact Hint (above floating dock)
  if (activeRitual) {
    const actionNames: Record<RitualAction, string> = {
      incense: 'thắp hương',
      bow: 'lạy Phật thành tâm',
      bell: 'thỉnh chuông',
      woodfish: 'gõ mõ',
      fortune: 'xin xăm',
      sweep: 'quét lá',
      fish: 'thả cá phóng sinh',
      flower: 'chăm sóc Vườn Hoa Liên Tâm',
      lantern: 'thả hoa đăng ao sen',
      feed_koi: 'cho cá Koi ăn',
      feed_birds: 'rải thức ăn cho chim bồ câu & chim sẻ',
      wish: 'ném dải băng đỏ lên Cây Nguyện Ước',
      kitchen_menu: 'chọn thực đơn Gian Bếp Chay',
      kitchen_table: 'thưởng thức bữa chay thanh tịnh',
      kitchen_sink: 'rửa bát, rửa ly',
      memorial: 'làm lễ Cầu Siêu',
      stupa: 'lên Bảo Tháp ngắm toàn cảnh',
    };
    const msg =
      activeRitual.phase === 'walk'
        ? `Đang đi tới nơi ${actionNames[activeRitual.action]}...`
        : `Đang thực hiện ${actionNames[activeRitual.action]}...`;
    drawBottomStatusBanner(ctx, msg, viewW, viewH, bottomInsetWorld);
  } else if (!viewingStupa) {
    const nearby = findNearbyInteraction(localPos.x, localPos.y);
    if (nearby) {
      drawProximityPrompt(ctx, nearby.label, viewW, viewH, bottomInsetWorld);
    }
  }
}

function drawGroundsAndPaths(ctx: CanvasRenderingContext2D, now: number, lowResourceMode: boolean) {
  const sec = now * 0.001;

  // Vast Northern Ocean Vista (y: WORLD_MIN_Y .. -605)
  const seaGrad = ctx.createLinearGradient(0, WORLD_MIN_Y, 0, -605);
  seaGrad.addColorStop(0, '#164566');
  seaGrad.addColorStop(0.55, '#22698A');
  seaGrad.addColorStop(0.9, '#31849C');
  seaGrad.addColorStop(1, '#55A8AC');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(WORLD_MIN_X, WORLD_MIN_Y, WORLD_TOTAL_WIDTH, -605 - WORLD_MIN_Y);

  // Shimmering open ocean swells & wave crests
  ctx.save();
  ctx.lineWidth = 1.6;
  const waveRows = lowResourceMode ? 5 : 9;
  for (let row = 0; row < waveRows; row++) {
    const wy = -830 + row * 24;
    ctx.strokeStyle = `rgba(218, 245, 250, ${0.14 + (row % 3) * 0.05})`;
    for (let seg = -3; seg < 10; seg++) {
      const drift = (sec * (10 + (row % 3) * 4) + row * 85) % 210;
      const sx = seg * 210 + drift;
      ctx.beginPath();
      ctx.moveTo(sx, wy);
      ctx.quadraticCurveTo(sx + 55, wy - 4, sx + 110, wy);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Boats & traditional junks occasionally passing across the open sea
  const boats = [
    { speed: 24, dir: 1, y: -662, scale: 1.0, kind: 'sampan' as const, offset: 140 },
    { speed: 18, dir: -1, y: -710, scale: 1.25, kind: 'junk' as const, offset: 960 },
    { speed: 15, dir: 1, y: -758, scale: 1.1, kind: 'sampan' as const, offset: 1520 },
    { speed: 13, dir: -1, y: -804, scale: 1.38, kind: 'junk' as const, offset: 480 },
    { speed: 20, dir: 1, y: -644, scale: 0.9, kind: 'sampan' as const, offset: 1840 },
  ];
  const seaSpan = WORLD_TOTAL_WIDTH + 480;
  for (let bIdx = 0; bIdx < boats.length; bIdx++) {
    const b = boats[bIdx];
    const progress = (sec * b.speed + b.offset) % seaSpan;
    const bx = b.dir > 0 ? WORLD_MIN_X - 240 + progress : WORLD_WIDTH + 240 - progress;
    const by = b.y + Math.sin(sec * 1.6 + bIdx * 1.9) * 2.2;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(b.dir * b.scale, b.scale);

    ctx.strokeStyle = 'rgba(232, 248, 252, 0.34)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-18, 1);
    ctx.lineTo(-56, -7);
    ctx.moveTo(-18, 3);
    ctx.lineTo(-56, 10);
    ctx.stroke();

    ctx.fillStyle = 'rgba(12, 34, 48, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6D4329';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(0, -8, 25, 0);
    ctx.quadraticCurveTo(10, 8, -22, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9C6945';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (b.kind === 'junk') {
      ctx.fillStyle = '#4B2E1E';
      ctx.fillRect(-2, -28, 3, 28);
      ctx.fillStyle = '#D7A36B';
      ctx.beginPath();
      ctx.moveTo(1, -27);
      ctx.quadraticCurveTo(18, -19, 15, -5);
      ctx.lineTo(1, -4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8F5D34';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#FFD37A';
      ctx.beginPath();
      ctx.arc(-6, -9, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#B89B6C';
      roundRect(ctx, -9, -6, 15, 9, 4);
      ctx.fill();
      ctx.fillStyle = '#FFD37A';
      ctx.beginPath();
      ctx.arc(10, -2, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Coastal Sandy Shore & Surf Line (y: -616 .. -520)
  const sandGrad = ctx.createLinearGradient(0, -616, 0, -520);
  sandGrad.addColorStop(0, '#DFCFA7');
  sandGrad.addColorStop(0.55, '#CFBE94');
  sandGrad.addColorStop(1, '#859668');
  ctx.fillStyle = sandGrad;
  ctx.fillRect(WORLD_MIN_X, -616, WORLD_TOTAL_WIDTH, 96);

  const surfWave = Math.sin(sec * 1.4) * 3.5;
  ctx.strokeStyle = 'rgba(246, 252, 255, 0.62)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = WORLD_MIN_X; x <= WORLD_WIDTH; x += 60) {
    const sy = -613 + surfWave + Math.sin(x * 0.015 + sec * 1.8) * 2.5;
    if (x === WORLD_MIN_X) ctx.moveTo(x, sy);
    else ctx.lineTo(x, sy);
  }
  ctx.stroke();

  // Temple Meadow Ground (y: -520 .. WORLD_HEIGHT)
  const groundGrad = ctx.createLinearGradient(0, -520, 0, WORLD_HEIGHT);
  groundGrad.addColorStop(0, '#5B7449');
  groundGrad.addColorStop(0.5, '#647C4F');
  groundGrad.addColorStop(1, '#526842');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(WORLD_MIN_X, -520, WORLD_TOTAL_WIDTH, WORLD_HEIGHT + 520);

  ctx.fillStyle = 'rgba(138, 166, 98, 0.36)';
  const grassPatches = [
    { x: -240, y: 260, rx: 145, ry: 120 },
    { x: -120, y: 430, rx: 130, ry: 75 },
    { x: 220, y: 240, rx: 140, ry: 85 },
    { x: 470, y: 380, rx: 110, ry: 70 },
    { x: 960, y: -420, rx: 320, ry: 55 },
    { x: 1460, y: -220, rx: 180, ry: 95 },
    { x: 1460, y: 840, rx: 170, ry: 110 },
    { x: 250, y: 1020, rx: 165, ry: 80 },
    { x: 1620, y: 1040, rx: 150, ry: 85 },
  ];
  for (const g of grassPatches) {
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, g.rx, g.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Expanded Vườn Bồ Đề & Hòn Non Bộ Stone Courtyard Plaza (x: -345..445, y: 78..470)
  ctx.fillStyle = '#6E7963';
  roundRect(ctx, -345, 78, 790, 392, 24);
  ctx.fill();
  ctx.strokeStyle = '#9BA690';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#858677';
  roundRect(ctx, -322, 100, 744, 348, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(72, 62, 50, 0.22)';
  ctx.lineWidth = 1.2;
  for (let gx = -270; gx <= 390; gx += 66) {
    ctx.beginPath();
    ctx.moveTo(gx, 106);
    ctx.lineTo(gx, 442);
    ctx.stroke();
  }
  for (let gy = 148; gy <= 410; gy += 62) {
    ctx.beginPath();
    ctx.moveTo(-316, gy);
    ctx.lineTo(416, gy);
    ctx.stroke();
  }

  // Extra scattered golden Bodhi leaves in the expanded sweeping zone
  const extraYardLeaves = [
    { x: 225, y: 416, rot: 0.45, c: '#D6A149' },
    { x: 176, y: 405, rot: -0.35, c: '#E0B25A' },
    { x: 132, y: 392, rot: 0.85, c: '#C78F3E' },
    { x: 88, y: 372, rot: -0.6, c: '#DBA852' },
    { x: 256, y: 382, rot: 0.25, c: '#C8923F' },
  ];
  for (const lf of extraYardLeaves) {
    ctx.save();
    ctx.translate(lf.x, lf.y);
    ctx.rotate(lf.rot);
    ctx.fillStyle = lf.c;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Stepping stone trail linking Hòn Non Bộ, Vườn Bồ Đề, Quét Lá & Thủy Đình
  const gardenLinkStones = [
    { x: 205, y: 312 },
    { x: 145, y: 300 },
    { x: 85, y: 288 },
    { x: 78, y: 250 },
    { x: 30, y: 278 },
    { x: 112, y: 356 },
    { x: 52, y: 388 },
    { x: -12, y: 408 },
    { x: -115, y: 412 },
    { x: -125, y: 495 },
    { x: -105, y: 555 },
  ];
  for (const st of gardenLinkStones) {
    ctx.fillStyle = '#9C8E7F';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y, 18, 12, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B7A997';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Khu Công Viên Cầu Siêu Stone Lawn & Walkway Plaza (Back-Left: x 110..550, y -440..-65)
  ctx.fillStyle = '#6B7A67';
  roundRect(ctx, 110, -440, 440, 375, 18);
  ctx.fill();
  ctx.strokeStyle = '#9BA694';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#848C7D';
  roundRect(ctx, 140, -412, 380, 318, 12);
  ctx.fill();
  // Cross stone paths inside Memorial Park
  ctx.fillStyle = '#9D968B';
  ctx.fillRect(298, -412, 64, 318);
  ctx.fillRect(140, -272, 380, 64);

  // Coastal Timber Viewing Deck right outside the small back gate (x: 840..1080, y: -605..-520)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  roundRect(ctx, 836, -608, 248, 92, 6);
  ctx.fill();
  ctx.fillStyle = '#875F41';
  roundRect(ctx, 840, -605, 240, 86, 6);
  ctx.fill();
  ctx.strokeStyle = '#BA8F63';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(65, 42, 24, 0.35)';
  ctx.lineWidth = 1.2;
  for (let dx = 858; dx < 1076; dx += 18) {
    ctx.beginPath();
    ctx.moveTo(dx, -603);
    ctx.lineTo(dx, -521);
    ctx.stroke();
  }
  ctx.strokeStyle = '#C99E67';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(842, -524);
  ctx.lineTo(842, -603);
  ctx.lineTo(1078, -603);
  ctx.lineTo(1078, -524);
  ctx.stroke();

  // Outer Sunlit Sandstone Perimeter Wall (expanded westward to x = -416 for Hòn Non Bộ garden)
  ctx.fillStyle = '#857768';
  ctx.fillRect(-416, -520, 1340, 36);
  ctx.fillRect(996, -520, 900, 36);
  ctx.fillRect(-416, -520, 36, 1756);
  ctx.fillRect(WORLD_WIDTH - 60, -520, 36, 1756);
  ctx.fillRect(-416, 1118, 1260, 44);
  ctx.fillRect(1076, 1118, WORLD_WIDTH - 1100, 44);

  ctx.strokeStyle = '#A8674C';
  ctx.lineWidth = 3;
  ctx.strokeRect(-416, -520, 1340, 36);
  ctx.strokeRect(996, -520, 900, 36);
  ctx.strokeRect(-416, 1118, 1260, 44);
  ctx.strokeRect(1076, 1118, WORLD_WIDTH - 1100, 44);

  // Small Back Gate (Cửa Nhỏ Sau Chùa) paving, crimson posts & open wooden door leaves
  ctx.fillStyle = '#9E8F80';
  roundRect(ctx, 924, -524, 72, 46, 4);
  ctx.fill();
  ctx.fillStyle = '#9B4034';
  ctx.beginPath();
  ctx.arc(924, -502, 7, 0, Math.PI * 2);
  ctx.arc(996, -502, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6A3F27';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(924, -506);
  ctx.lineTo(906, -534);
  ctx.moveTo(996, -506);
  ctx.lineTo(1014, -534);
  ctx.stroke();

  // Backyard stepping stone paths flanking Chánh Điện & Bảo Tháp to Sân Sau & Công Viên Cầu Siêu
  const backPathStones = [
    { x: 644, y: 465 }, { x: 642, y: 360 }, { x: 640, y: 260 }, { x: 640, y: 160 }, { x: 642, y: 60 },
    { x: 648, y: -50 }, { x: 675, y: -145 }, { x: 745, y: -175 }, { x: 840, y: -178 },
    { x: 1278, y: 360 }, { x: 1280, y: 260 }, { x: 1280, y: 160 }, { x: 1278, y: 60 },
    { x: 1272, y: -50 }, { x: 1245, y: -145 }, { x: 1175, y: -175 }, { x: 1080, y: -178 },
    { x: 810, y: -275 }, { x: 815, y: -365 }, { x: 875, y: -418 }, { x: 960, y: -430 },
    { x: 1110, y: -275 }, { x: 1105, y: -365 }, { x: 1045, y: -418 },
    { x: 615, y: -200 }, { x: 565, y: -225 },
    { x: 330, y: 50 }, { x: 330, y: -10 },
  ];
  for (const st of backPathStones) {
    ctx.fillStyle = '#9B8C7D';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y, 19, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B5A695';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.fillStyle = '#8A7C6E';
  roundRect(ctx, 920, -482, 80, 56, 6);
  ctx.fill();
  ctx.fillStyle = '#9E8F80';
  roundRect(ctx, 932, -470, 56, 32, 4);
  ctx.fill();

  // Central Stone Courtyard Terrace
  ctx.fillStyle = '#87796B';
  roundRect(ctx, 640, 525, 640, 385, 18);
  ctx.fill();
  ctx.strokeStyle = '#A39484';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(72, 60, 48, 0.28)';
  ctx.lineWidth = 1.5;
  for (let gx = 680; gx < 1260; gx += 64) {
    ctx.beginPath();
    ctx.moveTo(gx, 535);
    ctx.lineTo(gx, 900);
    ctx.stroke();
  }
  for (let gy = 560; gy < 900; gy += 56) {
    ctx.beginPath();
    ctx.moveTo(650, gy);
    ctx.lineTo(1270, gy);
    ctx.stroke();
  }

  ctx.fillStyle = '#998A7A';
  ctx.beginPath();
  ctx.arc(960, 690, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#B5A695';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232, 184, 106, 0.45)';
  ctx.beginPath();
  ctx.arc(960, 690, 62, 0, Math.PI * 2);
  ctx.stroke();

  // Southern Approach Promenade
  ctx.fillStyle = '#8A7C6E';
  ctx.fillRect(865, 900, 190, 270);
  ctx.strokeStyle = '#A69686';
  ctx.lineWidth = 2;
  ctx.strokeRect(865, 900, 190, 270);
  for (let py = 918; py < 1160; py += 34) {
    ctx.fillStyle = '#9E8F80';
    roundRect(ctx, 882, py, 156, 23, 5);
    ctx.fill();
  }

  // Stepping stone path to East Entrance of Cầu Ao Sen Bridge
  ctx.fillStyle = '#8A7C6E';
  roundRect(ctx, 550, 700, 118, 70, 10);
  ctx.fill();
  for (let px = 568; px <= 638; px += 34) {
    ctx.fillStyle = '#9E8F80';
    roundRect(ctx, px, 714, 24, 42, 6);
    ctx.fill();
  }

  // Stepping stone path NW to Vườn Bồ Đề
  const bodhiPath = [
    { x: 645, y: 580 },
    { x: 585, y: 515 },
    { x: 515, y: 455 },
    { x: 445, y: 410 },
    { x: 375, y: 370 },
  ];
  for (const st of bodhiPath) {
    ctx.fillStyle = '#9B8C7D';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y, 24, 15, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B5A695';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Stepping stone path East to Vườn Thiền & Rừng Trúc
  ctx.fillStyle = '#8A7C6E';
  roundRect(ctx, 1270, 610, 175, 58, 10);
  ctx.fill();
  for (let px = 1285; px <= 1415; px += 38) {
    ctx.fillStyle = '#9E8F80';
    roundRect(ctx, px, 622, 26, 34, 6);
    ctx.fill();
  }
  const bambooPath = [
    { x: 1415, y: 695 },
    { x: 1455, y: 760 },
    { x: 1515, y: 825 },
    { x: 1595, y: 865 },
  ];
  for (const st of bambooPath) {
    ctx.fillStyle = '#9B8C7D';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y, 22, 14, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stepping stone path SE from Tam Quan approach to Cây Nguyện Ước
  const wishPath = [
    { x: 1090, y: 970 },
    { x: 1150, y: 978 },
    { x: 1210, y: 985 },
    { x: 1265, y: 988 },
  ];
  for (const st of wishPath) {
    ctx.fillStyle = '#9B8C7D';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y, 20, 13, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B5A695';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Stepping stones connecting East path directly to Gian Bếp Chay entrance
  const kitchenEntryStones = [
    { x: 1485, y: 638 },
    { x: 1545, y: 632 },
    { x: 1613, y: 626 },
  ];
  for (const st of kitchenEntryStones) {
    ctx.fillStyle = '#9B8C7D';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y, 19, 12, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B5A695';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
}

function drawRealisticKoiFish(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  scale: number,
  phase: number,
  baseColor: string,
  spotColor: string,
  alpha = 0.92,
  withShadow = true
) {
  const tailSwing = Math.sin(phase) * 0.42;
  const finFlutter = Math.sin(phase * 1.15) * 0.22;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(scale, scale);

  if (withShadow) {
    ctx.save();
    ctx.translate(2, 4);
    ctx.globalAlpha = alpha * 0.28;
    ctx.fillStyle = '#0F2528';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.globalAlpha = alpha;

  // Pectoral side fins (translucent)
  ctx.fillStyle = 'rgba(255, 245, 228, 0.72)';
  ctx.save();
  ctx.translate(2, -3.5);
  ctx.rotate(-0.45 + finFlutter);
  ctx.beginPath();
  ctx.ellipse(0, -2.5, 4.2, 2.1, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(2, 3.5);
  ctx.rotate(0.45 - finFlutter);
  ctx.beginPath();
  ctx.ellipse(0, 2.5, 4.2, 2.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Articulated caudal tail fin
  ctx.save();
  ctx.translate(-9.5, 0);
  ctx.rotate(tailSwing);
  ctx.fillStyle = 'rgba(255, 240, 220, 0.8)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-5, -5.5, -9, -4.5);
  ctx.quadraticCurveTo(-6, 0, -9, 4.5);
  ctx.quadraticCurveTo(-5, 5.5, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Tapered koi body
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.bezierCurveTo(9, -4.8, 1, -5.2, -5, -3.1);
  ctx.quadraticCurveTo(-8.5, -1.8, -10, 0);
  ctx.quadraticCurveTo(-8.5, 1.8, -5, 3.1);
  ctx.bezierCurveTo(1, 5.2, 9, 4.8, 11, 0);
  ctx.closePath();
  ctx.fill();

  // Kohaku / Sanke organic blotches
  ctx.fillStyle = spotColor;
  ctx.beginPath();
  ctx.ellipse(3.5, -0.8, 3.4, 2.2, 0.2, 0, Math.PI * 2);
  ctx.ellipse(-3.2, 0.7, 2.7, 1.7, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Subtle dorsal crest & highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(6, -0.4);
  ctx.quadraticCurveTo(0, -1.3, -6.5, -0.2);
  ctx.stroke();

  // Tiny dark eyes
  ctx.fillStyle = '#1D1816';
  ctx.beginPath();
  ctx.arc(8.2, -2.1, 0.75, 0, Math.PI * 2);
  ctx.arc(8.2, 2.1, 0.75, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function getPondLanternWorldPos(
  lantern: PondLanternState,
  index: number,
  now: number
): { x: number; y: number } {
  const angle = ((lantern.seed % 100) / 100) * Math.PI * 2 + index * 0.85;
  const distFactor = 0.28 + ((lantern.seed % 7) / 7) * 0.48;
  const driftX = Math.sin(now * 0.0005 + lantern.seed) * 14;
  const driftY = Math.cos(now * 0.00042 + lantern.seed * 1.3) * 8;
  let lx = POND_SPEC.cx + Math.cos(angle) * 155 * distFactor;
  let ly = POND_SPEC.cy + Math.sin(angle) * 98 * distFactor;
  if (Math.abs(ly - POND_SPEC.cy) < 34) {
    ly = ly >= POND_SPEC.cy ? POND_SPEC.cy + 46 : POND_SPEC.cy - 46;
  }
  return {
    x: lx + driftX,
    y: ly + driftY,
  };
}

const LANTERN_COLORS: Record<LanternColor, { outer: string; inner: string; glow: string }> = {
  gold: { outer: '#F3B44C', inner: '#FFE49C', glow: 'rgba(255, 210, 110, 0.42)' },
  lotus: { outer: '#EB82A0', inner: '#FFD4E2', glow: 'rgba(255, 165, 195, 0.42)' },
  jade: { outer: '#6CC4A6', inner: '#CEFAEA', glow: 'rgba(130, 235, 198, 0.38)' },
  ivory: { outer: '#F5EAD2', inner: '#FFFDF5', glow: 'rgba(255, 246, 214, 0.42)' },
};

function drawLotusPond(
  ctx: CanvasRenderingContext2D,
  now: number,
  lowResourceMode: boolean,
  lanterns: PondLanternState[],
  effects: VisualEffect[],
  koiTimeMs: number,
  smoothFeedPull: number
) {
  const cx = POND_SPEC.cx;
  const cy = POND_SPEC.cy;

  ctx.save();
  // West Tea Pavilion deck cleanly west of Bridge entry
  ctx.fillStyle = '#7A543E';
  roundRect(ctx, 48, 676, 78, 118, 10);
  ctx.fill();
  ctx.strokeStyle = '#9D7156';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#8F654B';
  roundRect(ctx, 56, 684, 62, 102, 6);
  ctx.fill();

  // Natural mossy stone pond embankment
  ctx.fillStyle = '#6A7562';
  ctx.beginPath();
  ctx.ellipse(cx, cy, POND_SPEC.rx + 14, POND_SPEC.ry + 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Deep layered pond water
  const waterGrad = ctx.createRadialGradient(cx - 24, cy - 20, 20, cx, cy, POND_SPEC.rx + 10);
  waterGrad.addColorStop(0, '#4B8E94');
  waterGrad.addColorStop(0.55, '#356E75');
  waterGrad.addColorStop(0.85, '#27555B');
  waterGrad.addColorStop(1, '#1E4248');
  ctx.fillStyle = waterGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, POND_SPEC.rx, POND_SPEC.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle sunlit water caustics
  if (!lowResourceMode) {
    ctx.strokeStyle = 'rgba(195, 240, 236, 0.14)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const shimmer = Math.sin(now * 0.0014 + i * 1.7) * 8;
      ctx.beginPath();
      ctx.ellipse(cx - 55 + i * 38, cy - 44 + (i % 2) * 88 + shimmer * 0.3, 34, 12, 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Mossy shore boulders
  const shoreRocks = [
    { x: 185, y: 635, rx: 19, ry: 12, rot: 0.2 },
    { x: 492, y: 632, rx: 21, ry: 14, rot: -0.2 },
    { x: 505, y: 830, rx: 18, ry: 13, rot: 0.4 },
    { x: 192, y: 836, rx: 22, ry: 15, rot: -0.1 },
    { x: 344, y: 598, rx: 18, ry: 11, rot: 0.1 },
    { x: 356, y: 874, rx: 20, ry: 13, rot: -0.3 },
  ];
  for (const sr of shoreRocks) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(sr.x + 2, sr.y + 3, sr.rx, sr.ry, sr.rot, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7C7A70';
    ctx.beginPath();
    ctx.ellipse(sr.x, sr.y, sr.rx, sr.ry, sr.rot, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#9C9A8E';
    ctx.beginPath();
    ctx.ellipse(sr.x - 3, sr.y - 3, sr.rx * 0.55, sr.ry * 0.48, sr.rot, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(94, 138, 78, 0.72)';
    ctx.beginPath();
    ctx.ellipse(sr.x + 4, sr.y + 2, sr.rx * 0.42, sr.ry * 0.36, sr.rot, 0, Math.PI * 2);
    ctx.fill();
  }

  const feedEf = effects.find((e) => e.kind === 'feed_koi' && now - e.createdAt < 9000);
  const feedPull = smoothFeedPull;

  // Realistic swimming Koi school in north & south pond waters clear of bridge
  const koiSpecs = [
    { ox: 270, oy: 650, rx: 52, ry: 17, speed: 0.00056, base: '#FAF4EA', spot: '#E6673A', scale: 1.15 },
    { ox: 412, oy: 816, rx: 54, ry: 18, speed: -0.00046, base: '#F4B647', spot: '#D96C2B', scale: 1.05 },
    { ox: 250, oy: 814, rx: 40, ry: 15, speed: 0.0005, base: '#E97046', spot: '#2E2826', scale: 1.0 },
    { ox: 425, oy: 652, rx: 38, ry: 15, speed: -0.00052, base: '#F9F3E9', spot: '#D84E3C', scale: 0.95 },
  ];
  const visibleKoi = lowResourceMode ? koiSpecs.slice(0, 2) : koiSpecs;
  for (let idx = 0; idx < visibleKoi.length; idx++) {
    const k = visibleKoi[idx];
    const t = koiTimeMs * k.speed + idx * 1.4;
    const baseOx = k.ox + (cx - k.ox) * feedPull * 0.55;
    const baseOy = k.oy + (635 - k.oy) * feedPull * 0.58;
    const rx = k.rx * (1 - feedPull * 0.35);
    const ry = k.ry * (1 - feedPull * 0.3);
    const kx = baseOx + Math.cos(t) * rx;
    const ky = baseOy + Math.sin(t * 2) * ry;
    const vx = -Math.sin(t) * rx * k.speed;
    const vy = Math.cos(t * 2) * 2 * ry * k.speed;
    const heading = Math.atan2(vy, vx);
    drawRealisticKoiFish(ctx, kx, ky, heading, k.scale, koiTimeMs * 0.009 + idx * 2, k.base, k.spot, 0.88, true);
  }

  // Active floating golden koi pellets & feeding ripples on north Ao Sen
  if (feedEf) {
    const age = (now - feedEf.createdAt) / 1000;
    const alpha = Math.max(0, Math.min(1, 1 - age / 9));
    for (let p = 0; p < 7; p++) {
      const px = cx + Math.sin(p * 2.3) * 22;
      const py = 635 + Math.cos(p * 1.7) * 11;
      ctx.fillStyle = `rgba(244, 198, 92, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!lowResourceMode) {
      const r = ((now * 0.03) % 28) + 6;
      ctx.strokeStyle = `rgba(215, 248, 248, ${alpha * 0.55})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, 635, r * 1.35, r * 0.65, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (!lowResourceMode) {
    const r = ((now * 0.022) % 42) + 8;
    ctx.strokeStyle = `rgba(215, 248, 248, ${Math.max(0, 0.42 - r / 115)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(395, 650, r * 1.3, r * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Floating Wish Lanterns (Hoa Đăng Ao Sen)
  for (let i = 0; i < lanterns.length; i++) {
    const lantern = lanterns[i];
    const lp = getPondLanternWorldPos(lantern, i, now);
    const palette = LANTERN_COLORS[lantern.color] || LANTERN_COLORS.gold;

    ctx.save();
    ctx.translate(lp.x, lp.y);

    if (!lowResourceMode) {
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      halo.addColorStop(0, palette.glow);
      halo.addColorStop(1, 'rgba(255, 210, 120, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2 + now * 0.00025;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = palette.outer;
      ctx.beginPath();
      ctx.ellipse(0, -5, 3.2, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = palette.inner;
    ctx.beginPath();
    ctx.arc(0, 0, 4.3, 0, Math.PI * 2);
    ctx.fill();

    const flicker = lowResourceMode ? 0 : Math.sin(now * 0.018 + lantern.seed) * 0.6;
    ctx.fillStyle = '#FFE48A';
    ctx.beginPath();
    ctx.ellipse(flicker * 0.3, -1, 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Veined lotus pads & multi-petal lotus blooms across north & south pond waters
  const pads = [
    { x: 218, y: 652, r: 19, rot: 0.4, flower: true },
    { x: 315, y: 632, r: 16, rot: -0.6, flower: false },
    { x: 438, y: 648, r: 20, rot: 1.1, flower: true },
    { x: 486, y: 676, r: 17, rot: 0.3, flower: true },
    { x: 228, y: 812, r: 18, rot: -0.3, flower: true },
    { x: 342, y: 838, r: 15, rot: 0.8, flower: false },
    { x: 458, y: 816, r: 19, rot: -0.9, flower: true },
    { x: 184, y: 688, r: 14, rot: 0.2, flower: false },
  ];
  for (const pad of pads) {
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.rotate(pad.rot);

    ctx.fillStyle = 'rgba(12, 34, 38, 0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 3, pad.r, pad.r * 0.68, 0, 0.25, Math.PI * 1.88);
    ctx.lineTo(2, 3);
    ctx.fill();

    const padGrad = ctx.createRadialGradient(-3, -2, 2, 0, 0, pad.r);
    padGrad.addColorStop(0, '#6CA972');
    padGrad.addColorStop(1, '#3D784B');
    ctx.fillStyle = padGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, pad.r, pad.r * 0.68, 0, 0.25, Math.PI * 1.88);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(176, 224, 168, 0.35)';
    ctx.lineWidth = 0.8;
    for (let v = 0.7; v < Math.PI * 1.75; v += 0.65) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(v) * pad.r * 0.85, Math.sin(v) * pad.r * 0.56);
      ctx.stroke();
    }
    ctx.restore();

    if (pad.flower) {
      ctx.save();
      ctx.translate(pad.x, pad.y - 3);
      for (let p = 0; p < 6; p++) {
        const ang = (p / 6) * Math.PI * 2;
        ctx.save();
        ctx.rotate(ang);
        ctx.fillStyle = p % 2 === 0 ? '#F294AA' : '#F8B0C2';
        ctx.beginPath();
        ctx.ellipse(0, -5.5, 3.2, 5.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (let p = 0; p < 4; p++) {
        const ang = (p / 4) * Math.PI * 2 + 0.4;
        ctx.save();
        ctx.rotate(ang);
        ctx.fillStyle = '#FCD2DC';
        ctx.beginPath();
        ctx.ellipse(0, -3.2, 2.3, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#F7CA5C';
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Arched Wooden Cầu Ao Sen Bridge Deck & North Handrail (characters walk cleanly over planks)
  const bx0 = POND_SPEC.bridgeXMin;
  const bw = POND_SPEC.bridgeXMax - POND_SPEC.bridgeXMin;
  const by0 = POND_SPEC.bridgeYMin;
  const bh = POND_SPEC.bridgeYMax - POND_SPEC.bridgeYMin;

  ctx.fillStyle = 'rgba(10, 26, 30, 0.35)';
  roundRect(ctx, bx0, by0 + 10, bw, bh, 5);
  ctx.fill();

  ctx.fillStyle = '#8F5F42';
  roundRect(ctx, bx0, by0, bw, bh, 5);
  ctx.fill();
  ctx.strokeStyle = '#C99E67';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(54, 30, 18, 0.42)';
  ctx.lineWidth = 1.2;
  for (let px = bx0 + 14; px < POND_SPEC.bridgeXMax - 6; px += 14) {
    ctx.beginPath();
    ctx.moveTo(px, by0 + 2);
    ctx.lineTo(px, by0 + bh - 2);
    ctx.stroke();
  }

  // North crimson rail
  ctx.strokeStyle = '#9C3E32';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx0 + 6, by0);
  ctx.lineTo(POND_SPEC.bridgeXMax - 6, by0);
  ctx.stroke();
  for (let px = bx0 + 8; px <= POND_SPEC.bridgeXMax - 8; px += 54) {
    ctx.fillStyle = '#9C3E32';
    ctx.beginPath();
    ctx.arc(px, by0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#E8B86A';
    ctx.beginPath();
    ctx.arc(px, by0, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBridgeSouthRail2D(ctx: CanvasRenderingContext2D) {
  const bx0 = POND_SPEC.bridgeXMin;
  const yS = POND_SPEC.bridgeYMax;
  ctx.save();
  ctx.strokeStyle = '#9C3E32';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx0 + 6, yS);
  ctx.lineTo(POND_SPEC.bridgeXMax - 6, yS);
  ctx.stroke();
  for (let px = bx0 + 8; px <= POND_SPEC.bridgeXMax - 8; px += 54) {
    ctx.fillStyle = '#9C3E32';
    ctx.beginPath();
    ctx.arc(px, yS, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#E8B86A';
    ctx.beginPath();
    ctx.arc(px, yS, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStupaTerrace2D(ctx: CanvasRenderingContext2D) {
  const sx = STUPA_SPEC.cx;
  const sy = STUPA_SPEC.cy;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 6, 86, 68, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#9B8E80';
  roundRect(ctx, sx - 76, sy - 62, 152, 124, 14);
  ctx.fill();
  ctx.strokeStyle = '#C4B7A8';
  ctx.lineWidth = 2;
  ctx.stroke();

  // South entry steps toward Chánh Điện
  ctx.fillStyle = '#ACA092';
  for (let s = 0; s < 3; s++) {
    ctx.fillRect(sx - 30, sy + 62 + s * 6, 60, 5);
  }
  ctx.restore();
}

function drawStupaTower2D(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  deckPlayers: Array<{
    player: RoomPlayer;
    pos: RenderPos;
    isSelf: boolean;
    performingAction: RitualAction | null;
  }> = [],
  now = 0
) {
  ctx.save();
  // 8 tapering lower pagoda stories
  let curBottomY = sy + 28;
  for (let t = 0; t < 8; t++) {
    const tierW = Math.round(112 - t * 6.2);
    const bodyH = Math.round(21 - t * 0.65);
    const roofH = Math.round(13 - t * 0.4);
    const bodyColor = t % 2 === 0 ? '#E8D5B5' : '#DFC7A0';
    const roofColor = t % 2 === 0 ? '#9E3E32' : '#A64437';

    ctx.fillStyle = bodyColor;
    roundRect(ctx, sx - tierW / 2, curBottomY - bodyH, tierW, bodyH, 3);
    ctx.fill();
    ctx.strokeStyle = '#9A4336';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (t === 0) {
      // Gold-framed south doorway entrance
      ctx.fillStyle = '#381E14';
      roundRect(ctx, sx - 12, curBottomY - 19, 24, 19, 3);
      ctx.fill();
      ctx.strokeStyle = '#E8B86A';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else {
      // Subtle arched window slits on upper stories
      ctx.fillStyle = '#4B2B1E';
      const winCount = t <= 4 ? 3 : 2;
      const span = tierW * 0.56;
      for (let w = 0; w < winCount; w++) {
        const wx = sx - span / 2 + (span * w) / (winCount - 1);
        roundRect(ctx, wx - 2.6, curBottomY - bodyH * 0.72, 5.2, bodyH * 0.48, 2);
        ctx.fill();
      }
    }

    // Tier upturned curved pagoda roof
    const roofTopY = curBottomY - bodyH - roofH;
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(sx - tierW * 0.68, curBottomY - bodyH + 2);
    ctx.quadraticCurveTo(sx, roofTopY - 4, sx + tierW * 0.68, curBottomY - bodyH + 2);
    ctx.lineTo(sx + tierW * 0.56, curBottomY - bodyH + 6);
    ctx.lineTo(sx - tierW * 0.56, curBottomY - bodyH + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#E8B86A';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    curBottomY -= bodyH + 3;
  }

  // 9th Tier: Open-Air Observation Deck (Đài Quan Sát Tầng 9)
  const deckW = 98;
  const deckFloorY = curBottomY - 6;
  const deckRoofY = deckFloorY - 38;

  // Corbel bracket support under cantilevered deck
  ctx.fillStyle = '#8F362B';
  ctx.beginPath();
  ctx.moveTo(sx - 34, curBottomY + 2);
  ctx.lineTo(sx - deckW / 2, deckFloorY + 6);
  ctx.lineTo(sx + deckW / 2, deckFloorY + 6);
  ctx.lineTo(sx + 34, curBottomY + 2);
  ctx.closePath();
  ctx.fill();

  // Deck stone floor slab & gold trim
  ctx.fillStyle = '#D5C7B2';
  roundRect(ctx, sx - deckW / 2, deckFloorY - 4, deckW, 10, 3);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Back 2 crimson corner pillars & back golden balustrade rail
  ctx.fillStyle = '#8A2E25';
  ctx.fillRect(sx - deckW / 2 + 8, deckRoofY + 6, 4.5, deckFloorY - deckRoofY - 8);
  ctx.fillRect(sx + deckW / 2 - 12.5, deckRoofY + 6, 4.5, deckFloorY - deckRoofY - 8);
  ctx.strokeStyle = '#D9A75A';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sx - deckW / 2 + 8, deckFloorY - 11);
  ctx.lineTo(sx + deckW / 2 - 8, deckFloorY - 11);
  ctx.stroke();

  // Render up to 3 concurrent players standing on the 9th-tier Observation Deck
  if (deckPlayers.length > 0) {
    const sortedDeck = [...deckPlayers].sort((a, b) => a.pos.y - b.pos.y);
    for (const dp of sortedDeck) {
      const relX = Math.max(
        -1,
        Math.min(1, (dp.pos.x - STUPA_SPEC.cx) / Math.max(1, STUPA_DECK_WALK_HALF))
      );
      const relY = Math.max(
        -1,
        Math.min(1, (dp.pos.y - STUPA_SPEC.cy) / Math.max(1, STUPA_DECK_WALK_HALF))
      );
      const px = sx + relX * 26;
      const py = deckFloorY - 6 + relY * 4;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(0.68, 0.68);
      drawPlayerCharacter(
        ctx,
        dp.player,
        { ...dp.pos, x: 0, y: 0 },
        dp.isSelf,
        now,
        dp.performingAction
      );
      ctx.restore();
    }
  }

  // Front balustrade safety rail & 2 front corner pillars (drawn in front of players' feet)
  ctx.fillStyle = '#A8382D';
  ctx.fillRect(sx - deckW / 2 + 4, deckRoofY + 8, 5, deckFloorY - deckRoofY - 6);
  ctx.fillRect(sx + deckW / 2 - 9, deckRoofY + 8, 5, deckFloorY - deckRoofY - 6);
  ctx.strokeStyle = '#F3C776';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - deckW / 2 + 2, deckFloorY - 7);
  ctx.lineTo(sx + deckW / 2 - 2, deckFloorY - 7);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(243, 199, 118, 0.72)';
  ctx.lineWidth = 1.2;
  for (let p = -3; p <= 3; p++) {
    const rx = sx + p * 11.5;
    ctx.beginPath();
    ctx.moveTo(rx, deckFloorY - 7);
    ctx.lineTo(rx, deckFloorY);
    ctx.stroke();
  }

  // Crowning 9th-tier upturned pagoda roof above the Observation Deck
  ctx.fillStyle = '#9E3E32';
  ctx.beginPath();
  ctx.moveTo(sx - 66, deckRoofY + 10);
  ctx.quadraticCurveTo(sx, deckRoofY - 18, sx + 66, deckRoofY + 10);
  ctx.lineTo(sx + 54, deckRoofY + 15);
  ctx.lineTo(sx - 54, deckRoofY + 15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Golden lotus finial spire crowning the 9th tier
  ctx.fillStyle = '#E8B86A';
  ctx.beginPath();
  ctx.arc(sx, deckRoofY - 7, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx - 6.5, deckRoofY - 9);
  ctx.lineTo(sx, deckRoofY - 46);
  ctx.lineTo(sx + 6.5, deckRoofY - 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFE4A3';
  ctx.beginPath();
  ctx.arc(sx, deckRoofY - 48, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // Base nameplate & live Đài Quan Sát occupancy indicator
  const plaqueW = deckPlayers.length > 0 ? 130 : 108;
  const plaqueH = deckPlayers.length > 0 ? 28 : 19;
  ctx.fillStyle = '#4A2E22';
  roundRect(ctx, sx - plaqueW / 2, sy + 32, plaqueW, plaqueH, 4);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 9px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BẢO THÁP 9 TẦNG', sx, sy + (deckPlayers.length > 0 ? 41 : 41.5));
  if (deckPlayers.length > 0) {
    ctx.fillStyle = '#F7D288';
    ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Đài Quan Sát · ${deckPlayers.length}/${STUPA_DECK_CAPACITY}`, sx, sy + 52);
  }
  ctx.restore();
}

function drawCypressTree2D(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 6, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5A3D2C';
  ctx.fillRect(x - 3, y - 16, 6, 20);
  [
    { dy: -18, r: 16, c: '#2E5434' },
    { dy: -34, r: 13, c: '#38633E' },
    { dy: -48, r: 9, c: '#44764B' },
  ].forEach((tier) => {
    ctx.fillStyle = tier.c;
    ctx.beginPath();
    ctx.arc(x, y + tier.dy, tier.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawMemorialGrave2D(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  roundRect(ctx, x - 24, y - 16, 48, 38, 5);
  ctx.fill();
  // Stone plinth & mound
  ctx.fillStyle = '#9EA4A6';
  roundRect(ctx, x - 22, y - 20, 44, 36, 4);
  ctx.fill();
  ctx.strokeStyle = '#6B7073';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = '#6B7073';
  roundRect(ctx, x - 16, y - 10, 32, 22, 3);
  ctx.fill();

  // Upright carved stele headstone
  ctx.fillStyle = '#4B5054';
  roundRect(ctx, x - 14, y - 34, 28, 22, 4);
  ctx.fill();
  ctx.strokeStyle = '#DFB676';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x - 9, y - 30, 18, 14);

  // Small stone vase & lotus flower
  ctx.fillStyle = '#F294AA';
  ctx.beginPath();
  ctx.arc(x - 11, y + 6, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#C99443';
  ctx.beginPath();
  ctx.arc(x + 2, y + 6, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#EAE4DA';
  ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + 25);
  ctx.restore();
}

function drawMemorialAltar2D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  latestMemorial: { deceasedName: string; createdAt: number } | null
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 34, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hexagonal stone altar platform
  ctx.fillStyle = '#8F8B82';
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C9BFA9';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Golden lotus bowl & crimson memorial tablet
  ctx.fillStyle = '#753129';
  roundRect(ctx, x - 11, y - 30, 22, 24, 3);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = '#D4A24E';
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Luminous Cầu Siêu blessing effect (rising golden orbs & floating name plaque)
  if (latestMemorial && Date.now() - latestMemorial.createdAt < 14_000) {
    const sec = now * 0.001;
    const pulse = 0.65 + Math.sin(sec * 3) * 0.25;
    const glow = ctx.createRadialGradient(x, y - 16, 4, x, y - 16, 62);
    glow.addColorStop(0, `rgba(255, 226, 138, ${0.55 * pulse})`);
    glow.addColorStop(1, 'rgba(255, 226, 138, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - 16, 62, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 6; i++) {
      const cyc = (sec * 0.5 + i * 0.17) % 1;
      const ox = x + Math.sin(sec * 2.2 + i * 1.1) * 18;
      const oy = y - 14 - cyc * 58;
      ctx.fillStyle = `rgba(255, 232, 160, ${(1 - cyc) * 0.9})`;
      ctx.beginPath();
      ctx.arc(ox, oy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const banner = `Cầu Siêu · ${latestMemorial.deceasedName.slice(0, 24)}`;
    ctx.font = '700 10.5px "Plus Jakarta Sans", sans-serif';
    const bw = ctx.measureText(banner).width + 18;
    ctx.fillStyle = 'rgba(28, 21, 16, 0.88)';
    roundRect(ctx, x - bw / 2, y - 76, bw, 22, 6);
    ctx.fill();
    ctx.strokeStyle = '#E8B86A';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#FFE4A3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(banner, x, y - 65);
  }

  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ĐÀI CẦU SIÊU', x, y + 24);
  ctx.restore();
}

function drawSanctuaryBaseAndAltar(
  ctx: CanvasRenderingContext2D,
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();
  // Elongated Chánh Điện platform northward (y: -85..495) to enshrine Phật & Bồ Tát and accommodate 10 cushions
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  roundRect(ctx, 672, -79, 576, 587, 12);
  ctx.fill();

  ctx.fillStyle = '#7A543E';
  roundRect(ctx, 680, -85, 560, 580, 10);
  ctx.fill();
  ctx.strokeStyle = '#9D7156';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#8F654B';
  roundRect(ctx, 702, -68, 516, 546, 6);
  ctx.fill();

  ctx.strokeStyle = 'rgba(65, 42, 28, 0.28)';
  ctx.lineWidth = 1;
  for (let fy = -48; fy < 475; fy += 24) {
    ctx.beginPath();
    ctx.moveTo(705, fy);
    ctx.lineTo(1215, fy);
    ctx.stroke();
  }

  // Wide Crimson Sanctuary Carpet spanning all 10 meditation cushions
  ctx.fillStyle = '#983B32';
  ctx.fillRect(724, 112, 472, 383);
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(728, 116, 464, 377);

  // Embroidered Golden Lotus Bowing Mat (Thảm Lạy Phật & Bồ Tát) at (960, 162)
  const bowX = INTERACTABLES.bow.x;
  const bowY = INTERACTABLES.bow.y;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, bowX - 26, bowY - 14, 52, 30, 5);
  ctx.fill();
  ctx.fillStyle = '#B64533';
  roundRect(ctx, bowX - 26, bowY - 16, 52, 30, 5);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#E8B86A';
  ctx.beginPath();
  ctx.arc(bowX, bowY - 1, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LẠY PHẬT & BỒ TÁT', bowX, bowY + 23);

  ctx.fillStyle = '#8A7C6E';
  ctx.fillRect(880, 495, 160, 44);
  for (let sy = 498; sy <= 528; sy += 10) {
    ctx.fillStyle = '#9E8F80';
    ctx.fillRect(884, sy, 152, 7);
  }

  const pillarCoords = [
    { x: 720, y: 468 },
    { x: 830, y: 468 },
    { x: 1090, y: 468 },
    { x: 1200, y: 468 },
    { x: 720, y: 185 },
    { x: 1200, y: 185 },
    { x: 720, y: -52 },
    { x: 1200, y: -52 },
  ];
  for (const p of pillarCoords) {
    ctx.fillStyle = '#964739';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E8B86A';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Unified wide carved Altar Table spanning both shrines at north end
  ctx.fillStyle = '#603B2A';
  roundRect(ctx, 786, 62, 348, 42, 6);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw Left Shrine (Phật Thích Ca Mâu Ni) & Right Shrine (Bồ Tát Quán Thế Âm)
  const shrines: Array<{ kind: 'buddha' | 'quanAm'; cx: number; caption: string }> = [
    { kind: 'buddha', cx: 876, caption: 'ĐỨC PHẬT' },
    { kind: 'quanAm', cx: 1044, caption: 'BỒ TÁT' },
  ];
  const pulse = lowResourceMode ? 0.34 : 0.34 + Math.sin(now * 0.002) * 0.07;

  for (const shrine of shrines) {
    const glowGrad = ctx.createRadialGradient(shrine.cx, -6, 12, shrine.cx, -6, 76);
    glowGrad.addColorStop(0, `rgba(255, 224, 145, ${pulse})`);
    glowGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(shrine.cx, -6, 76, 0, Math.PI * 2);
    ctx.fill();

    const frameW = 126;
    const frameH = 112;
    const frameX = shrine.cx - frameW / 2;
    const frameY = -66;

    // Carved golden dais & lotus pedestal beneath each shrine
    ctx.fillStyle = '#5B3A29';
    roundRect(ctx, shrine.cx - 71, 44, 142, 15, 4);
    ctx.fill();
    ctx.strokeStyle = '#E8B86A';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(frameX, frameY + frameH);
    ctx.lineTo(frameX, frameY + 34);
    ctx.quadraticCurveTo(frameX + frameW / 2, frameY - 12, frameX + frameW, frameY + 34);
    ctx.lineTo(frameX + frameW, frameY + frameH);
    ctx.closePath();
    ctx.fillStyle = '#2B1F18';
    ctx.fill();
    ctx.clip();

    const altarImg = getAltarImage(shrine.kind);
    if (altarImg) {
      const sx = altarImg.naturalWidth * 0.14;
      const sy = altarImg.naturalHeight * 0.06;
      const sw = altarImg.naturalWidth * 0.72;
      const sh = altarImg.naturalHeight * 0.84;
      ctx.drawImage(altarImg, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
    } else {
      ctx.fillStyle = '#F0C571';
      ctx.beginPath();
      ctx.arc(shrine.cx, -14, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(frameX, frameY + frameH);
    ctx.lineTo(frameX, frameY + 34);
    ctx.quadraticCurveTo(frameX + frameW / 2, frameY - 12, frameX + frameW, frameY + 34);
    ctx.lineTo(frameX + frameW, frameY + frameH);
    ctx.closePath();
    ctx.strokeStyle = '#E8B86A';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.fillStyle = '#F7DFAC';
    ctx.font = '600 7.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shrine.caption, shrine.cx, 54.5);
  }

  // Central golden altar incense censer between the two shrines
  ctx.fillStyle = '#C99443';
  ctx.beginPath();
  ctx.ellipse(960, 82, 12, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#F3C776';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#B86942';
  ctx.fillRect(959, 67, 2, 12);
  ctx.fillStyle = '#FF9347';
  ctx.beginPath();
  ctx.arc(960, 66, 2, 0, Math.PI * 2);
  ctx.fill();

  // Four pairs of glowing altar candles across the altar table
  [798, 934, 986, 1122].forEach((cx) => {
    ctx.fillStyle = '#D95A47';
    ctx.fillRect(cx - 3.5, 74, 7, 14);
    const flicker = lowResourceMode ? 0 : Math.sin(now * 0.015 + cx) * 1.1;
    ctx.fillStyle = '#FFD27A';
    ctx.beginPath();
    ctx.ellipse(cx + flicker * 0.4, 70, 3.2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Flanking sanctuary red lanterns
  [756, 1164].forEach((lx) => {
    ctx.fillStyle = 'rgba(245, 145, 90, 0.18)';
    ctx.beginPath();
    ctx.arc(lx, 14, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#DE6347';
    ctx.beginPath();
    ctx.ellipse(lx, 14, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawSanctuaryRoof(ctx: CanvasRenderingContext2D, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = '#A14135';
  ctx.beginPath();
  ctx.moveTo(645, -24);
  ctx.quadraticCurveTo(960, -142, 1275, -24);
  ctx.lineTo(1245, 24);
  ctx.quadraticCurveTo(960, -56, 675, 24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#8F382D';
  ctx.beginPath();
  ctx.moveTo(652, 475);
  ctx.lineTo(1268, 475);
  ctx.lineTo(1250, 504);
  ctx.lineTo(670, 504);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#E0AC5C';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.fillStyle = '#E8B86A';
  ctx.beginPath();
  ctx.arc(960, -94, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4A2E22';
  roundRect(ctx, 848, 474, 224, 24, 5);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 11.5px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHÁNH ĐIỆN · PHẬT & BỒ TÁT', 960, 486);

  ctx.restore();
}

function getKitchen2DMealSlots(
  tableX: number,
  tableY: number,
  meals: KitchenMealState[]
): Array<{ meal: KitchenMealState; cx: number; cy: number; scale: number }> {
  const active = meals.slice(0, 6);
  if (active.length === 0) return [];
  if (active.length === 1) {
    return [{ meal: active[0], cx: tableX, cy: tableY, scale: 1 }];
  }
  const cols = active.length <= 2 ? active.length : 3;
  const rows = active.length <= 3 ? 1 : 2;
  const xGap = cols === 2 ? 64 : 52;
  const yGap = 24;
  const scale = active.length <= 2 ? 0.85 : 0.68;

  return active.map((meal, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const itemsInRow = row === rows - 1 ? active.length - row * cols : cols;
    const cx = tableX + (col - (itemsInRow - 1) / 2) * xGap;
    const cy = tableY + (rows === 1 ? 0 : (row - 0.5) * yGap);
    return { meal, cx, cy, scale };
  });
}

function drawVegetarianKitchen(
  ctx: CanvasRenderingContext2D,
  kitchenMeals: KitchenMealState[],
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();

  // Raised Timber Kitchen Floor Deck (NE pavilion: x 1442..1784, y 262..612)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  roundRect(ctx, 1438, 268, 350, 352, 10);
  ctx.fill();

  ctx.fillStyle = '#75513A';
  roundRect(ctx, 1442, 262, 342, 350, 8);
  ctx.fill();
  ctx.strokeStyle = '#A87C5C';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#8C6248';
  roundRect(ctx, 1452, 272, 322, 330, 6);
  ctx.fill();

  ctx.strokeStyle = 'rgba(56, 36, 22, 0.28)';
  ctx.lineWidth = 1;
  for (let ky = 290; ky < 596; ky += 20) {
    ctx.beginPath();
    ctx.moveTo(1456, ky);
    ctx.lineTo(1770, ky);
    ctx.stroke();
  }

  // Timber entrance step at south edge
  ctx.fillStyle = '#9D7153';
  roundRect(ctx, 1565, 606, 96, 12, 4);
  ctx.fill();
  ctx.strokeStyle = '#694530';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 1. Quầy Bếp & Thực Đơn (792, 62)
  const mx = INTERACTABLES.kitchen_menu.x;
  const my = INTERACTABLES.kitchen_menu.y;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, mx - 56, my - 18, 114, 42, 5);
  ctx.fill();
  ctx.fillStyle = '#5E3D2B';
  roundRect(ctx, mx - 56, my - 22, 112, 40, 5);
  ctx.fill();
  ctx.strokeStyle = '#C99E5A';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Broth pot & bamboo steamer
  ctx.fillStyle = '#784830';
  ctx.beginPath();
  ctx.arc(mx - 32, my - 4, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#C9A467';
  ctx.beginPath();
  ctx.arc(mx - 8, my - 4, 9, 0, Math.PI * 2);
  ctx.fill();

  // Basket of fresh red apples on counter
  ctx.fillStyle = '#B88D54';
  ctx.beginPath();
  ctx.ellipse(mx + 16, my - 2, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  [
    [mx + 12, my - 4],
    [mx + 20, my - 3],
    [mx + 16, my + 1],
  ].forEach(([ax, ay]) => {
    ctx.fillStyle = '#DF3B30';
    ctx.beginPath();
    ctx.arc(ax, ay, 3.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Mini menu board
  ctx.fillStyle = '#F5E9CE';
  roundRect(ctx, mx + 33, my - 15, 16, 20, 2);
  ctx.fill();
  ctx.strokeStyle = '#5B3A29';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 8.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THỰC ĐƠN', mx, my + 27);

  // 2. Bàn Ăn Chay (Shared dining table supporting up to 6 portions)
  const tx = INTERACTABLES.kitchen_table.x;
  const ty = INTERACTABLES.kitchen_table.y;
  const isMultiMeal = kitchenMeals.length > 1;
  const tableHalfW = isMultiMeal ? 86 : 62;
  const tableHalfH = kitchenMeals.length > 3 ? 28 : 19;

  // Wooden benches above & below table
  ctx.fillStyle = '#603B2A';
  roundRect(ctx, tx - tableHalfW + 10, ty - tableHalfH - 12, (tableHalfW - 10) * 2, 10, 3);
  ctx.fill();
  roundRect(ctx, tx - tableHalfW + 10, ty + tableHalfH + 4, (tableHalfW - 10) * 2, 10, 3);
  ctx.fill();

  // Dining tabletop
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, tx - tableHalfW, ty - tableHalfH + 3, tableHalfW * 2, tableHalfH * 2, 6);
  ctx.fill();
  ctx.fillStyle = '#9D6D4D';
  roundRect(ctx, tx - tableHalfW, ty - tableHalfH, tableHalfW * 2, tableHalfH * 2, 6);
  ctx.fill();
  ctx.strokeStyle = '#DFB676';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Live plated vegetarian dishes & drink glasses on Bàn Ăn Chay
  const mealSlots = getKitchen2DMealSlots(tx, ty, kitchenMeals);
  if (mealSlots.length > 0) {
    mealSlots.forEach((slot, idx) => {
      const meal = slot.meal;
      const sc = slot.scale;
      const foodInfo =
        VEGETARIAN_FOOD_MENU.find((f) => f.id === meal.foodId) ?? VEGETARIAN_FOOD_MENU[0];
      const drinkInfo =
        VEGETARIAN_DRINK_MENU.find((d) => d.id === meal.drinkId) ?? VEGETARIAN_DRINK_MENU[0];

      // Left: Food bowl & chopsticks
      const fx = slot.cx - 16 * sc;
      const fy = slot.cy;
      ctx.fillStyle = '#F5F0E4';
      ctx.beginPath();
      ctx.arc(fx, fy, 10.5 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#B89564';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      if (!meal.foodEaten) {
        ctx.fillStyle = foodInfo.color;
        ctx.beginPath();
        ctx.arc(fx, fy, 7.6 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5CA852';
        ctx.beginPath();
        ctx.arc(fx + 2 * sc, fy - 2 * sc, 2.2 * sc, 0, Math.PI * 2);
        ctx.fill();
        if (!lowResourceMode) {
          const sOff = Math.sin(now * 0.004 + idx * 1.1) * 2.2;
          ctx.strokeStyle = 'rgba(255, 248, 232, 0.45)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(fx - 2 * sc, fy - 8 * sc);
          ctx.quadraticCurveTo(fx - 2 * sc + sOff, fy - 14 * sc, fx - sc, fy - 19 * sc);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#DED6C6';
        ctx.beginPath();
        ctx.arc(fx, fy, 7.2 * sc, 0, Math.PI * 2);
        ctx.fill();
      }

      // Chopsticks
      ctx.strokeStyle = '#5A3622';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(fx + 8 * sc, fy - 4 * sc);
      ctx.lineTo(fx + 16 * sc, fy + 4 * sc);
      ctx.stroke();

      // Right: Drink glass
      const dx = slot.cx + 16 * sc;
      const dy = slot.cy;
      ctx.fillStyle = '#5E3D2B';
      ctx.beginPath();
      ctx.arc(dx, dy, 8.5 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = meal.drinkDrunk ? 'rgba(232, 244, 246, 0.55)' : drinkInfo.color;
      ctx.beginPath();
      ctx.arc(dx, dy, 6.6 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      if (!meal.drinkDrunk && drinkInfo.id === 'nuoc-ep-tao') {
        ctx.fillStyle = '#E23D32';
        ctx.beginPath();
        ctx.arc(dx + 5.5 * sc, dy - 4.5 * sc, 2.8 * sc, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  } else {
    ctx.fillStyle = 'rgba(251, 240, 212, 0.72)';
    ctx.font = '500 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BÀN ĂN CHAY', tx, ty);
  }

  // 3. Bồn Rửa Bát & Ly (1140, 62)
  const sx = INTERACTABLES.kitchen_sink.x;
  const sy = INTERACTABLES.kitchen_sink.y;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, sx - 56, sy - 18, 114, 42, 5);
  ctx.fill();
  ctx.fillStyle = '#5E3D2B';
  roundRect(ctx, sx - 56, sy - 22, 112, 40, 5);
  ctx.fill();
  ctx.strokeStyle = '#B8A89A';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Stone basin & clear water
  ctx.fillStyle = '#9C948A';
  roundRect(ctx, sx - 48, sy - 15, 54, 26, 4);
  ctx.fill();
  ctx.fillStyle = '#4B9AA3';
  roundRect(ctx, sx - 42, sy - 10, 42, 17, 3);
  ctx.fill();

  // Bamboo spout
  ctx.strokeStyle = '#A88C54';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 21, sy - 18);
  ctx.lineTo(sx - 21, sy - 8);
  ctx.stroke();

  // Clean bowls & glasses on drying rack
  [sx + 18, sx + 31, sx + 43].forEach((bx) => {
    ctx.fillStyle = '#F5F0E4';
    ctx.beginPath();
    ctx.arc(bx, sy - 2, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 8.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BỒN RỬA BÁT & LY', sx, sy + 27);

  ctx.restore();
}

function drawVegetarianKitchenRoof(ctx: CanvasRenderingContext2D, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = '#8F382D';
  ctx.beginPath();
  ctx.moveTo(1428, 286);
  ctx.quadraticCurveTo(1613, 212, 1798, 286);
  ctx.lineTo(1786, 594);
  ctx.quadraticCurveTo(1613, 558, 1440, 594);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Ridge beam accent
  ctx.strokeStyle = '#DFB676';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1470, 286);
  ctx.lineTo(1756, 286);
  ctx.stroke();

  ctx.fillStyle = '#4A2E22';
  roundRect(ctx, 1545, 588, 136, 22, 4);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 10px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GIAN BẾP CHAY', 1613, 599);

  ctx.restore();
}

function drawSidePavilionBase(ctx: CanvasRenderingContext2D, cx: number, cy: number, title: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  roundRect(ctx, cx - 72, cy - 66, 144, 132, 10);
  ctx.fill();

  ctx.fillStyle = '#7D5B45';
  roundRect(ctx, cx - 68, cy - 62, 136, 124, 8);
  ctx.fill();
  ctx.strokeStyle = '#A1795E';
  ctx.lineWidth = 2;
  ctx.stroke();

  [
    [cx - 56, cy - 50],
    [cx + 56, cy - 50],
    [cx - 56, cy + 50],
    [cx + 56, cy + 50],
  ].forEach(([px, py]) => {
    ctx.fillStyle = '#964739';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(251, 240, 212, 0.78)';
  ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, cx, cy + 54);
  ctx.restore();
}

function drawPavilionRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  title: string,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#A14135';
  ctx.beginPath();
  ctx.moveTo(cx - 82, cy - 35);
  ctx.quadraticCurveTo(cx, cy - 92, cx + 82, cy - 35);
  ctx.lineTo(cx + 68, cy - 18);
  ctx.quadraticCurveTo(cx, cy - 56, cx - 68, cy - 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = '#4A2E22';
  roundRect(ctx, cx - 42, cy - 36, 84, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 9.5px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, cx, cy - 27);
  ctx.restore();
}

function drawTamQuanPillars(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = '#8C7E70';
  ctx.fillRect(855, 1118, 210, 48);
  for (let sy = 1126; sy <= 1154; sy += 14) {
    ctx.fillStyle = '#A39485';
    ctx.fillRect(865, sy, 190, 8);
  }

  [855, 1065].forEach((px) => {
    ctx.fillStyle = '#9E4336';
    roundRect(ctx, px - 14, 1072, 28, 66, 5);
    ctx.fill();
    ctx.strokeStyle = '#E8B86A';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();
}

function drawTamQuanRoof(ctx: CanvasRenderingContext2D, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#A34235';
  ctx.beginPath();
  ctx.moveTo(815, 1086);
  ctx.quadraticCurveTo(960, 1022, 1105, 1086);
  ctx.lineTo(1086, 1106);
  ctx.quadraticCurveTo(960, 1062, 834, 1106);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#4A2E22';
  roundRect(ctx, 898, 1074, 124, 21, 4);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 10.5px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CỔNG TAM QUAN', 960, 1084.5);
  ctx.restore();
}

function drawCourtyardProps(ctx: CanvasRenderingContext2D) {
  ctx.save();
  // Ornamental potted apricot/peach bonsai planters outside the Door Guardians
  [792, 1128].forEach((px) => {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(px + 2, 541, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ceramic planter pot
    ctx.fillStyle = '#7E5E4B';
    ctx.beginPath();
    ctx.ellipse(px, 537, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#C99E67';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Mini bonsai trunk & layered foliage puffs
    ctx.strokeStyle = '#5B3D2C';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(px, 534);
    ctx.quadraticCurveTo(px - 4, 525, px + 2, 518);
    ctx.stroke();

    const tufts = [
      { dx: -6, dy: 523, r: 7, c: '#487A4E' },
      { dx: 6, dy: 525, r: 6.5, c: '#558C59' },
      { dx: 1, dy: 516, r: 8, c: '#65A064' },
    ];
    for (const tf of tufts) {
      ctx.fillStyle = tf.c;
      ctx.beginPath();
      ctx.arc(px + tf.dx, tf.dy, tf.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#F7A2B6';
    ctx.beginPath();
    ctx.arc(px - 3, 517, 2.3, 0, Math.PI * 2);
    ctx.arc(px + 4, 521, 2.1, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawHonNonBo2D(ctx: CanvasRenderingContext2D, now: number, lowResourceMode: boolean) {
  const { cx, cy, rx, ry } = HON_NON_BO_SPEC;
  const sec = now * 0.001;
  ctx.save();

  // Soft garden ground shadow
  ctx.fillStyle = 'rgba(14, 24, 16, 0.30)';
  ctx.beginPath();
  ctx.ellipse(cx + 6, cy + 11, rx + 14, ry + 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mossy natural stone embankment matching Ao Sen
  ctx.fillStyle = '#6A7562';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 10, ry + 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Carved sandstone lotus-rimmed basin curb
  ctx.fillStyle = '#9C9284';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 5, ry + 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6E655A';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  if (!lowResourceMode) {
    ctx.fillStyle = '#B5AA9A';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const sx = cx + Math.cos(a) * (rx + 2);
      const sy = cy + Math.sin(a) * (ry + 1.5);
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Deep emerald-jade water matching Ao Sen's exact palette
  const waterGrad = ctx.createRadialGradient(cx - 18, cy - 12, 14, cx, cy, rx - 2);
  waterGrad.addColorStop(0, '#4B8E94');
  waterGrad.addColorStop(0.55, '#356E75');
  waterGrad.addColorStop(0.85, '#27555B');
  waterGrad.addColorStop(1, '#1E4248');
  ctx.fillStyle = waterGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 3, ry - 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sunlit water caustics matching Ao Sen
  if (!lowResourceMode) {
    ctx.strokeStyle = 'rgba(195, 240, 236, 0.16)';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 4; i++) {
      const shimmer = Math.sin(sec * 1.4 + i * 1.6) * 5;
      ctx.beginPath();
      ctx.ellipse(cx - 58 + i * 38, cy + 36 + (i % 2) * 16 + shimmer * 0.25, 22, 8, 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Mossy shore boulders tucked inside the basin rim (matching Ao Sen rockwork)
  const rimRocks = [
    { x: cx - 96, y: cy + 28, rx: 13, ry: 8, rot: 0.2 },
    { x: cx + 98, y: cy + 24, rx: 14, ry: 9, rot: -0.25 },
    { x: cx - 76, y: cy - 36, rx: 12, ry: 7, rot: 0.4 },
    { x: cx + 78, y: cy - 32, rx: 12, ry: 8, rot: -0.3 },
    { x: cx + 52, y: cy + 62, rx: 11, ry: 7, rot: 0.15 },
    { x: cx - 54, y: cy + 64, rx: 10, ry: 6, rot: -0.2 },
  ];
  for (const sr of rimRocks) {
    ctx.fillStyle = '#7C7A70';
    ctx.beginPath();
    ctx.ellipse(sr.x, sr.y, sr.rx, sr.ry, sr.rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9C9A8E';
    ctx.beginPath();
    ctx.ellipse(sr.x - 2, sr.y - 2, sr.rx * 0.55, sr.ry * 0.45, sr.rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(94, 138, 78, 0.72)';
    ctx.beginPath();
    ctx.ellipse(sr.x + 3, sr.y + 1, sr.rx * 0.42, sr.ry * 0.35, sr.rot, 0, Math.PI * 2);
    ctx.fill();
  }

  // Realistic swimming Koi fish identical to Ao Sen (drawRealisticKoiFish)
  const nbKoiSpecs = [
    { ox: cx - 44, oy: cy + 44, rx: 32, ry: 12, speed: 0.00062, base: '#FAF4EA', spot: '#E6673A', scale: 0.86 },
    { ox: cx + 48, oy: cy + 40, rx: 30, ry: 11, speed: -0.00054, base: '#F4B647', spot: '#D96C2B', scale: 0.82 },
    { ox: cx + 2, oy: cy + 60, rx: 36, ry: 9, speed: 0.00048, base: '#E97046', spot: '#2E2826', scale: 0.78 },
  ];
  const visibleNbKoi = lowResourceMode ? nbKoiSpecs.slice(0, 2) : nbKoiSpecs;
  for (let idx = 0; idx < visibleNbKoi.length; idx++) {
    const k = visibleNbKoi[idx];
    const t = now * k.speed + idx * 1.9;
    const kx = k.ox + Math.cos(t) * k.rx;
    const ky = k.oy + Math.sin(t * 2) * k.ry;
    const vx = -Math.sin(t) * k.rx * k.speed;
    const vy = Math.cos(t * 2) * 2 * k.ry * k.speed;
    const heading = Math.atan2(vy, vx);
    drawRealisticKoiFish(ctx, kx, ky, heading, k.scale, now * 0.009 + idx * 2, k.base, k.spot, 0.9, true);
  }

  // Concentric waterfall splash ripples
  const rip1 = (sec * 0.55) % 1;
  ctx.strokeStyle = `rgba(218, 248, 250, ${0.42 * (1 - rip1)})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 18, 12 + rip1 * 32, 6 + rip1 * 15, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Veined lotus pads & multi-petal lotus blooms matching Ao Sen
  const nbPads = [
    { x: cx - 84, y: cy + 16, r: 12, rot: 0.4, flower: true },
    { x: cx + 82, y: cy + 20, r: 11.5, rot: -0.5, flower: true },
    { x: cx - 72, y: cy + 50, r: 10, rot: 0.9, flower: false },
    { x: cx + 74, y: cy + 48, r: 10.5, rot: -0.9, flower: true },
  ];
  for (const pad of nbPads) {
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.rotate(pad.rot);
    const padGrad = ctx.createRadialGradient(-2, -1, 1, 0, 0, pad.r);
    padGrad.addColorStop(0, '#6CA972');
    padGrad.addColorStop(1, '#3D784B');
    ctx.fillStyle = padGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, pad.r, pad.r * 0.68, 0, 0.25, Math.PI * 1.88);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (pad.flower) {
      ctx.save();
      ctx.translate(pad.x, pad.y - 2);
      for (let p = 0; p < 6; p++) {
        const ang = (p / 6) * Math.PI * 2;
        ctx.save();
        ctx.rotate(ang);
        ctx.fillStyle = p % 2 === 0 ? '#F294AA' : '#F8B0C2';
        ctx.beginPath();
        ctx.ellipse(0, -3.5, 2.2, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#F7CA5C';
      ctx.beginPath();
      ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Tiny wooden sampan boat (Con Đò Nhỏ) drifting gently
  const boatBob = Math.sin(sec * 1.7) * 1.4;
  ctx.save();
  ctx.translate(cx - 64, cy + 34 + boatBob);
  ctx.rotate(-0.18);
  ctx.fillStyle = 'rgba(10, 26, 28, 0.32)';
  ctx.beginPath();
  ctx.ellipse(1, 4, 13, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#73482C';
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.quadraticCurveTo(0, -5.5, 15, 0);
  ctx.quadraticCurveTo(4, 5.5, -14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#9C6945';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#C9A875';
  roundRect(ctx, -5, -4.5, 8.5, 4.5, 2);
  ctx.fill();
  ctx.restore();

  // Arched miniature stone bridge (Cầu Đá Cong) spanning front channel with crimson rails
  ctx.fillStyle = 'rgba(10, 28, 30, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 56, 26, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#CFC5B6';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 25, cy + 52);
  ctx.quadraticCurveTo(cx + 2, cy + 34, cx + 29, cy + 52);
  ctx.stroke();
  ctx.strokeStyle = '#A84434';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - 23, cy + 48);
  ctx.quadraticCurveTo(cx + 2, cy + 30, cx + 27, cy + 48);
  ctx.stroke();

  // Sculpted Multi-Tier Karst Limestone Range (Quần Sơn Tam Đỉnh) with faceted shading
  // Outer Left Ridge & Foothill
  ctx.fillStyle = '#535C57';
  ctx.beginPath();
  ctx.moveTo(cx - 82, cy + 16);
  ctx.lineTo(cx - 64, cy - 36);
  ctx.lineTo(cx - 48, cy - 64);
  ctx.lineTo(cx - 28, cy - 42);
  ctx.lineTo(cx - 14, cy + 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#737D76';
  ctx.beginPath();
  ctx.moveTo(cx - 64, cy - 36);
  ctx.lineTo(cx - 48, cy - 64);
  ctx.lineTo(cx - 43, cy - 16);
  ctx.closePath();
  ctx.fill();

  // Outer Right Ridge & Foothill
  ctx.fillStyle = '#505954';
  ctx.beginPath();
  ctx.moveTo(cx + 14, cy + 18);
  ctx.lineTo(cx + 38, cy - 70);
  ctx.lineTo(cx + 58, cy - 48);
  ctx.lineTo(cx + 80, cy + 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#757E77';
  ctx.beginPath();
  ctx.moveTo(cx + 38, cy - 70);
  ctx.lineTo(cx + 58, cy - 48);
  ctx.lineTo(cx + 48, cy + 8);
  ctx.closePath();
  ctx.fill();

  // Tall Central Limestone Spire with Lit Cliff Facet & Deep Shadow Facet
  const peakGrad = ctx.createLinearGradient(cx - 32, cy - 102, cx + 36, cy + 20);
  peakGrad.addColorStop(0, '#96A098');
  peakGrad.addColorStop(0.5, '#6C756F');
  peakGrad.addColorStop(1, '#474F4A');
  ctx.fillStyle = peakGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 46, cy + 22);
  ctx.lineTo(cx - 24, cy - 68);
  ctx.lineTo(cx - 4, cy - 104);
  ctx.lineTo(cx + 18, cy - 72);
  ctx.lineTo(cx + 46, cy + 22);
  ctx.closePath();
  ctx.fill();

  // Faceted granite cliff ridge lines
  ctx.strokeStyle = 'rgba(42, 48, 44, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 104);
  ctx.lineTo(cx - 9, cy - 52);
  ctx.lineTo(cx - 24, cy + 14);
  ctx.stroke();

  // Carved Stone Grotto Cavern (Thạch Động) with warm golden sanctuary glow inside
  ctx.fillStyle = '#252B28';
  ctx.beginPath();
  ctx.ellipse(cx - 18, cy + 10, 11, 13, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 208, 110, 0.55)';
  ctx.beginPath();
  ctx.arc(cx - 18, cy + 6, 4.2, 0, Math.PI * 2);
  ctx.fill();

  // Lush moss terraces & rockery fern tufts clinging to cliff shelves
  ctx.fillStyle = '#4C8446';
  [
    { x: cx - 50, y: cy - 46, rx: 12, ry: 5.5 },
    { x: cx - 6, y: cy - 66, rx: 14, ry: 6 },
    { x: cx + 38, y: cy - 52, rx: 12, ry: 5.5 },
    { x: cx + 26, y: cy - 8, rx: 13, ry: 6 },
    { x: cx - 58, y: cy + 8, rx: 11, ry: 5 },
  ].forEach((m) => {
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx, m.ry, 0.15, 0, Math.PI * 2);
    ctx.fill();
  });

  // Stepped 2-Tier Misty Waterfall (Thác Bạch Vân)
  ctx.strokeStyle = 'rgba(216, 250, 255, 0.88)';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(cx + 1, cy - 62);
  ctx.quadraticCurveTo(cx + 6, cy - 40, cx + 3, cy - 22);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232, 252, 255, 0.72)';
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy - 22, 8, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(216, 250, 255, 0.9)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx + 3, cy - 20);
  ctx.quadraticCurveTo(cx + 5, cy - 2, cx + 2, cy + 16);
  ctx.stroke();

  if (!lowResourceMode) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    const dropOffset = (sec * 44) % 18;
    for (let d = 0; d < 4; d++) {
      const dy = cy - 58 + ((d * 18 + dropOffset) % 70);
      ctx.beginPath();
      ctx.moveTo(cx + 2, dy);
      ctx.lineTo(cx + 3, dy + 8);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(242, 253, 255, 0.8)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 18, 13 + Math.sin(sec * 6) * 2.2, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Miniature 3-Tier Ancient Pagoda (Chùa Cổ 3 Tầng Mini) on West Peak Terrace
  const px = cx - 49;
  const py = cy - 48;
  for (let tier = 0; tier < 3; tier++) {
    const tw = 16 - tier * 3.5;
    const th = 7.5 - tier * 0.8;
    const ty = py - tier * 10.5;
    ctx.fillStyle = '#F3DFC4';
    ctx.fillRect(px - tw / 2, ty - th, tw, th);
    ctx.fillStyle = '#A63C32';
    ctx.beginPath();
    ctx.moveTo(px - tw * 0.82, ty - th + 1);
    ctx.lineTo(px, ty - th - 6.5);
    ctx.lineTo(px + tw * 0.82, ty - th + 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#EBB956';
  ctx.beginPath();
  ctx.arc(px, py - 38.5, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Miniature Hexagon Pavilion Gazebo (Đình Vọng Nguyệt) on lower-right islet
  const gx = cx + 62;
  const gy = cy + 6;
  ctx.fillStyle = '#8F3C30';
  ctx.fillRect(gx - 6, gy - 9, 2, 9);
  ctx.fillRect(gx + 4, gy - 9, 2, 9);
  ctx.fillStyle = '#A63C32';
  ctx.beginPath();
  ctx.moveTo(gx - 11, gy - 8);
  ctx.lineTo(gx, gy - 17);
  ctx.lineTo(gx + 11, gy - 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#EBB956';
  ctx.beginPath();
  ctx.arc(gx, gy - 18, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Miniature Sculpted Bonsai Pine (Cây Tùng La Hán) on East Shoulder
  const bx = cx + 48;
  const by = cy - 46;
  ctx.strokeStyle = '#5E3D28';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(bx - 2, by + 6);
  ctx.quadraticCurveTo(bx + 7, by - 4, bx - 4, by - 16);
  ctx.stroke();
  [
    { dx: 9, dy: -6, r: 8, c: '#356B3D' },
    { dx: -7, dy: -16, r: 9.5, c: '#44824B' },
    { dx: 2, dy: -24, r: 7.5, c: '#54995A' },
  ].forEach((p) => {
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.ellipse(bx + p.dx, by + p.dy, p.r, p.r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Tiny Meditating Monk & Pair of White Cranes near water's edge
  ctx.fillStyle = '#D98E4E';
  ctx.beginPath();
  ctx.arc(cx + 24, cy + 4, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F2C9A5';
  ctx.beginPath();
  ctx.arc(cx + 24, cy - 2, 2.8, 0, Math.PI * 2);
  ctx.fill();

  // Pair of miniature white cranes (Đôi Hạc Tiên) standing on left mossy rock
  for (const cr of [{ x: cx - 56, y: cy + 12 }, { x: cx - 49, y: cy + 15 }]) {
    ctx.fillStyle = '#F8F6EE';
    ctx.beginPath();
    ctx.ellipse(cr.x, cr.y - 4, 2.6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cr.x + 1.5, cr.y - 8, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two miniature glowing stone lanterns (Đèn Đá Lùn)
  for (const lt of [{ x: cx + 38, y: cy + 21 }, { x: cx - 34, y: cy + 20 }]) {
    ctx.fillStyle = '#8C847B';
    ctx.fillRect(lt.x - 3.5, lt.y - 7, 7, 7);
    ctx.fillStyle = '#FFE08A';
    ctx.fillRect(lt.x - 2.2, lt.y - 12, 4.4, 5);
    ctx.fillStyle = '#736C64';
    ctx.beginPath();
    ctx.moveTo(lt.x - 6.5, lt.y - 12);
    ctx.lineTo(lt.x, lt.y - 18);
    ctx.lineTo(lt.x + 6.5, lt.y - 12);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawPreceptsStele2D(ctx: CanvasRenderingContext2D, now: number, lowResourceMode: boolean) {
  const { x, y } = PRECEPTS_STELE_SPEC;
  ctx.save();

  // Ground drop shadow
  ctx.fillStyle = 'rgba(16, 22, 16, 0.28)';
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 10, 34, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stepped sandstone lotus plinth (Bệ đá tam cấp)
  ctx.fillStyle = '#8F8578';
  roundRect(ctx, x - 30, y - 4, 60, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#AAA092';
  roundRect(ctx, x - 24, y - 10, 48, 12, 3);
  ctx.fill();

  // Ornate stone tablet body & polished dark granite face
  ctx.fillStyle = '#9D9385';
  roundRect(ctx, x - 21, y - 58, 42, 49, 5);
  ctx.fill();
  ctx.strokeStyle = '#6E655A';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#252A2E';
  roundRect(ctx, x - 16, y - 53, 32, 40, 3);
  ctx.fill();
  ctx.strokeStyle = '#D99B52';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Engraved golden Vietnamese header & 5 golden lines on the tablet face
  ctx.fillStyle = '#F2C76E';
  ctx.font = '700 6.5px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NGŨ GIỚI', x, y - 46);

  ctx.fillStyle = 'rgba(242, 199, 110, 0.78)';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x - 11, y - 39 + i * 5.2, 22, 1.8);
  }

  // Curved terracotta stele pavilion roof cap & golden lotus finial
  ctx.fillStyle = '#A14034';
  ctx.beginPath();
  ctx.moveTo(x - 28, y - 57);
  ctx.quadraticCurveTo(x, y - 70, x + 28, y - 57);
  ctx.lineTo(x + 22, y - 54);
  ctx.lineTo(x - 22, y - 54);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#EBB956';
  ctx.beginPath();
  ctx.arc(x, y - 68, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Small bronze incense bowl in front of the stele
  ctx.fillStyle = '#9E733B';
  ctx.beginPath();
  ctx.ellipse(x, y + 7, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!lowResourceMode) {
    const glow = 0.65 + Math.sin(now * 0.005) * 0.2;
    ctx.fillStyle = `rgba(255, 165, 92, ${glow})`;
    ctx.beginPath();
    ctx.arc(x, y + 1, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBodhiTrunkAndBench(ctx: CanvasRenderingContext2D) {
  const tx = 285;
  const ty = 310;
  ctx.save();

  // Dappled ground shadow under broad Bodhi crown
  const shadowGrad = ctx.createRadialGradient(tx + 8, ty + 16, 16, tx + 10, ty + 18, 128);
  shadowGrad.addColorStop(0, 'rgba(18, 28, 14, 0.34)');
  shadowGrad.addColorStop(0.7, 'rgba(18, 28, 14, 0.16)');
  shadowGrad.addColorStop(1, 'rgba(18, 28, 14, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(tx + 10, ty + 18, 126, 68, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mossy soil mound & stone bench
  ctx.fillStyle = '#4B6B41';
  ctx.beginPath();
  ctx.ellipse(tx, ty + 10, 42, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  roundRect(ctx, 357, 333, 58, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#9E9286';
  roundRect(ctx, 355, 330, 58, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#C2B7AA';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Spreading gnarled surface roots
  ctx.strokeStyle = '#5F412F';
  ctx.lineCap = 'round';
  [
    [-8, 6, -34, 18],
    [10, 6, 36, 16],
    [-2, 10, -14, 24],
    [6, 10, 18, 23],
  ].forEach(([sx, sy, ex, ey]) => {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(tx + sx, ty + sy);
    ctx.quadraticCurveTo(tx + (sx + ex) * 0.5, ty + sy + 4, tx + ex, ty + ey);
    ctx.stroke();
  });

  // Main textured gnarled trunk & primary fork limbs
  const trunkGrad = ctx.createLinearGradient(tx - 24, ty, tx + 24, ty);
  trunkGrad.addColorStop(0, '#5A3D2C');
  trunkGrad.addColorStop(0.45, '#7D5740');
  trunkGrad.addColorStop(1, '#4C3325');
  ctx.fillStyle = trunkGrad;
  ctx.beginPath();
  ctx.moveTo(tx - 26, ty + 12);
  ctx.quadraticCurveTo(tx - 12, ty - 42, tx - 20, ty - 98);
  ctx.lineTo(tx - 45, ty - 122);
  ctx.lineTo(tx - 33, ty - 130);
  ctx.lineTo(tx - 4, ty - 102);
  ctx.lineTo(tx + 34, ty - 128);
  ctx.lineTo(tx + 46, ty - 118);
  ctx.lineTo(tx + 18, ty - 94);
  ctx.quadraticCurveTo(tx + 12, ty - 38, tx + 28, ty + 12);
  ctx.closePath();
  ctx.fill();

  // Vertical bark grain grooves
  ctx.strokeStyle = 'rgba(42, 26, 18, 0.45)';
  ctx.lineWidth = 1.6;
  [-11, -3, 5, 13].forEach((bx) => {
    ctx.beginPath();
    ctx.moveTo(tx + bx, ty + 6);
    ctx.quadraticCurveTo(tx + bx * 0.7, ty - 45, tx + bx * 0.9, ty - 88);
    ctx.stroke();
  });

  ctx.restore();
}

function drawBodhiCanopy(ctx: CanvasRenderingContext2D, now: number, lowResourceMode: boolean) {
  const tx = 285;
  const ty = 310;
  ctx.save();
  const sway = lowResourceMode ? 0 : Math.sin(now * 0.0012) * 3.5;

  // Deep under-canopy shade layer
  const deepFoliage = [
    { x: tx - 56 + sway * 0.6, y: ty - 108, rx: 62, ry: 48, c: '#3B633A' },
    { x: tx + 56 + sway * 0.6, y: ty - 106, rx: 64, ry: 50, c: '#3E693D' },
    { x: tx + sway * 0.6, y: ty - 134, rx: 72, ry: 54, c: '#447041' },
  ];
  for (const l of deepFoliage) {
    ctx.fillStyle = l.c;
    ctx.beginPath();
    ctx.ellipse(l.x, l.y, l.rx, l.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mid-tone natural foliage clusters
  const midFoliage = [
    { x: tx - 64 + sway, y: ty - 120, r: 44, c: '#4F824B' },
    { x: tx + 60 + sway, y: ty - 118, r: 46, c: '#578D50' },
    { x: tx - 22 + sway, y: ty - 148, r: 52, c: '#5B9254' },
    { x: tx + 26 + sway, y: ty - 144, r: 50, c: '#629A58' },
    { x: tx - 8 + sway, y: ty - 96, r: 44, c: '#51854D' },
  ];
  for (const c of midFoliage) {
    ctx.fillStyle = c.c;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sunlit crown highlights & individual heart-shaped Bodhi leaves
  const sunClusters = [
    { x: tx - 30 + sway * 1.15, y: ty - 158, r: 34, c: '#79B166' },
    { x: tx + 22 + sway * 1.15, y: ty - 152, r: 32, c: '#81BA6C' },
    { x: tx - 62 + sway * 1.1, y: ty - 130, r: 26, c: '#72AA60' },
    { x: tx + 54 + sway * 1.1, y: ty - 126, r: 28, c: '#75AD62' },
    { x: tx + sway * 1.15, y: ty - 122, r: 28, c: '#7DB568' },
  ];
  for (const c of sunClusters) {
    ctx.fillStyle = c.c;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!lowResourceMode) {
    // Crisp heart-shaped Bodhi leaf highlights around outer rim
    const leafSpots = [
      { dx: -88, dy: -116, rot: -0.7 },
      { dx: -52, dy: -175, rot: -0.3 },
      { dx: 18, dy: -186, rot: 0.2 },
      { dx: 82, dy: -140, rot: 0.6 },
      { dx: 92, dy: -98, rot: 0.9 },
      { dx: -28, dy: -82, rot: -0.5 },
    ];
    ctx.fillStyle = '#92C978';
    for (const lf of leafSpots) {
      ctx.save();
      ctx.translate(tx + lf.dx + sway * 1.2, ty + lf.dy);
      ctx.rotate(lf.rot);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-7, 2, -6, -6, 0, -4);
      ctx.bezierCurveTo(6, -6, 7, 2, 0, 6);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawWishingTreeTrunk(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  ctx.save();

  // Dappled ground shadow
  const shadowGrad = ctx.createRadialGradient(tx + 4, ty + 14, 14, tx + 6, ty + 16, 115);
  shadowGrad.addColorStop(0, 'rgba(20, 28, 16, 0.34)');
  shadowGrad.addColorStop(0.7, 'rgba(20, 28, 16, 0.16)');
  shadowGrad.addColorStop(1, 'rgba(20, 28, 16, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(tx + 6, ty + 16, 112, 58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Decorative carved stone ring curb around Wishing Tree
  ctx.fillStyle = '#8F8478';
  ctx.beginPath();
  ctx.ellipse(tx, ty + 8, 44, 21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C4B6A4';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#4B6B41';
  ctx.beginPath();
  ctx.ellipse(tx, ty + 6, 36, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Spreading gnarled roots
  ctx.strokeStyle = '#5D3C2B';
  ctx.lineCap = 'round';
  [
    [-8, 4, -28, 12],
    [10, 4, 29, 11],
    [-2, 8, -12, 16],
    [5, 8, 14, 15],
  ].forEach(([sx, sy, ex, ey]) => {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tx + sx, ty + sy);
    ctx.quadraticCurveTo(tx + (sx + ex) * 0.5, ty + sy + 3, tx + ex, ty + ey);
    ctx.stroke();
  });

  // Main gnarled wishing tree trunk & spreading boughs
  const trunkGrad = ctx.createLinearGradient(tx - 20, ty, tx + 20, ty);
  trunkGrad.addColorStop(0, '#583A29');
  trunkGrad.addColorStop(0.45, '#7E563F');
  trunkGrad.addColorStop(1, '#4A3122');
  ctx.fillStyle = trunkGrad;
  ctx.beginPath();
  ctx.moveTo(tx - 22, ty + 8);
  ctx.quadraticCurveTo(tx - 11, ty - 38, tx - 16, ty - 88);
  ctx.lineTo(tx - 48, ty - 114);
  ctx.lineTo(tx - 38, ty - 122);
  ctx.lineTo(tx - 4, ty - 94);
  ctx.lineTo(tx + 38, ty - 120);
  ctx.lineTo(tx + 48, ty - 110);
  ctx.lineTo(tx + 15, ty - 86);
  ctx.quadraticCurveTo(tx + 11, ty - 35, tx + 22, ty + 8);
  ctx.closePath();
  ctx.fill();

  // Crimson silk wrap & gold tassel tied around the trunk
  ctx.fillStyle = '#C93632';
  roundRect(ctx, tx - 14, ty - 34, 28, 9, 3);
  ctx.fill();
  ctx.strokeStyle = '#F2C15A';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Wooden signboard beside tree
  ctx.fillStyle = '#5E3D2B';
  ctx.fillRect(tx + 48, ty + 2, 4, 20);
  roundRect(ctx, tx + 20, ty - 14, 60, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 8.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NGUYỆN ƯỚC', tx + 50, ty - 5);

  ctx.restore();
}

function drawWishingTreeCanopyAndRibbons(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  wishes: TreeWishState[],
  effects: VisualEffect[],
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();
  const sway = lowResourceMode ? 0 : Math.sin(now * 0.0014 + 1.2) * 3.2;

  // Deep under-canopy warm-green & blossom clusters
  const deepBlossoms = [
    { x: tx - 52 + sway * 0.6, y: ty - 102, rx: 56, ry: 42, c: '#3D6840' },
    { x: tx + 52 + sway * 0.6, y: ty - 100, rx: 56, ry: 44, c: '#416D43' },
    { x: tx + sway * 0.6, y: ty - 126, rx: 66, ry: 48, c: '#487648' },
  ];
  for (const b of deepBlossoms) {
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sunlit foliage & soft pink-peach wishing tree blossoms
  const midCrown = [
    { x: tx - 56 + sway, y: ty - 114, r: 40, c: '#548A50' },
    { x: tx + 54 + sway, y: ty - 112, r: 42, c: '#5C9356' },
    { x: tx - 18 + sway, y: ty - 140, r: 46, c: '#669E5D' },
    { x: tx + 24 + sway, y: ty - 136, r: 44, c: '#6DA663' },
    { x: tx - 4 + sway, y: ty - 92, r: 38, c: '#5A8F53' },
  ];
  for (const c of midCrown) {
    ctx.fillStyle = c.c;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft sakura/peach blossom puffs dotted on upper boughs
  const flowerPuffs = [
    { x: tx - 38 + sway * 1.1, y: ty - 126, r: 16, c: '#F5A3B5' },
    { x: tx + 34 + sway * 1.1, y: ty - 122, r: 18, c: '#F7B4C3' },
    { x: tx + 4 + sway * 1.1, y: ty - 154, r: 19, c: '#F9C4D0' },
    { x: tx - 58 + sway * 1.1, y: ty - 102, r: 14, c: '#F39CB0' },
    { x: tx + 58 + sway * 1.1, y: ty - 98, r: 15, c: '#F5A8BA' },
  ];
  for (const fp of flowerPuffs) {
    ctx.fillStyle = fp.c;
    ctx.beginPath();
    ctx.arc(fp.x, fp.y, fp.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hanging red wish ribbons (combine built-in baseline + live Firestore wishes)
  const ribbonAnchors = [
    { dx: -68, dy: -82 },
    { dx: -50, dy: -70 },
    { dx: -34, dy: -90 },
    { dx: -16, dy: -74 },
    { dx: 8, dy: -84 },
    { dx: 26, dy: -72 },
    { dx: 44, dy: -88 },
    { dx: 64, dy: -78 },
    { dx: -62, dy: -112 },
    { dx: -24, dy: -118 },
    { dx: 20, dy: -116 },
    { dx: 54, dy: -108 },
    { dx: -42, dy: -134 },
    { dx: -6, dy: -138 },
    { dx: 36, dy: -132 },
    { dx: 0, dy: -102 },
  ];
  const visibleCount = Math.min(ribbonAnchors.length, Math.max(4, wishes.length + 3));
  for (let i = 0; i < visibleCount; i++) {
    const anc = ribbonAnchors[i];
    const seed = wishes[i]?.seed ?? i * 17;
    const flutter = lowResourceMode ? 0 : Math.sin(now * 0.004 + seed) * 4.5;
    const rx = tx + anc.dx + sway * 1.1;
    const ry = ty + anc.dy;

    // Red silk ribbon tails
    ctx.strokeStyle = i < wishes.length ? '#E03E36' : '#C93832';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.quadraticCurveTo(rx + flutter * 0.5, ry + 11, rx + flutter, ry + 22);
    ctx.stroke();

    // Small gold wooden wish charm / knot at top
    ctx.fillStyle = '#F4C65C';
    ctx.beginPath();
    ctx.arc(rx, ry, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Active tossed red wish ribbon arc animation
  const wishEf = effects.find((e) => e.kind === 'wish' && now - e.createdAt < 1800);
  if (wishEf) {
    const age = (now - wishEf.createdAt) / 1000;
    const t = Math.min(1, age / 1.1);
    const sx = tx;
    const sy = ty + 48;
    const ex = tx + 18;
    const ey = ty - 95;
    const arcLift = Math.sin(t * Math.PI) * 58;
    const px = sx + (ex - sx) * t;
    const py = sy + (ey - sy) * t - arcLift;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(t * 7);
    ctx.strokeStyle = '#EB4034';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.quadraticCurveTo(0, -6, 12, 3);
    ctx.stroke();
    ctx.fillStyle = '#F7CA5C';
    ctx.beginPath();
    ctx.arc(0, -1, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawStoneLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();
  const glowPulse = lowResourceMode ? 0.18 : 0.18 + Math.sin(now * 0.004 + x) * 0.04;
  const glow = ctx.createRadialGradient(x, y - 16, 4, x, y - 16, 62);
  glow.addColorStop(0, `rgba(255, 214, 132, ${glowPulse})`);
  glow.addColorStop(1, 'rgba(255, 214, 132, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 16, 62, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 6, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8F857B';
  roundRect(ctx, x - 11, y - 6, 22, 12, 3);
  ctx.fill();
  ctx.fillRect(x - 4, y - 22, 8, 18);

  ctx.fillStyle = '#FFE08E';
  ctx.fillRect(x - 6, y - 32, 12, 10);
  ctx.strokeStyle = '#6B6259';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x - 6, y - 32, 12, 10);

  ctx.fillStyle = '#A69A8E';
  ctx.beginPath();
  ctx.moveTo(x - 15, y - 32);
  ctx.lineTo(x, y - 45);
  ctx.lineTo(x + 15, y - 32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#C2B6AA';
  ctx.beginPath();
  ctx.arc(x, y - 46, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPathLanternPost2D(
  ctx: CanvasRenderingContext2D,
  post: PathLanternPostSpec,
  now: number,
  lowResourceMode: boolean
) {
  const { x, y, armDir } = post;
  const armDx = Math.cos(armDir) * 14;
  const armDy = Math.sin(armDir) * 7;
  const sway = lowResourceMode ? 0 : Math.sin(now * 0.0024 + x * 0.04 + y * 0.03) * 1.6;
  const lx = x + armDx + sway;
  const ly = y - 40 + armDy;

  ctx.save();

  // Warm ambient amber glow pool on ground & lantern aura
  const pulse = lowResourceMode ? 0.24 : 0.24 + Math.sin(now * 0.0038 + x) * 0.04;
  const groundGlow = ctx.createRadialGradient(x + armDx * 0.7, y + 2, 2, x + armDx * 0.7, y + 2, 34);
  groundGlow.addColorStop(0, `rgba(255, 194, 102, ${pulse * 0.65})`);
  groundGlow.addColorStop(1, 'rgba(255, 170, 72, 0)');
  ctx.fillStyle = groundGlow;
  ctx.beginPath();
  ctx.ellipse(x + armDx * 0.7, y + 2, 34, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  const aura = ctx.createRadialGradient(lx, ly + 8, 3, lx, ly + 8, 42);
  aura.addColorStop(0, `rgba(255, 210, 120, ${pulse})`);
  aura.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(lx, ly + 8, 42, 0, Math.PI * 2);
  ctx.fill();

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 8, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stone base plinth & lacquered wooden post
  ctx.fillStyle = '#8F857B';
  roundRect(ctx, x - 6.5, y - 4, 13, 8, 2);
  ctx.fill();

  ctx.fillStyle = '#523322';
  ctx.fillRect(x - 2.4, y - 50, 4.8, 48);
  ctx.fillStyle = '#734B33';
  ctx.fillRect(x - 1, y - 49, 1.8, 46);

  // Curved overhanging wooden bracket arm
  ctx.strokeStyle = '#5B3926';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - 46);
  ctx.quadraticCurveTo(x + armDx * 0.55, y - 52 + armDy * 0.4, x + armDx, y - 48 + armDy);
  ctx.stroke();

  // Diagonal brace
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x, y - 39);
  ctx.lineTo(x + armDx * 0.58, y - 48 + armDy * 0.5);
  ctx.stroke();

  // Hanging cord
  ctx.strokeStyle = '#D9B15F';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + armDx, y - 48 + armDy);
  ctx.lineTo(lx, ly);
  ctx.stroke();

  // Crimson-amber glowing silk lantern body
  const silkGrad = ctx.createRadialGradient(lx - 1.5, ly + 7, 1.5, lx, ly + 8, 9);
  silkGrad.addColorStop(0, '#FFF1B8');
  silkGrad.addColorStop(0.55, '#F59342');
  silkGrad.addColorStop(1, '#C43C29');
  ctx.fillStyle = silkGrad;
  ctx.beginPath();
  ctx.ellipse(lx, ly + 8, 6.2, 8.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Delicate ribs & gold top/bottom collars
  ctx.strokeStyle = 'rgba(130, 32, 18, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(lx, ly + 8, 3.2, 8.1, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#E6B85C';
  roundRect(ctx, lx - 4, ly - 1, 8, 2.6, 1);
  ctx.fill();
  roundRect(ctx, lx - 3.6, ly + 15.2, 7.2, 2.4, 1);
  ctx.fill();

  // Hanging gold/crimson silk tassel
  ctx.strokeStyle = '#D84734';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(lx, ly + 17.6);
  ctx.lineTo(lx + sway * 0.4, ly + 23.5);
  ctx.stroke();

  ctx.restore();
}

function drawArhatStatue2D(
  ctx: CanvasRenderingContext2D,
  arhat: CourtyardArhatSpec,
  now: number,
  lowResourceMode: boolean
) {
  const { x, y, facing, artVariant } = arhat;
  const img = getCourtyardStatueImage(artVariant);

  ctx.save();
  ctx.translate(x, y);

  // Soft ground drop shadow directly beneath the statue's lotus base
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 17, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Gentle warm golden aura behind the statue
  if (!lowResourceMode) {
    const auraAlpha = 0.2 + Math.sin(now * 0.002 + y * 0.03) * 0.05;
    const aura = ctx.createRadialGradient(0, -34, 4, 0, -34, 30);
    aura.addColorStop(0, `rgba(255, 224, 145, ${auraAlpha})`);
    aura.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -34, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  if (img) {
    const targetH = 74;
    const targetW = targetH * (img.naturalWidth / img.naturalHeight);
    ctx.save();
    if (facing === 'left') {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, -targetW / 2, -targetH + 8, targetW, targetH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#D7BC93';
    ctx.beginPath();
    ctx.arc(0, -34, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSanctuaryGuardian2D(
  ctx: CanvasRenderingContext2D,
  guardian: SanctuaryGuardianSpec,
  now: number,
  lowResourceMode: boolean
) {
  const { x, y, artVariant } = guardian;
  const img = getCourtyardStatueImage(artVariant);

  ctx.save();
  ctx.translate(x, y);

  // Drop shadow beneath the guardian's octagonal lotus base
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 22, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle golden guardian glow
  if (!lowResourceMode) {
    const auraAlpha = 0.24 + Math.sin(now * 0.0024 + x * 0.02) * 0.06;
    const aura = ctx.createRadialGradient(0, -44, 6, 0, -44, 40);
    aura.addColorStop(0, `rgba(255, 218, 128, ${auraAlpha})`);
    aura.addColorStop(1, 'rgba(255, 190, 90, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -44, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  if (img) {
    const targetH = 92;
    const targetW = targetH * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, -targetW / 2, -targetH + 10, targetW, targetH);
  } else {
    ctx.fillStyle = '#E8B86A';
    ctx.beginPath();
    ctx.arc(0, -44, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBambooCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stalks: number,
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();
  const baseSway = lowResourceMode ? 0 : Math.sin(now * 0.0014 + x * 0.02) * 3;

  // Soft forest-floor shadow under bamboo cluster
  ctx.fillStyle = 'rgba(18, 32, 18, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 4, stalks * 7.5, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < stalks; i++) {
    const ox = (i - (stalks - 1) / 2) * 12;
    const oy = ((i * 7) % 9) - 4;
    const lean = ((i % 3) - 1) * 6;
    const h = 72 + (i % 3) * 16;
    const sx = x + ox;
    const sy = y + oy;
    const topX = sx + lean + baseSway * (0.8 + (i % 2) * 0.35);
    const topY = sy - h;

    // Culm stalk gradient
    ctx.strokeStyle = i % 2 === 0 ? '#5D8C53' : '#73A463';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + (lean + baseSway) * 0.4, sy - h * 0.55, topX, topY);
    ctx.stroke();

    // Internode rings
    ctx.strokeStyle = '#3C6136';
    ctx.lineWidth = 1.4;
    for (let seg = 1; seg <= 4; seg++) {
      const t = seg / 5;
      const nx = sx * (1 - t) + topX * t + (lean + baseSway) * 0.08 * Math.sin(t * Math.PI);
      const ny = sy - h * t;
      ctx.beginPath();
      ctx.moveTo(nx - 3, ny);
      ctx.lineTo(nx + 3, ny);
      ctx.stroke();
    }

    // Slender pointed bamboo leaf sprays near upper nodes & crown
    const sprayAnchors = [
      { x: topX, y: topY, dir: i % 2 === 0 ? 1 : -1 },
      { x: (sx + topX) * 0.5 + topX * 0.5 - sx * 0.5 + sx * 0.5, y: sy - h * 0.68, dir: i % 2 === 0 ? -1 : 1 },
    ];
    for (const sp of sprayAnchors) {
      for (let lf = -1; lf <= 1; lf++) {
        const ang = sp.dir * (0.45 + lf * 0.35) + baseSway * 0.02;
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(ang);
        ctx.fillStyle = lf === 0 ? '#84B770' : '#6B9C5D';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(9, -3.2, 18, 0);
        ctx.quadraticCurveTo(9, 3.2, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

function drawBell(ctx: CanvasRenderingContext2D, x: number, y: number, ringAgeSec: number | null) {
  ctx.save();
  ctx.fillStyle = '#5A3727';
  ctx.fillRect(x - 28, y - 36, 6, 56);
  ctx.fillRect(x + 22, y - 36, 6, 56);
  ctx.fillRect(x - 34, y - 40, 68, 8);

  const swing =
    ringAgeSec !== null ? Math.sin(ringAgeSec * 14) * Math.exp(-ringAgeSec * 1.6) * 0.16 : 0;
  ctx.translate(x, y - 32);
  ctx.rotate(swing);

  ctx.fillStyle = '#B88948';
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.quadraticCurveTo(-16, 22, -20, 34);
  ctx.lineTo(20, 34);
  ctx.quadraticCurveTo(16, 22, 14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#E3B978';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawWoodfish(ctx: CanvasRenderingContext2D, x: number, y: number, tapAgeSec: number | null) {
  ctx.save();
  ctx.fillStyle = '#7C3E2D';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 22, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  const bounce =
    tapAgeSec !== null ? -Math.abs(Math.sin(tapAgeSec * 18)) * 5 * (1 - tapAgeSec / 0.6) : 0;
  ctx.fillStyle = '#9C5E36';
  ctx.beginPath();
  ctx.ellipse(x, y + bounce, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#D69F66';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = '#381F12';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 3 + bounce);
  ctx.lineTo(x + 12, y + 3 + bounce);
  ctx.stroke();
  ctx.restore();
}

function drawIncenseBurner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  incenseCount: number,
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 34, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#574E47';
  roundRect(ctx, x - 30, y + 6, 60, 16, 4);
  ctx.fill();

  ctx.fillStyle = '#A87C44';
  ctx.beginPath();
  ctx.ellipse(x, y, 26, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#DFB676';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#7E766E';
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 19, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const sticksToDraw = Math.min(9, Math.max(1, incenseCount));
  for (let i = 0; i < sticksToDraw; i++) {
    const offsetX = (i - (sticksToDraw - 1) / 2) * 3.5;
    ctx.strokeStyle = '#B86942';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + offsetX, y - 4);
    ctx.lineTo(x + offsetX * 1.15, y - 24);
    ctx.stroke();

    ctx.fillStyle = '#FF7A45';
    ctx.beginPath();
    ctx.arc(x + offsetX * 1.15, y - 25, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!lowResourceMode && incenseCount > 0) {
    for (let s = 0; s < 3; s++) {
      const t = ((now * 0.001 + s * 0.9) % 2.7) / 2.7;
      const sx = x + Math.sin(t * 5 + s) * 8;
      const sy = y - 28 - t * 44;
      ctx.fillStyle = `rgba(235, 228, 218, ${(1 - t) * 0.25})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + t * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFortuneBox(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 24, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#5E3D2B';
  roundRect(ctx, x - 20, y - 2, 40, 22, 4);
  ctx.fill();

  ctx.fillStyle = '#C99E5A';
  roundRect(ctx, x - 9, y - 26, 18, 26, 4);
  ctx.fill();
  ctx.strokeStyle = '#6B4E24';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = '#E8CE9B';
  ctx.lineWidth = 2;
  [-4, 0, 4].forEach((ox, idx) => {
    ctx.beginPath();
    ctx.moveTo(x + ox, y - 25);
    ctx.lineTo(x + ox * 1.4, y - 36 - (idx % 2) * 3);
    ctx.stroke();
  });
  ctx.restore();
}

function drawLeafSweepingSpot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sweepAgeSec: number | null,
  lowResourceMode: boolean
) {
  ctx.save();

  // Warm fallen Bodhi leaves around the clearing
  const fallenLeaves = [
    { dx: -22, dy: 4, rot: 0.4, c: '#D6A149' },
    { dx: -10, dy: 11, rot: -0.5, c: '#C48A3B' },
    { dx: 14, dy: 9, rot: 0.8, c: '#E0B25A' },
    { dx: 24, dy: -2, rot: -0.2, c: '#C99040' },
    { dx: -4, dy: -6, rot: 1.1, c: '#DDA850' },
    { dx: 6, dy: 14, rot: -0.8, c: '#B97E34' },
  ];

  const isSweeping = sweepAgeSec !== null && sweepAgeSec < 2.2;
  const scatter = isSweeping ? Math.min(1, sweepAgeSec / 1.4) : 0;

  for (let i = 0; i < fallenLeaves.length; i++) {
    const lf = fallenLeaves[i];
    const lift = isSweeping && !lowResourceMode ? Math.sin(sweepAgeSec * 5 + i) * 6 : 0;
    const lx = x + lf.dx * (1 - scatter * 0.45) + (isSweeping ? Math.cos(i * 1.3 + sweepAgeSec * 4) * 8 : 0);
    const ly = y + lf.dy * (1 - scatter * 0.45) - Math.abs(lift) - scatter * 6;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(lf.rot + (isSweeping ? sweepAgeSec * 3 : 0));
    ctx.globalAlpha = isSweeping ? Math.max(0.25, 1 - scatter * 0.6) : 0.92;
    ctx.fillStyle = lf.c;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Soft shadow under bamboo broom
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 10, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Animated bamboo broom
  const broomSwing = isSweeping ? Math.sin(sweepAgeSec * 11) * 0.42 : 0.22;
  ctx.save();
  ctx.translate(x + (isSweeping ? Math.sin(sweepAgeSec * 7) * 14 : 0), y + 4);
  ctx.rotate(broomSwing);

  // Bamboo handle
  ctx.strokeStyle = '#9C7343';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(0, 2);
  ctx.stroke();

  // Bristle fan
  ctx.fillStyle = '#D9B66C';
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(3, 0);
  ctx.lineTo(11, 14);
  ctx.lineTo(-11, 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8C5E32';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Binding band
  ctx.strokeStyle = '#A84A38';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, 3);
  ctx.lineTo(4, 3);
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

function drawFishReleasePier(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fishAgeSec: number | null,
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();

  // Wooden lakeside step/pier extending slightly toward the lotus pond
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  roundRect(ctx, x - 26, y - 10, 50, 30, 5);
  ctx.fill();

  ctx.fillStyle = '#8C523B';
  roundRect(ctx, x - 24, y - 14, 48, 28, 5);
  ctx.fill();
  ctx.strokeStyle = '#B87B5B';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Wooden tub / basin for releasing fish
  ctx.fillStyle = '#73412D';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 16, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3C7E84';
  ctx.beginPath();
  ctx.ellipse(x, y - 3, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#D49E66';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Tiny realistic koi visible inside the wooden basin
  const wiggle = lowResourceMode ? 0 : Math.sin(now * 0.005) * 0.35;
  drawRealisticKoiFish(ctx, x - 4, y - 3, 0.25 + wiggle, 0.45, now * 0.015, '#FAF3E6', '#EB733B', 0.95, false);
  drawRealisticKoiFish(ctx, x + 5, y - 2, -2.5 - wiggle, 0.4, now * 0.014 + 2, '#F4BD50', '#D9642B', 0.95, false);

  // Celebratory articulated koi leaping/swimming from tub into Ao Sen when triggered
  if (fishAgeSec !== null && fishAgeSec < 3.0) {
    const t = Math.min(1, fishAgeSec / 1.8);
    const koiSpecs = [
      { delay: 0, dx: -72, dy: -36, base: '#FAF4EA', spot: '#E6673A' },
      { delay: 0.18, dx: -95, dy: -16, base: '#F4B647', spot: '#D96C2B' },
      { delay: 0.34, dx: -58, dy: -54, base: '#E97046', spot: '#2E2826' },
    ];
    for (let idx = 0; idx < koiSpecs.length; idx++) {
      const k = koiSpecs[idx];
      const kt = Math.max(0, Math.min(1, (fishAgeSec - k.delay) / 1.3));
      if (kt <= 0) continue;
      const arc = Math.sin(kt * Math.PI) * 26;
      const fx = x - 8 + k.dx * kt;
      const fy = y - 6 + k.dy * kt - arc;
      const heading = Math.atan2(k.dy - Math.cos(kt * Math.PI) * 45, k.dx);
      const alpha = fishAgeSec > 2.2 ? Math.max(0, (3.0 - fishAgeSec) / 0.8) : 0.96;

      drawRealisticKoiFish(ctx, fx, fy, heading, 0.82, now * 0.02 + idx, k.base, k.spot, alpha, false);

      // Water splash ring on landing
      if (kt > 0.65) {
        const ringT = (kt - 0.65) / 0.35;
        ctx.save();
        ctx.strokeStyle = `rgba(182, 245, 245, ${1 - ringT})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(x - 8 + k.dx, y - 6 + k.dy, 6 + ringT * 18, 3 + ringT * 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (t < 1 && !lowResourceMode) {
      ctx.strokeStyle = `rgba(210, 248, 248, ${(1 - t) * 0.5})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x - 60, y - 28, 12 + t * 26, 6 + t * 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawFlowerGarden(
  ctx: CanvasRenderingContext2D,
  plots: GardenPlotState[],
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();

  // Garden wooden frame & fertile border (x: 452..796, y: 922..1074)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  roundRect(ctx, 454, 926, 344, 152, 12);
  ctx.fill();

  ctx.fillStyle = '#79563E';
  roundRect(ctx, 450, 922, 344, 152, 12);
  ctx.fill();
  ctx.strokeStyle = '#A87D5C';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#5B7847';
  roundRect(ctx, 458, 930, 328, 136, 8);
  ctx.fill();

  // Stone water jar & wooden garden plaque on east edge (768, 1000)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(768, 1014, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6D5242';
  ctx.beginPath();
  ctx.ellipse(768, 1002, 15, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C99E67';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#4C9096';
  ctx.beginPath();
  ctx.ellipse(768, 996, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wooden garden sign post
  ctx.fillStyle = '#5E3D2B';
  ctx.fillRect(765, 956, 6, 26);
  roundRect(ctx, 738, 938, 60, 20, 4);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#FBF0D4';
  ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VƯỜN HOA', 768, 948);

  // 6 Individual Raised Garden Beds
  for (const pos of GARDEN_PLOT_POSITIONS) {
    const plot = plots.find((p) => p.plotIndex === pos.index);
    const px = pos.x;
    const py = pos.y;

    // Wooden bed edging + dark soil
    ctx.fillStyle = '#8B5D3E';
    roundRect(ctx, px - 30, py - 20, 60, 40, 6);
    ctx.fill();
    ctx.strokeStyle = '#BA8763';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#4B3427';
    roundRect(ctx, px - 25, py - 15, 50, 30, 4);
    ctx.fill();

    // Soil furrows
    ctx.strokeStyle = 'rgba(30, 18, 12, 0.45)';
    ctx.lineWidth = 1.2;
    for (let fy = py - 7; fy <= py + 7; fy += 7) {
      ctx.beginPath();
      ctx.moveTo(px - 20, fy);
      ctx.lineTo(px + 20, fy);
      ctx.stroke();
    }

    const effectiveStage = plot ? getEffectiveFlowerStage(plot, Date.now()) : 0;
    if (!plot || plot.species === 'none' || effectiveStage === 0) {
      // Subtle planted-ready indicator dot
      ctx.fillStyle = 'rgba(229, 184, 105, 0.35)';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const catalog = FLOWER_CATALOG.find((f) => f.id === plot.species) || FLOWER_CATALOG[0];
    const sway = lowResourceMode ? 0 : Math.sin(now * 0.002 + pos.index * 1.1) * 1.6;

    if (effectiveStage === 1) {
      // Stage 1: Tender green sprout
      ctx.strokeStyle = '#74B865';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(px, py + 4);
      ctx.quadraticCurveTo(px + sway * 0.5, py - 5, px + sway, py - 11);
      ctx.stroke();

      ctx.fillStyle = '#8CD475';
      ctx.beginPath();
      ctx.ellipse(px - 5 + sway, py - 10, 5.5, 2.8, -0.45, 0, Math.PI * 2);
      ctx.ellipse(px + 5 + sway, py - 10, 5.5, 2.8, 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (effectiveStage === 2) {
      // Stage 2: Leafy bush with rising flower buds
      for (const ox of [-9, 0, 9]) {
        ctx.strokeStyle = '#5D9B52';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + ox * 0.5, py + 5);
        ctx.lineTo(px + ox + sway, py - 14);
        ctx.stroke();

        ctx.fillStyle = '#74B865';
        ctx.beginPath();
        ctx.ellipse(px + ox - 4 + sway, py - 5, 5, 2.8, -0.4, 0, Math.PI * 2);
        ctx.ellipse(px + ox + 4 + sway, py - 7, 5, 2.8, 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Unopened colored bud
        ctx.fillStyle = catalog.petalColor;
        ctx.beginPath();
        ctx.arc(px + ox + sway, py - 15, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Stage 3: Full vibrant blooms ready to offer to Buddha!
      if (!lowResourceMode) {
        ctx.fillStyle = 'rgba(255, 232, 168, 0.16)';
        ctx.beginPath();
        ctx.arc(px, py - 12, 24, 0, Math.PI * 2);
        ctx.fill();
      }
      const stems = [
        { ox: -11, dy: -14, r: 6.2 },
        { ox: 11, dy: -13, r: 6.0 },
        { ox: 0, dy: -20, r: 7.4 },
      ];
      for (const st of stems) {
        ctx.strokeStyle = '#53944B';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(px + st.ox * 0.4, py + 6);
        ctx.lineTo(px + st.ox + sway, py + st.dy);
        ctx.stroke();

        ctx.fillStyle = '#6FB562';
        ctx.beginPath();
        ctx.ellipse(px + st.ox * 0.7, py - 2, 6, 3, st.ox < 0 ? -0.5 : 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Petals
        const fx = px + st.ox + sway;
        const fy = py + st.dy;
        for (let p = 0; p < 6; p++) {
          const ang = (p / 6) * Math.PI * 2 + now * 0.0002;
          ctx.fillStyle = p % 2 === 0 ? catalog.petalColor : catalog.accentColor;
          ctx.beginPath();
          ctx.ellipse(
            fx + Math.cos(ang) * st.r * 0.55,
            fy + Math.sin(ang) * st.r * 0.55,
            st.r * 0.46,
            st.r * 0.36,
            ang,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.fillStyle = '#F7C948';
        ctx.beginPath();
        ctx.arc(fx, fy, st.r * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!lowResourceMode) {
        // Gentle golden sparkle above full-bloom flowers
        const bAngle = now * 0.003 + pos.index * 2;
        const bx = px + Math.cos(bAngle) * 14;
        const by = py - 28 + Math.sin(bAngle * 2) * 4;
        ctx.fillStyle = '#FFE89E';
        ctx.beginPath();
        ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

function drawLanternTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, x - 18, y - 8, 36, 20, 4);
  ctx.fill();

  ctx.fillStyle = '#6A3F2B';
  roundRect(ctx, x - 18, y - 12, 36, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#C99E5A';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (!lowResourceMode) {
    const glow = ctx.createRadialGradient(x, y - 12, 2, x, y - 12, 26);
    glow.addColorStop(0, 'rgba(255, 212, 118, 0.38)');
    glow.addColorStop(1, 'rgba(255, 212, 118, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - 12, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two display lanterns ready to release
  [-7, 7].forEach((ox, idx) => {
    ctx.fillStyle = idx === 0 ? '#EB82A0' : '#F3B44C';
    ctx.beginPath();
    ctx.arc(x + ox, y - 8, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF0B0';
    ctx.beginPath();
    ctx.arc(x + ox, y - 8, 2.4 + (lowResourceMode ? 0 : Math.sin(now * 0.01 + idx) * 0.4), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawKoiFeedJar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isFeeding: boolean
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 8, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ceramic koi food jar
  ctx.fillStyle = '#9E5C3E';
  ctx.beginPath();
  ctx.ellipse(x, y, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#E5B869';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Golden pellets inside jar
  ctx.fillStyle = isFeeding ? '#FFE182' : '#D9A74E';
  ctx.beginPath();
  ctx.ellipse(x, y - 3, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayerCharacter(
  ctx: CanvasRenderingContext2D,
  player: RoomPlayer,
  pos: RenderPos,
  isSelf: boolean,
  now: number,
  performingAction: RitualAction | null,
  elev3D = 0
) {
  const char = CHARACTERS.find((c) => c.id === player.characterId) || CHARACTERS[0];
  const isWalking = pos.pose === 'walk';
  const isMeditating = pos.pose === 'meditate';
  const isSitting = pos.pose === 'sit';
  const isPraying = pos.pose === 'pray';
  const stride = isWalking ? Math.sin(now * 0.015) : 0;
  const bob = isWalking ? Math.abs(stride) * 2.8 : isPraying ? Math.sin(now * 0.01) * 1.4 : 0;
  const visualLift = Math.min(26, elev3D * 1.35);

  ctx.save();
  ctx.translate(pos.x, pos.y - visualLift);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 14 + visualLift * 0.15, isMeditating || isSitting ? 17 : 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isSelf) {
    ctx.strokeStyle = isPraying ? 'rgba(247, 210, 136, 0.92)' : 'rgba(217, 155, 82, 0.72)';
    ctx.lineWidth = isPraying ? 2 : 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 14, 19, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const yOffset = isMeditating
    ? 5 - Math.sin(now * 0.002) * 1
    : isSitting
    ? 4 - Math.sin(now * 0.0018) * 0.6
    : -bob;

  if (!isMeditating) {
    ctx.fillStyle = '#2B211B';
    ctx.beginPath();
    ctx.ellipse(-4.5, (isSitting ? 11 : 12) + stride * 2.2, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(4.5, (isSitting ? 11 : 12) - stride * 2.2, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = char.robePrimary;
  if (isMeditating) {
    ctx.beginPath();
    ctx.ellipse(0, 5 + yOffset, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (isSitting) {
    roundRect(ctx, -12, -10 + yOffset, 24, 19, 8);
    ctx.fill();
  } else {
    roundRect(ctx, -11, -12 + yOffset, 22, 24, 8);
    ctx.fill();
  }

  if (pos.direction !== 'up') {
    ctx.strokeStyle = char.accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -10 + yOffset);
    ctx.lineTo(0, -1 + yOffset);
    ctx.lineTo(6, -10 + yOffset);
    ctx.stroke();
  }

  ctx.fillStyle = char.skinTone;
  ctx.beginPath();
  ctx.arc(0, -21 + yOffset, 10, 0, Math.PI * 2);
  ctx.fill();

  if (char.hairStyle !== 'shaved') {
    ctx.fillStyle = '#211A17';
    ctx.beginPath();
    if (pos.direction === 'up') {
      ctx.arc(0, -21 + yOffset, 10.4, 0, Math.PI * 2);
    } else {
      ctx.arc(0, -23 + yOffset, 10.3, Math.PI * 0.95, Math.PI * 2.05);
    }
    ctx.fill();
    if (char.hairStyle === 'bun') {
      ctx.beginPath();
      ctx.arc(0, -33 + yOffset, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (pos.direction !== 'up') {
    ctx.fillStyle = '#2B201B';
    if (isMeditating || isPraying) {
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = '#2B201B';
      ctx.beginPath();
      ctx.moveTo(-5, -20 + yOffset);
      ctx.lineTo(-2, -20 + yOffset);
      ctx.moveTo(2, -20 + yOffset);
      ctx.lineTo(5, -20 + yOffset);
      ctx.stroke();
    } else {
      const lookX = pos.direction === 'left' ? -2 : pos.direction === 'right' ? 2 : 0;
      ctx.beginPath();
      ctx.arc(-3.5 + lookX, -20 + yOffset, 1.3, 0, Math.PI * 2);
      ctx.arc(3.5 + lookX, -20 + yOffset, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ritual performance props & motion when performing a ritual
  if (isPraying) {
    const dirSign = pos.direction === 'left' ? -1 : 1;
    if (performingAction === 'sweep') {
      const sweepAng = Math.sin(now * 0.018) * 0.48;
      ctx.save();
      ctx.translate(8, 2 + yOffset);
      ctx.rotate(sweepAng);
      ctx.strokeStyle = '#9C7343';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.fillStyle = '#E0B96B';
      ctx.beginPath();
      ctx.moveTo(-2, 8);
      ctx.lineTo(2, 8);
      ctx.lineTo(7, 17);
      ctx.lineTo(-7, 17);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'fish') {
      const tilt = Math.sin(now * 0.012) * 0.2;
      ctx.save();
      ctx.translate(dirSign * 14, -2 + yOffset);
      ctx.rotate(-0.25 * dirSign + tilt);
      ctx.fillStyle = '#8C523B';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6BD4D8';
      ctx.beginPath();
      ctx.ellipse(0, -1, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'bell') {
      const pull = Math.sin(now * 0.016) * 4;
      ctx.save();
      ctx.strokeStyle = '#7C4B32';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -4 + yOffset);
      ctx.lineTo(12, -10 + yOffset + pull);
      ctx.stroke();
      ctx.restore();
    } else if (performingAction === 'woodfish') {
      const tap = -Math.abs(Math.sin(now * 0.02)) * 5;
      ctx.save();
      ctx.strokeStyle = '#C99E5A';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(6, 0 + yOffset);
      ctx.lineTo(13, -10 + yOffset + tap);
      ctx.stroke();
      ctx.fillStyle = '#E8B86A';
      ctx.beginPath();
      ctx.arc(13, -10 + yOffset + tap, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'fortune') {
      const shake = Math.sin(now * 0.028) * 3;
      ctx.save();
      ctx.translate(11, -4 + yOffset + shake);
      ctx.fillStyle = '#C99E5A';
      roundRect(ctx, -3.5, -9, 7, 14, 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'flower') {
      const tilt = Math.sin(now * 0.012) * 0.25;
      ctx.save();
      ctx.translate(dirSign * 12, -2 + yOffset);
      ctx.rotate(tilt);
      ctx.fillStyle = '#6A9C78';
      roundRect(ctx, -5, -4, 10, 8, 2);
      ctx.fill();
      ctx.strokeStyle = '#9CD8D8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(dirSign * 5, 0);
      ctx.lineTo(dirSign * 11, 6);
      ctx.stroke();
      ctx.restore();
    } else if (performingAction === 'lantern') {
      ctx.save();
      ctx.translate(dirSign * 12, -3 + yOffset);
      ctx.fillStyle = '#F7C95C';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF5D0';
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'feed_koi' || performingAction === 'feed_birds') {
      const toss = Math.sin(now * 0.02) * 4;
      ctx.save();
      ctx.fillStyle = performingAction === 'feed_birds' ? '#F5CE69' : '#E8B86A';
      ctx.beginPath();
      ctx.arc(dirSign * 10, -4 + yOffset + toss, 2.2, 0, Math.PI * 2);
      ctx.arc(dirSign * 15, 0 + yOffset - toss * 0.5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'wish') {
      const swing = Math.sin(now * 0.02) * 5;
      ctx.save();
      ctx.strokeStyle = '#E03E36';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(dirSign * 8, -2 + yOffset);
      ctx.quadraticCurveTo(dirSign * 14, -12 + yOffset, dirSign * 12 + swing, -22 + yOffset);
      ctx.stroke();
      ctx.fillStyle = '#F7CA5C';
      ctx.beginPath();
      ctx.arc(dirSign * 8, -2 + yOffset, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'bow') {
      // Deep reverent bow animation toward Buddha
      const bowCycle = Math.sin(((now % 1250) / 1250) * Math.PI);
      ctx.save();
      ctx.strokeStyle = `rgba(247, 210, 136, ${0.45 + bowCycle * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -10 + yOffset + bowCycle * 4, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#FFE4A0';
      ctx.beginPath();
      ctx.arc(0, -24 + yOffset + bowCycle * 6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'kitchen_sink') {
      // Gentle scrubbing motion & water droplets at Bồn Rửa
      const scrub = Math.sin(now * 0.022) * 4;
      ctx.save();
      ctx.fillStyle = '#F5F0E4';
      ctx.beginPath();
      ctx.arc(dirSign * 11 + scrub, -4 + yOffset, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7EDAE0';
      ctx.beginPath();
      ctx.arc(dirSign * 14 - scrub, 2 + yOffset, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (performingAction === 'kitchen_table' || performingAction === 'kitchen_menu') {
      ctx.save();
      ctx.fillStyle = '#F7C95C';
      ctx.beginPath();
      ctx.arc(dirSign * 11, -5 + yOffset, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // Incense or generic prayer bow with glowing incense stick
      ctx.save();
      ctx.strokeStyle = '#B86942';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -3 + yOffset);
      ctx.lineTo(0, -19 + yOffset);
      ctx.stroke();
      ctx.fillStyle = '#FF8A4C';
      ctx.beginPath();
      ctx.arc(0, -20 + yOffset, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const label = player.role === 'admin' ? `${player.displayName} (Admin)` : player.displayName;
  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  const labelW = ctx.measureText(label).width + 12;
  ctx.fillStyle = 'rgba(20, 16, 14, 0.78)';
  roundRect(ctx, -labelW / 2, 22, labelW, 18, 4);
  ctx.fill();
  ctx.fillStyle = isSelf ? '#F3C784' : '#F5EFE6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 31);

  if (player.chatText && (!player.chatExpiresAt || now < player.chatExpiresAt)) {
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    const text = player.chatText.length > 42 ? `${player.chatText.slice(0, 40)}…` : player.chatText;
    const bubbleW = Math.min(220, ctx.measureText(text).width + 18);
    const bubbleH = 26;
    ctx.fillStyle = '#FBF7F0';
    roundRect(ctx, -bubbleW / 2, -66 + yOffset, bubbleW, bubbleH, 7);
    ctx.fill();
    ctx.fillStyle = '#241E1A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, -66 + yOffset + bubbleH / 2);
  }

  ctx.restore();
}

function drawZonePlaque(ctx: CanvasRenderingContext2D, zoneName: string, topY: number) {
  ctx.save();
  ctx.font = '600 11.5px "Playfair Display", Georgia, serif';
  const textW = ctx.measureText(zoneName).width;
  const w = textW + 22;
  const h = 26;
  ctx.fillStyle = 'rgba(26, 21, 18, 0.52)';
  roundRect(ctx, 12, topY, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 223, 176, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#FBF2DC';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(zoneName, 12 + w / 2, topY + h / 2);
  ctx.restore();
}

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  room: RoomState,
  currentUserId: string,
  positions: Map<string, RenderPos>,
  cam: { x: number; y: number },
  viewW: number,
  viewH: number,
  topInsetWorld: number
) {
  const { x, y, w, h } = getMiniMapRect(viewW, topInsetWorld);
  const sx = w / WORLD_TOTAL_WIDTH;
  const sy = h / WORLD_TOTAL_HEIGHT;
  const mapX = (wx: number) => x + (wx - WORLD_MIN_X) * sx;
  const mapY = (wy: number) => y + (wy - WORLD_MIN_Y) * sy;

  ctx.save();
  ctx.fillStyle = 'rgba(26, 21, 18, 0.56)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 223, 176, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 6);
  ctx.clip();

  // Vast Ocean Vista at north edge
  ctx.fillStyle = '#256B8A';
  ctx.fillRect(x, mapY(WORLD_MIN_Y), w, (-605 - WORLD_MIN_Y) * sy);
  // Sandy Shore
  ctx.fillStyle = '#D5C39A';
  ctx.fillRect(x, mapY(-605), w, 85 * sy);

  // Expanded Vườn Bồ Đề & Hòn Non Bộ Plaza + Bia Ngũ Giới
  ctx.fillStyle = '#75826B';
  ctx.fillRect(mapX(-345), mapY(78), 790 * sx, 392 * sy);
  ctx.fillStyle = '#3B7479';
  ctx.beginPath();
  ctx.ellipse(
    mapX(HON_NON_BO_SPEC.cx),
    mapY(HON_NON_BO_SPEC.cy),
    Math.max(3, HON_NON_BO_SPEC.rx * sx),
    Math.max(2.5, HON_NON_BO_SPEC.ry * sy),
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.fillStyle = '#E5BA64';
  ctx.fillRect(mapX(PRECEPTS_STELE_SPEC.x) - 1.5, mapY(PRECEPTS_STELE_SPEC.y) - 2, 3, 4);

  // Khu Công Viên Cầu Siêu
  ctx.fillStyle = '#7F8C7A';
  ctx.fillRect(mapX(110), mapY(-440), 440 * sx, 375 * sy);

  // Bảo Tháp Sau Chánh Điện
  ctx.fillStyle = '#C99E5A';
  ctx.beginPath();
  ctx.arc(mapX(STUPA_SPEC.cx), mapY(STUPA_SPEC.cy), 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#87796B';
  ctx.fillRect(mapX(640), mapY(525), 640 * sx, 385 * sy);

  // Elongated Chánh Điện
  ctx.fillStyle = '#A14135';
  ctx.fillRect(mapX(680), mapY(-85), 560 * sx, 580 * sy);

  ctx.fillStyle = '#3B7479';
  ctx.beginPath();
  ctx.ellipse(mapX(POND_SPEC.cx), mapY(POND_SPEC.cy), POND_SPEC.rx * sx, POND_SPEC.ry * sy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9D6D4D';
  ctx.fillRect(
    mapX(POND_SPEC.bridgeXMin),
    mapY(POND_SPEC.bridgeYMin),
    (POND_SPEC.bridgeXMax - POND_SPEC.bridgeXMin) * sx,
    Math.max(2, (POND_SPEC.bridgeYMax - POND_SPEC.bridgeYMin) * sy)
  );

  // Gian Bếp Chay (NE pavilion)
  ctx.fillStyle = '#8F382D';
  ctx.fillRect(mapX(1442), mapY(262), 342 * sx, 350 * sy);

  // Dàn Hoa Giấy Hồng
  ctx.fillStyle = '#E86399';
  ctx.fillRect(
    mapX(PERGOLA_SPEC.minX),
    mapY(PERGOLA_SPEC.minY),
    (PERGOLA_SPEC.maxX - PERGOLA_SPEC.minX) * sx,
    (PERGOLA_SPEC.maxY - PERGOLA_SPEC.minY) * sy
  );

  // Dãy Núi Liên Sơn (Back-Right Peak)
  ctx.fillStyle = '#5B6F5C';
  ctx.fillRect(
    mapX(MOUNTAIN_SPEC.minX),
    mapY(MOUNTAIN_SPEC.minY),
    (MOUNTAIN_SPEC.maxX - MOUNTAIN_SPEC.minX) * sx,
    (MOUNTAIN_SPEC.maxY - MOUNTAIN_SPEC.minY) * sy
  );

  // Cây Nguyện Ước dot on mini-map
  ctx.fillStyle = '#E25350';
  ctx.beginPath();
  ctx.arc(mapX(INTERACTABLES.wish.x), mapY(INTERACTABLES.wish.y), 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 223, 176, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX(cam.x), mapY(cam.y), viewW * sx, viewH * sy);

  for (const player of room.players) {
    const pos = positions.get(player.userId) || { x: player.x, y: player.y };
    const isSelf = player.userId === currentUserId;
    ctx.fillStyle = isSelf ? '#F2B85E' : '#F5EFE6';
    ctx.beginPath();
    ctx.arc(mapX(pos.x), mapY(pos.y), isSelf ? 3.2 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawOffscreenFriendMarker(
  ctx: CanvasRenderingContext2D,
  name: string,
  sx: number,
  sy: number,
  viewW: number,
  viewH: number,
  topInsetWorld: number,
  bottomInsetWorld: number
) {
  const cx = Math.max(46, Math.min(viewW - 46, sx));
  const cy = Math.max(topInsetWorld + 44, Math.min(viewH - bottomInsetWorld - 24, sy));
  const ang = Math.atan2(sy - viewH / 2, sx - viewW / 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(22, 18, 15, 0.85)';
  roundRect(ctx, -36, -12, 72, 22, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217, 155, 82, 0.65)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#F5EFE6';
  ctx.font = '500 10.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const shortName = name.length > 9 ? `${name.slice(0, 8)}…` : name;
  ctx.fillText(shortName, 0, -1);

  ctx.rotate(ang);
  ctx.fillStyle = '#D99B52';
  ctx.beginPath();
  ctx.moveTo(42, 0);
  ctx.lineTo(35, -4);
  ctx.lineTo(35, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBottomStatusBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  viewW: number,
  viewH: number,
  bottomInsetWorld: number
) {
  ctx.save();
  ctx.font = '500 11.5px "Plus Jakarta Sans", sans-serif';
  const w = Math.min(viewW - 24, ctx.measureText(text).width + 24);
  const h = 26;
  const bx = (viewW - w) / 2;
  const by = Math.max(80, viewH - bottomInsetWorld - 34);

  ctx.fillStyle = 'rgba(22, 18, 15, 0.88)';
  roundRect(ctx, bx, by, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217, 155, 82, 0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#F5DFB0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, viewW / 2, by + h / 2);
  ctx.restore();
}

function drawProximityPrompt(
  ctx: CanvasRenderingContext2D,
  label: string,
  viewW: number,
  viewH: number,
  bottomInsetWorld: number
) {
  drawBottomStatusBanner(ctx, `Nhấn E · ${label}`, viewW, viewH, bottomInsetWorld);
}

function drawWorldAtmosphere2D(
  ctx: CanvasRenderingContext2D,
  now: number,
  cam: { x: number; y: number },
  viewW: number,
  viewH: number,
  room: RoomState,
  atm: TempleAtmosphereSnapshot,
  lowResourceMode: boolean
) {
  const sec = now * 0.001;

  // 1. Rain splash ripples across courtyard & lotus pond
  if (atm.rainIntensity > 0.03) {
    const rippleCount = lowResourceMode ? 12 : 28;
    ctx.save();
    ctx.lineWidth = 1.1;
    for (let i = 0; i < rippleCount; i++) {
      const seed = i * 137.5;
      const cycle = ((sec * 1.1 + (seed % 1)) % 1);
      const rx = cam.x + (((seed * 73) % 1000) / 1000) * viewW;
      const ry = cam.y + (((seed * 199) % 1000) / 1000) * viewH;
      if (isUnderTempleRoof(rx, ry)) continue;
      const alpha = (1 - cycle) * 0.32 * atm.rainIntensity;
      ctx.strokeStyle = `rgba(195, 224, 242, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 3 + cycle * 11, 1.5 + cycle * 5.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Soft drifting temple mist bands across courtyard & pond
  if (atm.mistIntensity > 0.02) {
    const bandCount = lowResourceMode ? 3 : 6;
    ctx.save();
    for (let i = 0; i < bandCount; i++) {
      const drift = ((sec * (16 + i * 4) + i * 310) % (WORLD_TOTAL_WIDTH + 600)) + (WORLD_MIN_X - 300);
      const my = 220 + i * 175 + Math.sin(sec * 0.4 + i) * 18;
      const rw = 360 + (i % 3) * 120;
      const rh = 72 + (i % 2) * 26;
      if (drift + rw < cam.x || drift - rw > cam.x + viewW || my + rh < cam.y || my - rh > cam.y + viewH) {
        continue;
      }
      const grad = ctx.createRadialGradient(drift, my, 12, drift, my, rw * 0.55);
      const mistA = 0.22 * atm.mistIntensity;
      grad.addColorStop(0, `rgba(232, 242, 244, ${mistA})`);
      grad.addColorStop(0.55, `rgba(220, 232, 236, ${mistA * 0.5})`);
      grad.addColorStop(1, 'rgba(220, 232, 236, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(drift, my, rw * 0.55, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. Time-of-day atmospheric color veil
  if (atm.ambientOverlayAlpha > 0.005) {
    ctx.save();
    ctx.globalAlpha = atm.ambientOverlayAlpha;
    ctx.fillStyle = atm.ambientOverlayCss;
    ctx.fillRect(cam.x - 4, cam.y - 4, viewW + 8, viewH + 8);
    ctx.restore();
  }

  // 4. Warm golden lantern & sanctuary light pools at dusk/night
  const nightGlowStrength = Math.max(atm.nightFactor, atm.dawnDuskFactor * 0.45);
  if (nightGlowStrength > 0.08) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const drawPool = (px: number, py: number, radius: number, intensity: number) => {
      if (
        px + radius < cam.x ||
        px - radius > cam.x + viewW ||
        py + radius < cam.y ||
        py - radius > cam.y + viewH
      ) {
        return;
      }
      const g = ctx.createRadialGradient(px, py, 2, px, py, radius);
      g.addColorStop(0, `rgba(255, 206, 122, ${0.34 * intensity})`);
      g.addColorStop(0.45, `rgba(244, 165, 68, ${0.14 * intensity})`);
      g.addColorStop(1, 'rgba(244, 165, 68, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    // Chánh Điện (north altar & cushion hall), Bảo Tháp, Công Viên Cầu Siêu, Hòn Non Bộ, coastal back gate & Gian Bếp Chay
    drawPool(960, 120, 195, nightGlowStrength);
    drawPool(960, 390, 210, nightGlowStrength * 0.92);
    drawPool(960, 505, 115, nightGlowStrength * 0.8);
    drawPool(STUPA_SPEC.cx, STUPA_SPEC.cy, 130, nightGlowStrength * 0.88);
    drawPool(INTERACTABLES.memorial.x, INTERACTABLES.memorial.y, 115, nightGlowStrength * 0.8);
    drawPool(HON_NON_BO_SPEC.cx + 38, HON_NON_BO_SPEC.cy + 12, 92, nightGlowStrength * 0.85);
    drawPool(PRECEPTS_STELE_SPEC.x, PRECEPTS_STELE_SPEC.y - 16, 72, nightGlowStrength * 0.82);
    drawPool(960, -502, 95, nightGlowStrength * 0.82);
    drawPool(960, -575, 125, nightGlowStrength * 0.85);
    drawPool(605, 505, 95, nightGlowStrength * 0.85);
    drawPool(1315, 505, 95, nightGlowStrength * 0.85);
    drawPool(1660, 520, 125, nightGlowStrength * 0.9);
    drawPool(INTERACTABLES.incense.x, INTERACTABLES.incense.y - 14, 88, nightGlowStrength * 0.85);

    for (const l of STONE_LANTERNS) {
      const flicker = 0.92 + Math.sin(sec * 5.2 + l.x * 0.05) * 0.08;
      drawPool(l.x, l.y - 22, 74 + atm.nightFactor * 30, nightGlowStrength * flicker);
    }

    for (const pl of PATH_LANTERN_POSTS) {
      const flicker = 0.93 + Math.sin(sec * 4.6 + pl.x * 0.04 + pl.y * 0.03) * 0.07;
      drawPool(
        pl.x + Math.cos(pl.armDir) * 10,
        pl.y - 18 + Math.sin(pl.armDir) * 6,
        66 + atm.nightFactor * 32,
        nightGlowStrength * 0.95 * flicker
      );
    }

    for (let i = 0; i < room.lanterns.length; i++) {
      const lp = getPondLanternWorldPos(room.lanterns[i], i, now);
      drawPool(lp.x, lp.y, 48, nightGlowStrength * 0.9);
    }

    ctx.restore();
  }

  // 5. Calm night fireflies meandering around pond, bamboo, backyard, Bảo Tháp, Memorial Park, and Hòn Non Bộ garden
  if (atm.fireflyIntensity > 0.05) {
    const count = lowResourceMode ? 12 : 28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const fxBase = -320 + ((i * 257) % 2120);
      const fyBase = -460 + ((i * 193) % 1540);
      const fx = fxBase + Math.sin(sec * (0.45 + (i % 4) * 0.12) + i) * 34;
      const fy = fyBase + Math.cos(sec * (0.52 + (i % 3) * 0.14) + i * 1.7) * 22;
      if (fx < cam.x - 16 || fx > cam.x + viewW + 16 || fy < cam.y - 16 || fy > cam.y + viewH + 16) {
        continue;
      }
      const pulse = Math.max(0, Math.sin(sec * 2.4 + i * 1.9));
      const alpha = atm.fireflyIntensity * (0.25 + pulse * 0.75);
      const rad = 7 + pulse * 5;
      const fg = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, rad);
      fg.addColorStop(0, `rgba(236, 255, 165, ${alpha})`);
      fg.addColorStop(0.45, `rgba(195, 240, 100, ${alpha * 0.45})`);
      fg.addColorStop(1, 'rgba(195, 240, 100, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(fx, fy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawScreenWeather2D(
  ctx: CanvasRenderingContext2D,
  now: number,
  cam: { x: number; y: number },
  viewW: number,
  viewH: number,
  atm: TempleAtmosphereSnapshot,
  lowResourceMode: boolean
) {
  const sec = now * 0.001;

  // Celestial sunlight / sunset / moonlight halo
  const sunGlow = ctx.createRadialGradient(
    viewW * 0.5,
    viewH * 0.18,
    Math.min(viewW, viewH) * 0.08,
    viewW * 0.5,
    viewH * 0.35,
    Math.max(viewW, viewH) * 0.85
  );
  sunGlow.addColorStop(0, atm.celestialGlowCss.replace('rgb(', 'rgba(').replace(')', `, ${atm.celestialGlowAlpha})`));
  sunGlow.addColorStop(0.65, atm.celestialGlowCss.replace('rgb(', 'rgba(').replace(')', `, ${atm.celestialGlowAlpha * 0.16})`));
  sunGlow.addColorStop(1, `rgba(18, 20, 26, ${0.12 + atm.nightFactor * 0.18})`);
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, viewW, viewH);

  // Diagonal temple rain streaks (excluding roofed sanctuaries & pavilions)
  if (atm.rainIntensity > 0.02) {
    const dropCount = lowResourceMode ? 38 : 96;
    ctx.save();
    ctx.strokeStyle = `rgba(205, 228, 246, ${0.38 * atm.rainIntensity})`;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (let i = 0; i < dropCount; i++) {
      const speedY = 480 + (i % 5) * 55;
      const speedX = -85 - (i % 3) * 14;
      const x = (((i * 97.3 + sec * speedX) % (viewW + 120)) + (viewW + 120)) % (viewW + 120) - 60;
      const y = (((i * 61.7 + sec * speedY) % (viewH + 90)) + (viewH + 90)) % (viewH + 90) - 45;
      const len = 14 + (i % 4) * 4;
      const wx = cam.x + x;
      const wy = cam.y + y;
      const wx2 = wx - len * 0.18;
      const wy2 = wy + len;
      if (isUnderTempleRoof(wx, wy) || isUnderTempleRoof(wx2, wy2)) continue;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.18, y + len);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Gentle breeze blowing lotus petals & golden Bodhi leaves
  if (atm.breezeIntensity > 0.02) {
    const leafCount = lowResourceMode ? 10 : 24;
    ctx.save();
    for (let i = 0; i < leafCount; i++) {
      const speedX = 48 + (i % 4) * 14;
      const speedY = 26 + (i % 3) * 9;
      const x = (((i * 113 + sec * speedX + Math.sin(sec * 1.4 + i) * 24) % (viewW + 80)) + (viewW + 80)) % (viewW + 80) - 40;
      const y = (((i * 79 + sec * speedY) % (viewH + 60)) + (viewH + 60)) % (viewH + 60) - 30;
      const rot = sec * (1.2 + (i % 3) * 0.4) + i;
      const isLotus = i % 2 === 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = isLotus
        ? `rgba(242, 168, 186, ${0.72 * atm.breezeIntensity})`
        : `rgba(222, 182, 102, ${0.7 * atm.breezeIntensity})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.2, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPergolaPatio2D(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const pw = PERGOLA_SPEC.maxX - PERGOLA_SPEC.minX + 28;
  const ph = PERGOLA_SPEC.maxY - PERGOLA_SPEC.minY + 26;
  const px = PERGOLA_SPEC.cx - pw / 2;
  const py = PERGOLA_SPEC.cy - ph / 2;

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, px + 3, py + 4, pw, ph, 14);
  ctx.fill();

  ctx.fillStyle = '#998A7A';
  roundRect(ctx, px, py, pw, ph, 14);
  ctx.fill();
  ctx.strokeStyle = '#BDB09F';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Stepping stone link connecting Gian Bếp Chay south steps to Pergola patio
  ctx.fillStyle = '#9E8F80';
  roundRect(ctx, 1595, 620, 38, 44, 6);
  ctx.fill();
  ctx.restore();
}

function drawPergolaBench2D(
  ctx: CanvasRenderingContext2D,
  bench: (typeof PERGOLA_BENCH_SPECS)[number],
  occupiedCount: number
) {
  ctx.save();
  ctx.translate(bench.x, bench.y - 4);

  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  roundRect(ctx, -47, -6, 94, 27, 6);
  ctx.fill();

  // Carved stone legs
  ctx.fillStyle = '#7F7870';
  roundRect(ctx, -37, 8, 13, 10, 3);
  ctx.fill();
  roundRect(ctx, 24, 8, 13, 10, 3);
  ctx.fill();

  // Wide 2-person granite seat slab
  ctx.fillStyle = occupiedCount > 0 ? '#D0C8BE' : '#C2B9AF';
  roundRect(ctx, -46, -8, 92, 20, 5);
  ctx.fill();
  ctx.strokeStyle = '#91887E';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Subtle dual-seat carved stone cushions (-19, +19)
  ctx.fillStyle = 'rgba(138, 126, 114, 0.28)';
  roundRect(ctx, -36, -5, 33, 14, 4);
  ctx.fill();
  roundRect(ctx, 3, -5, 33, 14, 4);
  ctx.fill();

  // Sculpted stone backrest on top edge
  ctx.fillStyle = '#AFA69B';
  roundRect(ctx, -44, -15, 88, 9, 4);
  ctx.fill();
  ctx.stroke();

  // Subtle capacity dot indicator (2 seats)
  for (let s = 0; s < 2; s++) {
    ctx.fillStyle = s < occupiedCount ? '#E5B869' : 'rgba(65, 55, 48, 0.35)';
    ctx.beginPath();
    ctx.arc(s === 0 ? -4 : 4, -11, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBirdFeederStand2D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isFeeding: boolean
) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Low bamboo / wooden stand
  ctx.fillStyle = '#7C5338';
  roundRect(ctx, -5, -8, 10, 13, 3);
  ctx.fill();

  // Woven ceramic / bamboo millet tray
  ctx.fillStyle = '#B87C4C';
  ctx.beginPath();
  ctx.ellipse(0, -9, 14, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#E5B869';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Golden millet & paddy grains
  ctx.fillStyle = isFeeding ? '#FFE68A' : '#E2B659';
  ctx.beginPath();
  ctx.ellipse(0, -10, 10, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawScatteredBirdSeeds2D(
  ctx: CanvasRenderingContext2D,
  now: number,
  createdAt: number
) {
  const age = (now - createdAt) / 1000;
  if (age < 0.25 || age > 9.4) return;
  const appear = Math.min(1, (age - 0.25) / 0.45);
  ctx.save();
  for (let i = 0; i < 24; i++) {
    const eatStart = 2.0 + ((i * 7) % 12) * 0.56;
    const eatProgress = Math.max(0, Math.min(1, (age - eatStart) / 0.65));
    const scale = appear * (1 - eatProgress);
    if (scale <= 0.05) continue;
    const sx = PERGOLA_SPEC.cx + Math.sin(i * 2.17) * 44;
    const sy = 774 + Math.cos(i * 1.63) * 18;
    ctx.fillStyle = i % 3 === 0 ? '#FFE588' : '#E5B84B';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 2.4 * scale, 1.5 * scale, i * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPergolaBirds2D(
  ctx: CanvasRenderingContext2D,
  now: number,
  lowResourceMode: boolean,
  feedEffect: VisualEffect | undefined
) {
  const sec = now * 0.001;
  const age = feedEffect ? (now - feedEffect.createdAt) / 1000 : -1;
  const smoothStep = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };

  const birdSpecs = [
    { kind: 'dove' as const, rx: 112, rz: 66, speed: 0.68, phase: 0.0, landX: -24, landY: -8, stagger: 0.0 },
    { kind: 'dove' as const, rx: 128, rz: 58, speed: -0.62, phase: 1.7, landX: 20, landY: -4, stagger: 0.14 },
    { kind: 'dove' as const, rx: 98, rz: 74, speed: 0.74, phase: 3.3, landX: -6, landY: 11, stagger: 0.28 },
    { kind: 'dove' as const, rx: 138, rz: 64, speed: -0.56, phase: 4.8, landX: 30, landY: 10, stagger: 0.42 },
    { kind: 'sparrow' as const, rx: 86, rz: 52, speed: 1.05, phase: 0.6, landX: -36, landY: 6, stagger: 0.08 },
    { kind: 'sparrow' as const, rx: 102, rz: 48, speed: -0.96, phase: 2.1, landX: -12, landY: -14, stagger: 0.22 },
    { kind: 'sparrow' as const, rx: 94, rz: 60, speed: 1.12, phase: 3.7, landX: 10, landY: 2, stagger: 0.34 },
    { kind: 'sparrow' as const, rx: 116, rz: 54, speed: -1.04, phase: 5.1, landX: 36, landY: -6, stagger: 0.46 },
    { kind: 'sparrow' as const, rx: 78, rz: 44, speed: 1.18, phase: 1.2, landX: 4, landY: 16, stagger: 0.18 },
  ];

  const count = lowResourceMode ? 5 : birdSpecs.length;
  ctx.save();

  for (let i = 0; i < count; i++) {
    const b = birdSpecs[i];
    const t = sec * b.speed + b.phase;
    const orbitX = PERGOLA_SPEC.cx + Math.cos(t) * b.rx;
    const orbitY = PERGOLA_SPEC.cy + Math.sin(t * 2) * b.rz * 0.55;
    const orbitVx = -Math.sin(t) * b.rx * b.speed;
    const orbitVy = Math.cos(t * 2) * 2 * b.rz * 0.55 * b.speed;
    const orbitElev = (b.kind === 'dove' ? 38 : 30) + Math.sin(sec * 2.1 + b.phase) * 5;

    let swoopFactor = 0;
    if (age >= 0 && age < 11.5) {
      const enter = smoothStep((age - b.stagger) / 1.35);
      const exit = smoothStep((age - (8.8 + b.stagger * 0.5)) / 1.55);
      swoopFactor = Math.max(0, enter * (1 - exit));
    }

    const hopTime = Math.max(0, age - 1.3 - b.stagger);
    const hopOffset = swoopFactor > 0.7 ? Math.abs(Math.sin(hopTime * 6.5 + i)) * 3.5 : 0;
    const groundX = PERGOLA_SPEC.cx + b.landX + Math.sin(hopTime * 1.4 + i) * 5;
    const groundY = 774 + b.landY;

    const bx = orbitX + (groundX - orbitX) * swoopFactor;
    const by = orbitY + (groundY - orbitY) * swoopFactor;
    const elev = orbitElev * (1 - swoopFactor) + hopOffset;

    const dirVx = orbitVx * (1 - swoopFactor) + (groundX - orbitX) * 0.3 * swoopFactor;
    const dirVy = orbitVy * (1 - swoopFactor) + (groundY - orbitY) * 0.3 * swoopFactor;
    const heading =
      swoopFactor > 0.85 ? (b.landX > 0 ? Math.PI : 0) : Math.atan2(dirVy, dirVx);

    // Ground shadow beneath circling/landed bird
    ctx.fillStyle = `rgba(0, 0, 0, ${0.14 + swoopFactor * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(bx, by + 6, b.kind === 'dove' ? 8 : 5, b.kind === 'dove' ? 3.5 : 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pecking nod when landed near seeds
    const isPecking = swoopFactor > 0.82 && age < 8.9 && Math.sin(sec * 12 + i * 2.1) > 0.15;
    const wingAmp =
      swoopFactor > 0.82
        ? Math.sin(sec * 18 + i) * 0.15
        : b.kind === 'dove'
        ? Math.sin(sec * 9.5 + b.phase) * 0.85
        : Math.sin(sec * 16 + b.phase) * 0.95;

    ctx.save();
    ctx.translate(bx, by - elev + (isPecking ? 2.2 : 0));
    ctx.rotate(heading);

    if (b.kind === 'dove') {
      // Fan tail feathers
      ctx.fillStyle = '#D9D6CE';
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-14, -4.5);
      ctx.lineTo(-14, 4.5);
      ctx.closePath();
      ctx.fill();

      // Flapping white/silver wings
      ctx.fillStyle = '#F6F4EE';
      ctx.strokeStyle = '#C7C3B8';
      ctx.lineWidth = 0.8;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(1, 0.35 + Math.abs(wingAmp) * 0.95);
        ctx.beginPath();
        ctx.ellipse(-1, side * (6.5 + wingAmp * 3), 5.2, 7.5, side * -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Dove body & head
      ctx.fillStyle = '#FAF8F4';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.8, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6.5, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Soft coral beak & dark eye
      ctx.fillStyle = '#E28A72';
      ctx.beginPath();
      ctx.moveTo(9, -1.2);
      ctx.lineTo(12.2, 0);
      ctx.lineTo(9, 1.2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#241D1A';
      ctx.beginPath();
      ctx.arc(7.4, -1, 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Sparrow tail
      ctx.fillStyle = '#5E3F2B';
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-9.5, -2.5);
      ctx.lineTo(-9.5, 2.5);
      ctx.closePath();
      ctx.fill();

      // Chestnut-brown sparrow wings
      ctx.fillStyle = '#8F603D';
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(1, 0.4 + Math.abs(wingAmp) * 0.9);
        ctx.beginPath();
        ctx.ellipse(-0.5, side * (4.4 + wingAmp * 2), 3.4, 4.8, side * -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Warm buff-cream sparrow body & chestnut cap
      ctx.fillStyle = '#DFC7A7';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.2, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7A4F32';
      ctx.beginPath();
      ctx.arc(4.2, 0, 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Tiny golden-tan beak
      ctx.fillStyle = '#D99F4C';
      ctx.beginPath();
      ctx.moveTo(6.1, -0.9);
      ctx.lineTo(8.4, 0);
      ctx.lineTo(6.1, 0.9);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  ctx.restore();
}

function drawPergolaCanopy2D(
  ctx: CanvasRenderingContext2D,
  now: number,
  lowResourceMode: boolean
) {
  ctx.save();
  const { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax, cx } = PERGOLA_SPEC;

  // 4 Timber corner posts rising to arbor
  for (const [px, py] of [
    [xMin + 14, yMin + 14],
    [xMax - 14, yMin + 14],
    [xMin + 14, yMax - 14],
    [xMax - 14, yMax - 14],
  ]) {
    ctx.fillStyle = '#523322';
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Translucent wooden trellis rafters overhead
  ctx.globalAlpha = 0.88;
  ctx.strokeStyle = '#6B4229';
  ctx.lineWidth = 4.5;
  ctx.strokeRect(xMin + 12, yMin + 12, xMax - xMin - 24, yMax - yMin - 24);
  ctx.lineWidth = 3;
  for (let rx = xMin + 34; rx < xMax - 20; rx += 32) {
    ctx.beginPath();
    ctx.moveTo(rx, yMin + 6);
    ctx.lineTo(rx, yMax - 6);
    ctx.stroke();
  }

  // Lush foliage and bright pink bougainvillea blossoms along arbor canopy & perimeter
  const sec = now * 0.001;
  const blossomSpots = [
    { x: xMin + 24, y: yMin + 18, r: 24 },
    { x: xMin + 86, y: yMin + 14, r: 22 },
    { x: cx, y: yMin + 16, r: 24 },
    { x: xMax - 82, y: yMin + 14, r: 22 },
    { x: xMax - 24, y: yMin + 20, r: 24 },
    { x: xMin + 18, y: yMax - 22, r: 23 },
    { x: xMax - 20, y: yMax - 20, r: 23 },
    { x: xMin + 95, y: yMax - 16, r: 19 },
    { x: xMax - 95, y: yMax - 16, r: 19 },
  ];

  for (let i = 0; i < blossomSpots.length; i++) {
    const b = blossomSpots[i];
    const sway = Math.sin(sec * 1.1 + i) * 1.6;
    ctx.fillStyle = 'rgba(72, 128, 70, 0.72)';
    ctx.beginPath();
    ctx.arc(b.x + sway, b.y, b.r * 1.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = i % 2 === 0 ? 'rgba(225, 62, 128, 0.84)' : 'rgba(244, 108, 162, 0.84)';
    ctx.beginPath();
    ctx.arc(b.x + sway - 5, b.y - 3, b.r * 0.76, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(252, 166, 202, 0.85)';
    ctx.beginPath();
    ctx.arc(b.x + sway + 6, b.y + 4, b.r * 0.52, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft falling pink bougainvillea petals in 2D
  if (!lowResourceMode) {
    for (let p = 0; p < 10; p++) {
      const cycle = (sec * 0.35 + p * 0.13) % 1;
      const px = xMin + 24 + ((p * 53) % (xMax - xMin - 48)) + Math.sin(sec * 2 + p) * 6;
      const py = yMin + 16 + cycle * (yMax - yMin - 12);
      ctx.fillStyle = `rgba(244, 114, 168, ${(1 - cycle) * 0.78})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 3.2, 1.8, sec + p, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Plaque label on north pergola beam
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#4A2E22';
  roundRect(ctx, cx - 58, yMin - 4, 116, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#F7A9C8';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.fillStyle = '#FFEAF3';
  ctx.font = '600 9px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DÀN HOA GIẤY HỒNG', cx, yMin + 5);

  ctx.restore();
}

function drawMountainRange2D(ctx: CanvasRenderingContext2D, now: number) {
  ctx.save();
  const { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax } = MOUNTAIN_SPEC;

  // Rocky mossy foothill terrain footprint
  const baseGrad = ctx.createRadialGradient(1680, -190, 40, 1660, -140, 340);
  baseGrad.addColorStop(0, '#5D6A5E');
  baseGrad.addColorStop(0.55, '#53684E');
  baseGrad.addColorStop(1, 'rgba(79, 102, 66, 0.35)');
  ctx.fillStyle = baseGrad;
  roundRect(ctx, xMin - 12, yMin - 10, xMax - xMin + 24, yMax - yMin + 24, 34);
  ctx.fill();

  // Mountain ridges & peaks painted from north-to-south for natural depth
  const sortedPeaks = [...MOUNTAIN_PEAKS].sort((a, b) => a.y - b.y);
  for (const pk of sortedPeaks) {
    const baseR = pk.radius * 1.15;
    const peakLift = pk.height * 3.1;

    // Ground shadow
    ctx.fillStyle = 'rgba(22, 30, 24, 0.25)';
    ctx.beginPath();
    ctx.ellipse(pk.x + 12, pk.y + 14, baseR * 1.04, baseR * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sloped rocky mountain body
    const mGrad = ctx.createLinearGradient(pk.x - baseR, pk.y - peakLift, pk.x + baseR, pk.y + baseR * 0.5);
    mGrad.addColorStop(0, '#7E857B');
    mGrad.addColorStop(0.45, '#5B645C');
    mGrad.addColorStop(1, '#445743');
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.moveTo(pk.x - baseR, pk.y + baseR * 0.45);
    ctx.lineTo(pk.x - baseR * 0.42, pk.y - peakLift * 0.56);
    ctx.lineTo(pk.x, pk.y - peakLift);
    ctx.lineTo(pk.x + baseR * 0.48, pk.y - peakLift * 0.52);
    ctx.lineTo(pk.x + baseR, pk.y + baseR * 0.45);
    ctx.quadraticCurveTo(pk.x, pk.y + baseR * 0.72, pk.x - baseR, pk.y + baseR * 0.45);
    ctx.closePath();
    ctx.fill();

    // Sunlit ridge highlight facet
    ctx.fillStyle = 'rgba(218, 224, 210, 0.22)';
    ctx.beginPath();
    ctx.moveTo(pk.x, pk.y - peakLift);
    ctx.lineTo(pk.x - baseR * 0.52, pk.y + baseR * 0.3);
    ctx.lineTo(pk.x - 4, pk.y + baseR * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  // Zig-zag Stone Stair Climbing Trail connecting MOUNTAIN_TRAIL_WAYPOINTS
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(34, 30, 26, 0.35)';
  ctx.lineWidth = 34;
  ctx.beginPath();
  MOUNTAIN_TRAIL_WAYPOINTS.forEach((wp, idx) => {
    if (idx === 0) ctx.moveTo(wp.x, wp.y);
    else ctx.lineTo(wp.x, wp.y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#A89F92';
  ctx.lineWidth = 26;
  ctx.stroke();

  // Individual stone steps along every trail segment
  for (let i = 0; i < MOUNTAIN_TRAIL_WAYPOINTS.length - 1; i++) {
    const a = MOUNTAIN_TRAIL_WAYPOINTS[i];
    const b = MOUNTAIN_TRAIL_WAYPOINTS[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(4, Math.floor(dist / 16));
    const ux = (b.x - a.x) / dist;
    const uy = (b.y - a.y) / dist;
    const nx = -uy;
    const ny = ux;
    ctx.strokeStyle = '#6E665D';
    ctx.lineWidth = 1.6;
    for (let s = 1; s < steps; s++) {
      const px = a.x + (b.x - a.x) * (s / steps);
      const py = a.y + (b.y - a.y) * (s / steps);
      ctx.beginPath();
      ctx.moveTo(px - nx * 11, py - ny * 11);
      ctx.lineTo(px + nx * 11, py + ny * 11);
      ctx.stroke();
    }
  }

  // Summit Overlook Terrace at P6 (1615, -258, elev = 18.2m)
  const summitWp = MOUNTAIN_TRAIL_WAYPOINTS[MOUNTAIN_TRAIL_WAYPOINTS.length - 1];
  const pulseGlow = 0.65 + Math.sin(now * 0.003) * 0.25;
  ctx.fillStyle = '#B8AFA1';
  ctx.beginPath();
  ctx.arc(summitWp.x, summitWp.y, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(247, 210, 136, ${pulseGlow})`;
  ctx.lineWidth = 2.6;
  ctx.stroke();

  ctx.fillStyle = '#332B24';
  roundRect(ctx, summitWp.x - 56, summitWp.y - 54, 112, 20, 5);
  ctx.fill();
  ctx.strokeStyle = '#E8B86A';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#FFE7A8';
  ctx.font = '600 9px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ĐỈNH NÚI LIÊN SƠN', summitWp.x, summitWp.y - 44);

  // Trail entrance signpost near P0 (1380, 175)
  const entryWp = MOUNTAIN_TRAIL_WAYPOINTS[0];
  ctx.fillStyle = '#4A2E22';
  roundRect(ctx, entryWp.x - 42, entryWp.y + 18, 84, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#F5DFB0';
  ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('LỐI LÊN NÚI', entryWp.x, entryWp.y + 26);

  ctx.restore();
}
