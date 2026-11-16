import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  GARDEN_PLOT_POSITIONS,
  INTERACTABLES,
  PERGOLA_BENCH_SPECS,
  STUPA_DECK_SLOTS,
  getBenchOccupancy,
  getEffectiveFlowerStage,
  type Direction,
  type KitchenMealState,
  type PlayerPose,
  type RitualAction,
  type RoomState,
} from '../shared/types.ts';
import {
  POND_SPEC,
  STUPA_DECK_WALK_HALF,
  STUPA_DECK_Y_3D,
  STUPA_SPEC,
  buildWalkWaypoints,
  directionToYaw,
  findNearbyInteraction,
  getGroundElevation3D,
  getRitualStandSpot,
  getRitualVisualTarget,
  getZoneName,
  resolveWalkPosition,
  world2DTo3D,
  yawToDirection,
} from '../shared/templeNavigation.ts';
import type { RitualRequest, VisualEffect } from './TempleCanvas.tsx';
import { createTempleTextures } from './temple3d/temple3dTextures.ts';
import {
  buildTempleWorld3D,
  createFirstPersonRitualRig,
  createRemotePlayerRig3D,
  getEyeHeightForPose,
  type RemotePlayerRig3D,
  type TempleWorld3DHandles,
} from './temple3d/temple3dBuilders.ts';
import {
  getTempleAtmosphere,
  type AtmospherePreference,
} from '../shared/templeAtmosphere.ts';
import { createAtmosphere3D, type Atmosphere3DHandle } from './temple3d/temple3dAtmosphere.ts';

interface TempleFirstPersonViewProps {
  room: RoomState;
  currentUserId: string;
  lowResourceMode: boolean;
  effects: VisualEffect[];
  ritualRequest?: RitualRequest | null;
  kitchenMeals?: KitchenMealState[];
  initialPosition?: { x: number; y: number; direction: Direction } | null;
  livePositionRef?: MutableRefObject<{ x: number; y: number; direction: Direction }>;
  isViewActive?: boolean;
  bottomHudInsetPx?: number;
  atmospherePref?: AtmospherePreference;
  fovDeg?: number;
  onFovChange?: (nextFov: number) => void;
  viewingStupa?: boolean;
  onExitStupa?: () => void;
  activeIncenseCount?: number;
  latestMemorial?: { deceasedName: string; createdAt: number } | null;
  onMoveLocal: (x: number, y: number, direction: Direction, pose: PlayerPose) => void;
  onSitCushion: (cushionIndex: number) => void;
  onSitBench: (benchIndex: number) => void;
  onTriggerInteractable: (action: RitualAction) => void;
  onKitchenMealClick?: (target: 'food' | 'drink', mealId?: string) => void;
  onSelectGardenPlot?: (plotIndex: number) => void;
  onInspectPrecepts?: () => void;
  onLoadProgress?: (progress: number) => void;
  onReady?: () => void;
}

interface ActiveWalkState {
  targetX: number;
  targetY: number;
  waypoints: Array<{ x: number; y: number }>;
  createdAt: number;
  pendingAction?: () => void;
}

interface ActiveRitualState {
  action: RitualAction;
  phase: 'walk' | 'perform';
  startedPerformAt: number;
  faceYaw: number;
  facePitch: number;
  mealTarget?: 'food' | 'drink';
  mealId?: string;
}

const _centerNdc = new THREE.Vector2(0, 0);

function shortestAngleDiff(current: number, target: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function TempleFirstPersonView({
  room,
  currentUserId,
  lowResourceMode,
  effects,
  ritualRequest = null,
  kitchenMeals = [],
  initialPosition = null,
  livePositionRef,
  isViewActive = true,
  bottomHudInsetPx = 74,
  atmospherePref,
  fovDeg = 62,
  onFovChange,
  viewingStupa = false,
  onExitStupa,
  activeIncenseCount,
  latestMemorial = null,
  onMoveLocal,
  onSitCushion,
  onSitBench,
  onTriggerInteractable,
  onKitchenMealClick,
  onSelectGardenPlot,
  onInspectPrecepts,
  onLoadProgress,
  onReady,
}: TempleFirstPersonViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [zoneName, setZoneName] = useState<string>(() =>
    getZoneName(initialPosition?.x ?? 960, initialPosition?.y ?? 1040)
  );
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [nearbyPrompt, setNearbyPrompt] = useState<{
    label: string;
    onActivate: () => void;
  } | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const me = room.players.find((p) => p.userId === currentUserId);
  const seedPos = livePositionRef?.current ?? initialPosition;
  const startX = seedPos?.x ?? me?.x ?? 960;
  const startY = seedPos?.y ?? me?.y ?? 1040;
  const startDir = seedPos?.direction ?? me?.direction ?? 'up';

  const localPosRef = useRef({
    x: startX,
    y: startY,
    yaw: directionToYaw(startDir),
    pitch: viewingStupa ? -0.28 : -0.04,
    pose: (me?.pose ?? 'idle') as PlayerPose,
    direction: startDir as Direction,
  });

  const keysRef = useRef<Set<string>>(new Set());
  const joyInputRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const joyKnobRef = useRef<HTMLDivElement | null>(null);
  const walkRef = useRef<ActiveWalkState | null>(null);
  const activeRitualRef = useRef<ActiveRitualState | null>(null);
  const lastHandledRitualIdRef = useRef<number | null>(ritualRequest?.id ?? null);
  const world3DRef = useRef<TempleWorld3DHandles | null>(null);
  const isViewActiveRef = useRef(isViewActive);
  isViewActiveRef.current = isViewActive;
  const atmospherePrefRef = useRef<AtmospherePreference | undefined>(atmospherePref);
  atmospherePrefRef.current = atmospherePref;
  const fovTargetRef = useRef(fovDeg);
  fovTargetRef.current = fovDeg;
  const onFovChangeRef = useRef(onFovChange);
  onFovChangeRef.current = onFovChange;
  const viewingStupaRef = useRef(viewingStupa);
  viewingStupaRef.current = viewingStupa;
  const prevViewingStupaRef = useRef(viewingStupa);
  const onExitStupaRef = useRef(onExitStupa);
  onExitStupaRef.current = onExitStupa;
  const activeIncenseRef = useRef(activeIncenseCount ?? Math.min(2, Math.max(1, room.incenseCount)));
  activeIncenseRef.current = activeIncenseCount ?? Math.min(2, Math.max(1, room.incenseCount));
  const latestMemorialRef = useRef(latestMemorial);
  latestMemorialRef.current = latestMemorial;

  const roomRef = useRef(room);
  roomRef.current = room;
  const effectsRef = useRef(effects);
  effectsRef.current = effects;
  const lowResRef = useRef(lowResourceMode);
  lowResRef.current = lowResourceMode;
  const onMoveLocalRef = useRef(onMoveLocal);
  onMoveLocalRef.current = onMoveLocal;
  const onSitCushionRef = useRef(onSitCushion);
  onSitCushionRef.current = onSitCushion;
  const onSitBenchRef = useRef(onSitBench);
  onSitBenchRef.current = onSitBench;
  const onTriggerInteractableRef = useRef(onTriggerInteractable);
  onTriggerInteractableRef.current = onTriggerInteractable;
  const onKitchenMealClickRef = useRef(onKitchenMealClick);
  onKitchenMealClickRef.current = onKitchenMealClick;
  const kitchenMealsRef = useRef(kitchenMeals);
  kitchenMealsRef.current = kitchenMeals;
  const onSelectGardenPlotRef = useRef(onSelectGardenPlot);
  onSelectGardenPlotRef.current = onSelectGardenPlot;
  const onInspectPreceptsRef = useRef(onInspectPrecepts);
  onInspectPreceptsRef.current = onInspectPrecepts;
  const onLoadProgressRef = useRef(onLoadProgress);
  onLoadProgressRef.current = onLoadProgress;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Sync position cleanly when ascending to / descending from the 9th-tier Bảo Tháp Observation Deck
  useEffect(() => {
    const wasViewing = prevViewingStupaRef.current;
    prevViewingStupaRef.current = viewingStupa;
    if (viewingStupa && !wasViewing) {
      const slotIdx =
        me?.stupaSlot !== null && me?.stupaSlot !== undefined && me.stupaSlot >= 0
          ? me.stupaSlot
          : Math.max(0, roomRef.current.stupaSlots.indexOf(currentUserId));
      const slotPos = STUPA_DECK_SLOTS[Math.min(STUPA_DECK_SLOTS.length - 1, Math.max(0, slotIdx))];
      walkRef.current = null;
      activeRitualRef.current = null;
      localPosRef.current.x = slotPos.x;
      localPosRef.current.y = slotPos.y;
      localPosRef.current.direction = 'down';
      localPosRef.current.pose = 'idle';
      localPosRef.current.yaw = directionToYaw('down');
      localPosRef.current.pitch = -0.28;
      if (livePositionRef) {
        livePositionRef.current = { x: slotPos.x, y: slotPos.y, direction: 'down' };
      }
    } else if (!viewingStupa && wasViewing) {
      walkRef.current = null;
      activeRitualRef.current = null;
      localPosRef.current.x = INTERACTABLES.stupa.x;
      localPosRef.current.y = INTERACTABLES.stupa.y;
      localPosRef.current.direction = 'down';
      localPosRef.current.pose = 'idle';
      localPosRef.current.yaw = directionToYaw('down');
      localPosRef.current.pitch = -0.04;
      if (livePositionRef) {
        livePositionRef.current = {
          x: INTERACTABLES.stupa.x,
          y: INTERACTABLES.stupa.y,
          direction: 'down',
        };
      }
    }
  }, [viewingStupa, me?.stupaSlot, currentUserId, livePositionRef]);

  // Sync cushion or stone bench seating cleanly without snapping while walking
  useEffect(() => {
    if (!me) return;
    if (me.cushionIndex !== null || (me.benchIndex !== null && me.benchIndex !== undefined)) {
      if (walkRef.current || activeRitualRef.current || localPosRef.current.pose === 'walk') return;
      localPosRef.current.x = me.x;
      localPosRef.current.y = me.y;
      localPosRef.current.pose = me.pose;
      if (me.benchIndex !== null && me.benchIndex !== undefined) {
        localPosRef.current.yaw = directionToYaw('down');
        localPosRef.current.pitch = -0.06;
      } else {
        localPosRef.current.yaw = directionToYaw('up');
      }
    }
  }, [me?.cushionIndex, me?.benchIndex, me?.x, me?.y, me?.pose]);

  const startRitualSequence = (
    action: RitualAction,
    mealTarget?: 'food' | 'drink',
    mealId?: string
  ) => {
    const spot = getRitualStandSpot(action);
    const visualTarget = getRitualVisualTarget(action);
    const local = localPosRef.current;
    const target3D = world2DTo3D(visualTarget.lookX, visualTarget.lookY);
    const spot3D = world2DTo3D(spot.x, spot.y);
    const dx3 = target3D.x - spot3D.x;
    const dz3 = target3D.z - spot3D.z;
    const faceYaw =
      Math.hypot(dx3, dz3) < 0.08
        ? directionToYaw(spot.faceDir)
        : Math.atan2(-dx3, -dz3);
    const facePitch = visualTarget.pitch;

    const dist = Math.hypot(local.x - spot.x, local.y - spot.y);
    if (
      dist <= 12 &&
      me?.cushionIndex === null &&
      (me?.benchIndex === null || me?.benchIndex === undefined)
    ) {
      walkRef.current = null;
      local.x = spot.x;
      local.y = spot.y;
      local.direction = spot.faceDir;
      local.pose = 'pray';
      activeRitualRef.current = {
        action,
        phase: 'perform',
        startedPerformAt: performance.now(),
        faceYaw,
        facePitch,
        mealTarget,
        mealId,
      };
      onMoveLocalRef.current(Math.round(local.x), Math.round(local.y), spot.faceDir, 'pray');
      return;
    }

    const waypoints = buildWalkWaypoints(local.x, local.y, spot.x, spot.y);
    const firstWp = waypoints[0] ?? { x: spot.x, y: spot.y };
    activeRitualRef.current = {
      action,
      phase: 'walk',
      startedPerformAt: 0,
      faceYaw,
      facePitch,
      mealTarget,
      mealId,
    };
    walkRef.current = {
      targetX: firstWp.x,
      targetY: firstWp.y,
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
          faceYaw,
          facePitch,
          mealTarget,
          mealId,
        };
        onMoveLocalRef.current(Math.round(cur.x), Math.round(cur.y), spot.faceDir, 'pray');
      },
    };
  };

  const startRitualRef = useRef(startRitualSequence);
  startRitualRef.current = startRitualSequence;

  const walkToGardenPlot = (plotIndex: number) => {
    const plotPos = GARDEN_PLOT_POSITIONS[plotIndex];
    if (!plotPos) return;
    const local = localPosRef.current;
    if (Math.hypot(local.x - plotPos.x, local.y - plotPos.y) <= 46) {
      onSelectGardenPlotRef.current?.(plotIndex);
      return;
    }
    const standX = plotPos.x;
    const standY = plotPos.y + 28;
    const waypoints = buildWalkWaypoints(local.x, local.y, standX, standY);
    const firstWp = waypoints[0] ?? { x: standX, y: standY };
    activeRitualRef.current = null;
    walkRef.current = {
      targetX: firstWp.x,
      targetY: firstWp.y,
      waypoints: waypoints.slice(1),
      createdAt: performance.now(),
      pendingAction: () => {
        onSelectGardenPlotRef.current?.(plotIndex);
      },
    };
  };
  const walkToGardenPlotRef = useRef(walkToGardenPlot);
  walkToGardenPlotRef.current = walkToGardenPlot;

  useEffect(() => {
    if (!ritualRequest) return;
    if (lastHandledRitualIdRef.current === ritualRequest.id) return;
    lastHandledRitualIdRef.current = ritualRequest.id;
    startRitualRef.current(ritualRequest.action);
  }, [ritualRequest]);

  useEffect(() => {
    world3DRef.current?.updateGardenPlots3D(room.gardenPlots);
  }, [room.gardenPlots]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const hasGrowing = roomRef.current.gardenPlots.some(
        (p) => p.species !== 'none' && getEffectiveFlowerStage(p) < 3
      );
      if (hasGrowing) {
        world3DRef.current?.updateGardenPlots3D(roomRef.current.gardenPlots);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    world3DRef.current?.updatePondLanterns3D(room.lanterns);
  }, [room.lanterns]);

  useEffect(() => {
    world3DRef.current?.updateTreeWishes3D(room.wishes);
  }, [room.wishes]);

  useEffect(() => {
    world3DRef.current?.updateKitchenMeal3D(kitchenMeals);
  }, [kitchenMeals]);

  useEffect(() => {
    world3DRef.current?.updateCourtIncenseSticks3D(
      activeIncenseCount ?? Math.min(2, Math.max(1, room.incenseCount))
    );
  }, [activeIncenseCount, room.incenseCount]);

  useEffect(() => {
    if (!latestMemorial) {
      world3DRef.current?.updateMemorialBanner3D(null);
      return;
    }
    world3DRef.current?.updateMemorialBanner3D(latestMemorial.deceasedName);
  }, [latestMemorial]);

  // Main Three.js Scene Setup & Loop (staged across frames so UI progress bar stays responsive)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frameId = 0;
    let ro: ResizeObserver | null = null;
    let cleanupRenderer: THREE.WebGLRenderer | null = null;
    let cleanupEnvTex: THREE.Texture | null = null;
    let cleanupTextures: ReturnType<typeof createTempleTextures> | null = null;
    let cleanupWorld3D: TempleWorld3DHandles | null = null;
    let cleanupAtmosphere3D: Atmosphere3DHandle | null = null;
    let cleanupFpRig: ReturnType<typeof createFirstPersonRitualRig> | null = null;
    let cleanupScene: THREE.Scene | null = null;
    const remoteRigs = new Map<string, RemotePlayerRig3D>();

    let removeListeners: (() => void) | null = null;

    const yieldFrame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

    (async () => {
      onLoadProgressRef.current?.(14);
      await yieldFrame();
      if (disposed) return;

      const isSoftwareGl = detectSoftwareWebGL();
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
        });
        cleanupRenderer = renderer;
      } catch {
        setWebglError('Thiết bị chưa hỗ trợ WebGL 3D. Vui lòng chuyển sang chế độ Toàn cảnh.');
        onLoadProgressRef.current?.(100);
        onReadyRef.current?.();
        return;
      }

      const width = Math.max(320, mount.clientWidth || window.innerWidth);
      const height = Math.max(360, mount.clientHeight || window.innerHeight);

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setWebglError('Kết nối đồ họa 3D tạm gián đoạn.');
      };
      const handleContextRestored = () => {
        setWebglError(null);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const scene = new THREE.Scene();
      cleanupScene = scene;
      const skyBgColor = new THREE.Color(0xcde2ea);
      scene.background = skyBgColor;
      const sceneFog = new THREE.FogExp2(0xd6e6ea, 0.0115);
      scene.fog = sceneFog;

      const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 460);
      camera.rotation.order = 'YXZ';
      scene.add(camera);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      cleanupEnvTex = envTex;
      scene.environment = envTex;
      pmremGenerator.dispose();

      // Dynamic Day/Night Sun & Hemisphere Fill
      const hemiLight = new THREE.HemisphereLight(0xd9effc, 0x62744a, 0.85);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfff0cc, 1.55);
      sunLight.position.set(22, 34, 18);
      if (!isSoftwareGl) {
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(1024, 1024);
        sunLight.shadow.camera.left = -38;
        sunLight.shadow.camera.right = 38;
        sunLight.shadow.camera.top = 38;
        sunLight.shadow.camera.bottom = -38;
        sunLight.shadow.camera.near = 2;
        sunLight.shadow.camera.far = 95;
        sunLight.shadow.bias = -0.0005;
        sunLight.shadow.normalBias = 0.02;
      }
      scene.add(sunLight);

      const fillLight = new THREE.DirectionalLight(0xbbe0f5, 0.42);
      fillLight.position.set(-20, 14, -18);
      scene.add(fillLight);

      // Warm Evening/Night Temple Illumination at Courtyard & Ao Sen Bridge
      const nightCourtyardLight = new THREE.PointLight(0xffb866, 0, 26, 1.3);
      const courtyard3 = world2DTo3D(960, 560);
      nightCourtyardLight.position.set(courtyard3.x, 3.8, courtyard3.z);
      scene.add(nightCourtyardLight);

      const nightPondLight = new THREE.PointLight(0xffbe74, 0, 22, 1.35);
      const pond3 = world2DTo3D(455, 690);
      nightPondLight.position.set(pond3.x, 2.8, pond3.z);
      scene.add(nightPondLight);

      const atmosphere3D = createAtmosphere3D(isSoftwareGl);
      cleanupAtmosphere3D = atmosphere3D;
      scene.add(atmosphere3D.group);

      onLoadProgressRef.current?.(35);
      await yieldFrame();
      if (disposed) return;

      const textures = createTempleTextures(renderer.capabilities.getMaxAnisotropy());
      cleanupTextures = textures;
      onLoadProgressRef.current?.(56);
      await yieldFrame();
      if (disposed) return;

      const world3D = buildTempleWorld3D(
        textures,
        activeIncenseRef.current,
        isSoftwareGl
      );
      cleanupWorld3D = world3D;
      world3D.updateCourtIncenseSticks3D(activeIncenseRef.current);
      if (latestMemorialRef.current) {
        world3D.updateMemorialBanner3D(latestMemorialRef.current.deceasedName);
      }
      world3D.updateGardenPlots3D(roomRef.current.gardenPlots);
      world3D.updatePondLanterns3D(roomRef.current.lanterns);
      world3D.updateTreeWishes3D(roomRef.current.wishes);
      world3D.updateKitchenMeal3D(kitchenMealsRef.current);
      world3DRef.current = world3D;
      scene.add(world3D.root);

      // First-person animated hands/ritual prop rig mounted to camera
      const fpRig = createFirstPersonRitualRig();
      cleanupFpRig = fpRig;
      camera.add(fpRig.group);

      onLoadProgressRef.current?.(78);
      await yieldFrame();
      if (disposed) return;

      const initPos = localPosRef.current;
      const initPos3 = world2DTo3D(initPos.x, initPos.y);
      const initEyeY = viewingStupaRef.current
        ? STUPA_DECK_Y_3D + 1.56
        : getEyeHeightForPose(initPos.x, initPos.y, false);
      camera.position.set(initPos3.x, initEyeY, initPos3.z);
      camera.rotation.set(initPos.pitch, initPos.yaw, 0, 'YXZ');

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
      onLoadProgressRef.current?.(92);
      await yieldFrame();
      if (disposed) return;

      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();

    // Drag-to-Look, Pinch/Wheel Zoom & Tap-to-Interact on 3D Canvas
    let dragging = false;
    let dragDist = 0;
    let lastPtrX = 0;
    let lastPtrY = 0;
    let activePtrId: number | null = null;
    const activePointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;

    const onPointerDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size >= 2) {
        dragging = false;
        activePtrId = null;
        const pts = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return;
      }
      if (activePtrId !== null) return;
      activePtrId = e.pointerId;
      dragging = true;
      dragDist = 0;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (activePointers.size >= 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDist > 0) {
          const delta = dist - lastPinchDist;
          const nextFov = THREE.MathUtils.clamp(fovTargetRef.current - delta * 0.14, 28, 90);
          fovTargetRef.current = nextFov;
          onFovChangeRef.current?.(Math.round(nextFov));
        }
        lastPinchDist = dist;
        return;
      }
      if (!dragging || e.pointerId !== activePtrId) return;
      const dx = e.clientX - lastPtrX;
      const dy = e.clientY - lastPtrY;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      dragDist += Math.hypot(dx, dy);

      const sensitivity = 0.0042 * (fovTargetRef.current / 62);
      const minPitch = viewingStupaRef.current ? -1.32 : -1.08;
      localPosRef.current.yaw -= dx * sensitivity;
      localPosRef.current.pitch = THREE.MathUtils.clamp(
        localPosRef.current.pitch - dy * sensitivity,
        minPitch,
        0.96
      );
      localPosRef.current.direction = yawToDirection(localPosRef.current.yaw);
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        lastPinchDist = 0;
      }
      if (e.pointerId !== activePtrId) return;
      activePtrId = null;
      dragging = false;

      if (viewingStupaRef.current) return;

      // Tap (minimal drag) raycasts onto 3D temple objects
      if (dragDist < 10) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(world3D.clickables, true);
        if (hits.length > 0) {
          const meta = hits[0].object.userData as {
            kind?: 'interactable' | 'cushion' | 'bench' | 'garden_plot' | 'precepts_stele';
            action?: RitualAction;
            mealTarget?: 'food' | 'drink';
            mealId?: string;
            index?: number;
            benchIndex?: number;
          };
          if (meta.kind === 'garden_plot' && typeof meta.index === 'number') {
            walkToGardenPlotRef.current(meta.index);
          } else if (meta.kind === 'precepts_stele') {
            onInspectPreceptsRef.current?.();
          } else if (meta.kind === 'interactable' && meta.action) {
            startRitualRef.current(meta.action, meta.mealTarget, meta.mealId);
          } else if (meta.kind === 'cushion' && typeof meta.index === 'number') {
            onSitCushionRef.current(meta.index);
          } else if (meta.kind === 'bench' && typeof meta.benchIndex === 'number') {
            onSitBenchRef.current(meta.benchIndex);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!isViewActiveRef.current) return;
      e.preventDefault();
      const nextFov = THREE.MathUtils.clamp(fovTargetRef.current + e.deltaY * 0.032, 28, 90);
      fovTargetRef.current = nextFov;
      onFovChangeRef.current?.(Math.round(nextFov));
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // Keyboard controls
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isViewActiveRef.current) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' && viewingStupaRef.current) {
        onExitStupaRef.current?.();
        return;
      }
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'j', 'l'].includes(k)) {
        e.preventDefault();
        keysRef.current.add(k);
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].includes(k)) {
          walkRef.current = null;
          activeRitualRef.current = null;
        }
      }
      if (k === 'e' && !viewingStupaRef.current) {
        if (activeRitualRef.current?.phase === 'perform') return;
        const nearby = findNearbyInteraction(localPosRef.current.x, localPosRef.current.y);
        if (nearby?.kind === 'garden_plot') {
          walkToGardenPlotRef.current(nearby.plotIndex);
        } else if (nearby?.kind === 'precepts_stele') {
          onInspectPreceptsRef.current?.();
        } else if (nearby?.kind === 'interactable') {
          startRitualRef.current(nearby.action);
        } else if (nearby?.kind === 'cushion') {
          onSitCushionRef.current(nearby.cushionIndex);
        } else if (nearby?.kind === 'bench') {
          onSitBenchRef.current(nearby.benchIndex);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!mount) return;
      const nw = Math.max(320, mount.clientWidth || window.innerWidth);
      const nh = Math.max(360, mount.clientHeight || window.innerHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    ro = new ResizeObserver(onResize);
    ro.observe(mount);
    window.addEventListener('resize', onResize);

    removeListeners = () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
    };

    // Main 3D Render & Simulation Loop
    let lastTime = performance.now();
    let lastNetSent = 0;
    let lastHudCheck = 0;
    let smoothEyeY = initEyeY;
    let smoothFeedPull = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const local = localPosRef.current;
      const keys = keysRef.current;

      let moved = false;
      let nextPose: PlayerPose = local.pose;

      if (!isViewActiveRef.current) {
        // Mirror exact 2D position & direction while 3D finishes loading in background
        if (livePositionRef?.current) {
          local.x = livePositionRef.current.x;
          local.y = livePositionRef.current.y;
          local.direction = livePositionRef.current.direction;
          local.yaw = directionToYaw(livePositionRef.current.direction);
          local.pose = 'idle';
          nextPose = 'idle';
        }
      } else {
        // Keyboard yaw turning (Left/Right arrows or Q/J/L)
        let yawDelta = 0;
        if (keys.has('arrowleft') || keys.has('q') || keys.has('j')) yawDelta += 1;
        if (keys.has('arrowright') || keys.has('l')) yawDelta -= 1;
        if (yawDelta !== 0) {
          local.yaw += yawDelta * 1.9 * dt;
        }

        // Compute forward/strafe input from keyboard + virtual touch joystick
        let forward = joyInputRef.current.dy; // +1 forward
        let strafe = joyInputRef.current.dx; // +1 right
        if (keys.has('w') || keys.has('arrowup')) forward += 1;
        if (keys.has('s') || keys.has('arrowdown')) forward -= 1;
        if (keys.has('d')) strafe += 1;
        if (keys.has('a')) strafe -= 1;

        const hasManualMove = Math.abs(forward) > 0.08 || Math.abs(strafe) > 0.08;

        if (viewingStupaRef.current) {
          walkRef.current = null;
          activeRitualRef.current = null;
          if (hasManualMove) {
            const mag = Math.max(1, Math.hypot(forward, strafe));
            const nf = forward / mag;
            const ns = strafe / mag;
            const dirX2d = -Math.sin(local.yaw);
            const dirY2d = -Math.cos(local.yaw);
            const rightX2d = Math.cos(local.yaw);
            const rightY2d = -Math.sin(local.yaw);
            const deckSpeed = 115;
            const rawX = local.x + (dirX2d * nf + rightX2d * ns) * deckSpeed * dt;
            const rawY = local.y + (dirY2d * nf + rightY2d * ns) * deckSpeed * dt;
            local.x = THREE.MathUtils.clamp(
              rawX,
              STUPA_SPEC.cx - STUPA_DECK_WALK_HALF,
              STUPA_SPEC.cx + STUPA_DECK_WALK_HALF
            );
            local.y = THREE.MathUtils.clamp(
              rawY,
              STUPA_SPEC.cy - STUPA_DECK_WALK_HALF,
              STUPA_SPEC.cy + STUPA_DECK_WALK_HALF
            );
            nextPose = 'walk';
            moved = true;
          } else if (local.pose === 'walk') {
            nextPose = 'idle';
            moved = true;
          } else {
            nextPose = 'idle';
          }
        } else if (hasManualMove) {
          walkRef.current = null;
          activeRitualRef.current = null;
          const mag = Math.max(1, Math.hypot(forward, strafe));
          const nf = forward / mag;
          const ns = strafe / mag;

          // Forward direction in 2D world coordinates corresponding to camera yaw
          const dirX2d = -Math.sin(local.yaw);
          const dirY2d = -Math.cos(local.yaw);
          const rightX2d = Math.cos(local.yaw);
          const rightY2d = -Math.sin(local.yaw);

          const speed = 195;
          const rawX = local.x + (dirX2d * nf + rightX2d * ns) * speed * dt;
          const rawY = local.y + (dirY2d * nf + rightY2d * ns) * speed * dt;
          const resolved = resolveWalkPosition(local.x, local.y, rawX, rawY);
          local.x = resolved.x;
          local.y = resolved.y;
          nextPose = 'walk';
          moved = true;
        } else if (activeRitualRef.current?.phase === 'perform') {
          const activeRitual = activeRitualRef.current;
          const performDur = activeRitual.action === 'bow' ? 1250 : 950;
          const bowT = Math.min(1, (now - activeRitual.startedPerformAt) / performDur);
          const bowCurve = activeRitual.action === 'bow' ? Math.sin(bowT * Math.PI) : 0;
          local.yaw += shortestAngleDiff(local.yaw, activeRitual.faceYaw) * Math.min(1, dt * 16);
          const targetPitch =
            activeRitual.action === 'bow'
              ? activeRitual.facePitch - bowCurve * 0.44
              : activeRitual.facePitch;
          local.pitch += (targetPitch - local.pitch) * Math.min(1, dt * 10);
          nextPose = 'pray';
          if (now - activeRitual.startedPerformAt >= performDur) {
            const completed = activeRitual.action;
            const mealTarget = activeRitual.mealTarget;
            const mealId = activeRitual.mealId;
            activeRitualRef.current = null;
            nextPose = 'idle';
            moved = true;
            if (completed === 'kitchen_table' && mealTarget && onKitchenMealClickRef.current) {
              onKitchenMealClickRef.current(mealTarget, mealId);
            } else {
              onTriggerInteractableRef.current(completed);
            }
          }
      } else if (walkRef.current) {
        const wTarget = walkRef.current;
        const dx = wTarget.targetX - local.x;
        const dy = wTarget.targetY - local.y;
        const dist = Math.hypot(dx, dy);

        // Gently turn first-person view toward walk path, pre-aligning onto ritual target near arrival
        const targetPos3 = world2DTo3D(wTarget.targetX, wTarget.targetY);
        const curPos3 = world2DTo3D(local.x, local.y);
        if (dist > 6) {
          const walkYaw = Math.atan2(-(targetPos3.x - curPos3.x), -(targetPos3.z - curPos3.z));
          const actRitual = activeRitualRef.current;
          if (actRitual?.phase === 'walk' && wTarget.waypoints.length === 0 && dist < 44) {
            const blend = 1 - dist / 44;
            const desiredYaw = walkYaw + shortestAngleDiff(walkYaw, actRitual.faceYaw) * blend;
            local.yaw += shortestAngleDiff(local.yaw, desiredYaw) * Math.min(1, dt * 8);
            local.pitch += (actRitual.facePitch - local.pitch) * Math.min(1, dt * 5 * blend);
          } else {
            local.yaw += shortestAngleDiff(local.yaw, walkYaw) * Math.min(1, dt * 4.5);
          }
        }

        if (dist <= 7) {
          const resolved = resolveWalkPosition(local.x, local.y, wTarget.targetX, wTarget.targetY);
          local.x = resolved.x;
          local.y = resolved.y;
          if (wTarget.waypoints.length > 0) {
            const [nextWp, ...rest] = wTarget.waypoints;
            walkRef.current = {
              targetX: nextWp.x,
              targetY: nextWp.y,
              waypoints: rest,
              createdAt: now,
              pendingAction: wTarget.pendingAction,
            };
            nextPose = 'walk';
            moved = true;
          } else {
            const pending = wTarget.pendingAction;
            walkRef.current = null;
            nextPose = 'idle';
            moved = true;
            if (pending) {
              pending();
              nextPose = local.pose;
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
          nextPose = 'walk';
          moved = true;
          if (actualMove < 0.35 && now - wTarget.createdAt > 180) {
            if (wTarget.waypoints.length > 0) {
              const [nextWp, ...rest] = wTarget.waypoints;
              walkRef.current = {
                targetX: nextWp.x,
                targetY: nextWp.y,
                waypoints: rest,
                createdAt: now,
                pendingAction: wTarget.pendingAction,
              };
            } else {
              const pending = wTarget.pendingAction;
              walkRef.current = null;
              nextPose = 'idle';
              if (pending && Math.hypot(wTarget.targetX - local.x, wTarget.targetY - local.y) < 75) {
                pending();
                nextPose = local.pose;
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
      } // end if (isViewActiveRef.current)

      const selfPlayer = roomRef.current.players.find((p) => p.userId === currentUserId);
      const isMeditating = selfPlayer?.cushionIndex !== null && nextPose === 'meditate';
      const isSeatedBench =
        selfPlayer?.benchIndex !== null &&
        selfPlayer?.benchIndex !== undefined &&
        nextPose === 'sit';
      local.pose = nextPose;
      local.direction = yawToDirection(local.yaw);

      if (isViewActiveRef.current) {
        if (livePositionRef) {
          livePositionRef.current = { x: local.x, y: local.y, direction: local.direction };
        }

        if (moved && (now - lastNetSent > 90 || nextPose === 'idle' || nextPose === 'pray')) {
          lastNetSent = now;
          onMoveLocalRef.current(Math.round(local.x), Math.round(local.y), local.direction, nextPose);
        }
      }

      // Smooth camera zoom (FOV) & First-Person / Bảo Tháp Summit Overlook Camera
      if (Math.abs(camera.fov - fovTargetRef.current) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, fovTargetRef.current, 12, dt);
        camera.updateProjectionMatrix();
      }

      if (viewingStupaRef.current) {
        fpRig.group.visible = false;
        const pos3 = world2DTo3D(local.x, local.y);
        const targetEyeY = STUPA_DECK_Y_3D + 1.56;
        if (Math.abs(smoothEyeY - targetEyeY) > 6) {
          smoothEyeY = targetEyeY;
          camera.position.set(pos3.x, targetEyeY, pos3.z);
        } else {
          smoothEyeY = THREE.MathUtils.damp(smoothEyeY, targetEyeY, 12, dt);
          const walkBob = nextPose === 'walk' && !lowResRef.current ? Math.sin(now * 0.013) * 0.035 : 0;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, pos3.x, 14, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, pos3.z, 14, dt);
          camera.position.y = smoothEyeY + walkBob;
        }
        camera.rotation.y = local.yaw;
        camera.rotation.x = local.pitch;
      } else {
        fpRig.group.visible = true;
        const pos3 = world2DTo3D(local.x, local.y);
        const isBowing =
          activeRitualRef.current?.phase === 'perform' && activeRitualRef.current.action === 'bow';
        const bowDrop = isBowing
          ? Math.sin(Math.min(1, (now - activeRitualRef.current!.startedPerformAt) / 1250) * Math.PI) * 0.34
          : 0;
        const baseEyeY = isSeatedBench
          ? getGroundElevation3D(local.x, local.y) + 1.12
          : getEyeHeightForPose(local.x, local.y, isMeditating);
        const targetEyeY = baseEyeY - bowDrop;
        if (Math.abs(smoothEyeY - targetEyeY) > 6) {
          smoothEyeY = targetEyeY;
          camera.position.set(pos3.x, targetEyeY, pos3.z);
        } else {
          smoothEyeY = THREE.MathUtils.damp(smoothEyeY, targetEyeY, 14, dt);
          const walkBob = nextPose === 'walk' && !lowResRef.current ? Math.sin(now * 0.013) * 0.045 : 0;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, pos3.x, 16, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, pos3.z, 16, dt);
          camera.position.y = smoothEyeY + walkBob;
        }
        camera.rotation.y = local.yaw;
        camera.rotation.x = local.pitch;
      }

      // Update First-Person Held Ritual Props during perform phase
      const perfAction = !viewingStupaRef.current && activeRitualRef.current?.phase === 'perform' ? activeRitualRef.current.action : null;
      fpRig.incenseStick.visible = perfAction === 'incense';
      fpRig.broom.visible = perfAction === 'sweep';
      fpRig.fishBasin.visible = perfAction === 'fish';
      fpRig.mallet.visible = perfAction === 'woodfish';
      fpRig.fortuneTube.visible = perfAction === 'fortune';
      fpRig.bellRopeHand.visible = perfAction === 'bell';
      fpRig.wateringCan.visible = perfAction === 'flower';
      fpRig.handLantern.visible = perfAction === 'lantern';
      fpRig.koiCup.visible = perfAction === 'feed_koi' || perfAction === 'feed_birds';
      fpRig.handWishRibbon.visible = perfAction === 'wish';
      fpRig.prayerHands.visible = perfAction === 'bow' || perfAction === 'kitchen_table';
      fpRig.washBrush.visible = perfAction === 'kitchen_sink';
      if (perfAction === 'sweep') {
        fpRig.broom.rotation.y = Math.sin(now * 0.018) * 0.35;
      } else if (perfAction === 'fish') {
        fpRig.fishBasin.rotation.x = -0.25 + Math.sin(now * 0.01) * 0.15;
      } else if (perfAction === 'woodfish') {
        fpRig.mallet.rotation.x = -Math.abs(Math.sin(now * 0.02)) * 0.35;
      } else if (perfAction === 'fortune') {
        fpRig.fortuneTube.position.y = Math.sin(now * 0.03) * 0.04;
      } else if (perfAction === 'bell') {
        fpRig.bellRopeHand.position.z = Math.sin(now * 0.016) * 0.08;
      } else if (perfAction === 'flower') {
        fpRig.wateringCan.rotation.x = -0.28 + Math.sin(now * 0.012) * 0.12;
      } else if (perfAction === 'lantern') {
        fpRig.handLantern.position.y = Math.sin(now * 0.01) * 0.03;
      } else if (perfAction === 'feed_koi' || perfAction === 'feed_birds') {
        fpRig.koiCup.rotation.x = -0.35 + Math.sin(now * 0.022) * 0.2;
      } else if (perfAction === 'wish') {
        fpRig.handWishRibbon.position.y = Math.sin(now * 0.015) * 0.05;
        fpRig.handWishRibbon.rotation.z = Math.sin(now * 0.02) * 0.16;
      } else if (perfAction === 'bow') {
        fpRig.prayerHands.position.y = Math.sin(now * 0.008) * 0.025;
      } else if (perfAction === 'kitchen_sink') {
        fpRig.washBrush.rotation.z = Math.sin(now * 0.02) * 0.22;
      }

      // Animate 3D Koi Fish School inside Ao Sen (smoothly gliding toward pellets when feeding)
      const sec = now * 0.001;
      const curEffects = effectsRef.current;
      const feedEf = curEffects.find((e) => e.kind === 'feed_koi' && now - e.createdAt < 9000);
      const rawFeedPull = feedEf ? Math.sin(Math.min(1, (now - feedEf.createdAt) / 9000) * Math.PI) : 0;
      smoothFeedPull += (rawFeedPull - smoothFeedPull) * Math.min(1, dt * 2.5);
      world3D.koiPelletGroup.visible = Boolean(feedEf);
      const feedOrigin3 = world2DTo3D(POND_SPEC.cx, 635);

      for (const koi of world3D.koiSchool) {
        const effectiveSpeed = koi.speed * (1 + smoothFeedPull * 0.32);
        koi.phase += dt * effectiveSpeed;
        const t = koi.phase;
        const ox = koi.originX + (feedOrigin3.x - koi.originX) * smoothFeedPull * 0.52;
        const oz = koi.originZ + (feedOrigin3.z - koi.originZ) * smoothFeedPull * 0.55;
        const rx = koi.rx * (1 - smoothFeedPull * 0.35);
        const rz = koi.rz * (1 - smoothFeedPull * 0.3);
        const nx = ox + Math.cos(t) * rx;
        const nz = oz + Math.sin(t * 2) * rz;
        const vx = -Math.sin(t) * rx * effectiveSpeed;
        const vz = Math.cos(t * 2) * 2 * rz * effectiveSpeed;
        koi.group.position.set(nx, koi.depthY + Math.sin(sec * 2 + koi.phase) * 0.012, nz);
        koi.group.rotation.y = Math.atan2(-vz, vx);
        koi.tail.rotation.y = Math.sin(sec * (6 + smoothFeedPull * 2.2) + koi.phase) * 0.4;
        koi.pectoralL.rotation.y = 0.5 + Math.sin(sec * 5 + koi.phase) * 0.18;
        koi.pectoralR.rotation.y = -0.5 - Math.sin(sec * 5 + koi.phase) * 0.18;
      }

      // Animate Doves & Sparrows above Dàn Hoa Giấy Hồng (swooping down to eat seeds during feed_birds)
      const feedBirdsEf = curEffects.find((e) => e.kind === 'feed_birds' && now - e.createdAt < 11500);
      const birdFeedAge = feedBirdsEf ? (now - feedBirdsEf.createdAt) / 1000 : -1;
      world3D.birdSeedsGroup.visible = birdFeedAge >= 0.25 && birdFeedAge <= 9.4;
      if (world3D.birdSeedsGroup.visible) {
        const appearScale = Math.min(1, (birdFeedAge - 0.25) / 0.45);
        world3D.birdSeedsGroup.children.forEach((seedMesh, sIdx) => {
          const eatStart = 2.0 + ((sIdx * 7) % 12) * 0.56;
          const eatProgress = Math.max(0, Math.min(1, (birdFeedAge - eatStart) / 0.65));
          const s = Math.max(0.001, appearScale * (1 - eatProgress));
          seedMesh.visible = s > 0.05;
          seedMesh.scale.set(1.35 * s, 0.65 * s, 0.9 * s);
        });
      }
      const birdSmoothStep = (v: number) => {
        const c = Math.max(0, Math.min(1, v));
        return c * c * (3 - 2 * c);
      };
      for (let bIdx = 0; bIdx < world3D.bougainvilleaBirds.length; bIdx++) {
        const bird = world3D.bougainvilleaBirds[bIdx];
        const t = sec * bird.speed + bird.phase;
        const orbitX = bird.originX + Math.cos(t) * bird.rx;
        const orbitZ = bird.originZ + Math.sin(t * 2) * bird.rz * 0.55;
        const orbitY = bird.baseY + Math.sin(sec * 2.1 + bird.phase) * 0.28;
        const orbitVx = -Math.sin(t) * bird.rx * bird.speed;
        const orbitVz = Math.cos(t * 2) * 2 * bird.rz * 0.55 * bird.speed;

        let swoopFactor = 0;
        if (birdFeedAge >= 0 && birdFeedAge < 11.5) {
          const enter = birdSmoothStep((birdFeedAge - bird.stagger) / 1.35);
          const exit = birdSmoothStep((birdFeedAge - (8.8 + bird.stagger * 0.5)) / 1.55);
          swoopFactor = Math.max(0, enter * (1 - exit));
        }

        const hopTime = Math.max(0, birdFeedAge - 1.3 - bird.stagger);
        const hopY = swoopFactor > 0.72 ? Math.abs(Math.sin(hopTime * 6.5 + bIdx)) * 0.09 : 0;
        const gx = bird.landX + Math.sin(hopTime * 1.4 + bIdx) * 0.16;
        const gz = bird.landZ + Math.cos(hopTime * 1.1 + bIdx) * 0.12;
        const gy = 0.14 + hopY;

        const px = THREE.MathUtils.lerp(orbitX, gx, swoopFactor);
        const pz = THREE.MathUtils.lerp(orbitZ, gz, swoopFactor);
        const py = THREE.MathUtils.lerp(orbitY, gy, swoopFactor);
        bird.group.position.set(px, py, pz);

        const targetYaw =
          swoopFactor > 0.82
            ? Math.atan2(world3D.birdSeedsGroup.position.x - gx, world3D.birdSeedsGroup.position.z - gz)
            : Math.atan2(orbitVx, orbitVz);
        bird.group.rotation.y += shortestAngleDiff(bird.group.rotation.y, targetYaw) * Math.min(1, dt * 10);

        const isLanded = swoopFactor > 0.85;
        const flapFreq = bird.kind === 'dove' ? 11.5 : 18.0;
        const flapAngle = isLanded
          ? -0.22 + Math.sin(sec * 20 + bIdx) * 0.08
          : Math.sin(sec * flapFreq + bird.phase) * (bird.kind === 'dove' ? 0.68 : 0.78);
        bird.wingL.rotation.z = -flapAngle;
        bird.wingR.rotation.z = flapAngle;
        bird.group.rotation.x = isLanded
          ? Math.max(0, Math.sin(sec * 12 + bIdx * 2.1)) * 0.35
          : swoopFactor > 0.1 && birdFeedAge < 4
          ? 0.35 * swoopFactor
          : -0.06;
        bird.head.rotation.x = isLanded
          ? Math.max(0, Math.sin(sec * 13 + bIdx * 2.3)) * 0.48
          : 0;
      }

      // Animate Miniature Koi Fish & Cascading Waterfall inside Hòn Non Bộ
      for (const koi of world3D.honNonBoKoi) {
        koi.phase += dt * koi.speed;
        const t = koi.phase;
        const nx = koi.originX + Math.cos(t) * koi.rx;
        const nz = koi.originZ + Math.sin(t * 2) * koi.rz;
        const vx = -Math.sin(t) * koi.rx * koi.speed;
        const vz = Math.cos(t * 2) * 2 * koi.rz * koi.speed;
        koi.group.position.set(nx, koi.depthY + Math.sin(sec * 2.4 + koi.phase) * 0.008, nz);
        koi.group.rotation.y = Math.atan2(-vz, vx);
        koi.tail.rotation.y = Math.sin(sec * 6.5 + koi.phase) * 0.42;
        koi.pectoralL.rotation.y = 0.5 + Math.sin(sec * 5 + koi.phase) * 0.16;
        koi.pectoralR.rotation.y = -0.5 - Math.sin(sec * 5 + koi.phase) * 0.16;
      }
      world3D.honNonBoWaterfall.children.forEach((child, idx) => {
        if (idx === 1) {
          const pulse = 0.85 + Math.sin(sec * 5.2) * 0.25;
          child.scale.set(pulse, pulse, 1);
        } else if (typeof child.userData?.seed === 'number') {
          const cyc = (sec * 1.15 + (child.userData.seed as number)) % 1;
          child.position.y = 2.55 - cyc * 2.18;
          child.position.z = -0.22 + cyc * 0.44;
        }
      });

      // Gently drift/bob floating pond wish lanterns
      for (const lg of world3D.pondLanternsGroup.children) {
        const baseX = (lg.userData.baseX as number) ?? lg.position.x;
        const baseZ = (lg.userData.baseZ as number) ?? lg.position.z;
        const seed = (lg.userData.seed as number) ?? 0;
        lg.position.set(
          baseX + Math.sin(sec * 0.5 + seed) * 0.45,
          0.265 + Math.sin(sec * 2.2 + seed) * 0.015,
          baseZ + Math.cos(sec * 0.42 + seed * 1.3) * 0.28
        );
      }

      // Animate Trees, Bamboo, Smoke, Lantern Flames & Active Effects
      if (!lowResRef.current) {
        world3D.bodhiCanopy.rotation.z = Math.sin(sec * 0.9) * 0.018;
        for (const bg of world3D.bambooGroups) {
          bg.group.rotation.z = Math.sin(sec * 1.15 + bg.phase) * 0.025;
          bg.group.rotation.x = Math.cos(sec * 0.85 + bg.phase) * 0.015;
        }
        world3D.smokeParticles.children.forEach((p) => {
          const seed = (p.userData.seed as number) || 0;
          const cycle = (sec * 0.55 + seed) % 1;
          p.position.set(Math.sin(sec * 1.8 + seed * 4) * 0.16, cycle * 1.85, Math.cos(sec * 1.4 + seed) * 0.12);
          const s = 0.7 + cycle * 1.6;
          p.scale.setScalar(s);
        });
        world3D.altarSmokeParticles.children.forEach((p) => {
          const seed = (p.userData.seed as number) || 0;
          const cycle = (sec * 0.45 + seed) % 1;
          p.position.set(Math.sin(sec * 1.5 + seed * 3) * 0.08, cycle * 1.05, Math.cos(sec * 1.2 + seed) * 0.06);
          const s = 0.65 + cycle * 1.3;
          p.scale.setScalar(s);
        });
        world3D.ambientMotes.rotation.y = sec * 0.015;
        world3D.ambientMotes.position.y = Math.sin(sec * 0.5) * 0.15;
        for (const rb of world3D.treeRibbonsGroup.children) {
          const seed = (rb.userData.seed as number) ?? 0;
          rb.rotation.z = Math.sin(sec * 2.4 + seed) * 0.14;
        }
        world3D.bougainvilleaPetals.children.forEach((p, idx) => {
          const seed = (p.userData.seed as number) ?? idx;
          const ox = (p.userData.ox as number) ?? 0;
          const oz = (p.userData.oz as number) ?? 0;
          const cycle = (sec * 0.22 + seed) % 1;
          p.position.set(
            ox + Math.sin(sec * 1.4 + seed) * 0.28,
            3.12 - cycle * 2.95,
            oz + Math.cos(sec * 1.1 + seed) * 0.22
          );
          p.rotation.set(sec * 1.5 + seed, sec * 1.1, seed);
        });
      }

      // Sync Dynamic Day/Night Cycle & Weather Effects in 3D
      const atm = getTempleAtmosphere(Date.now(), atmospherePrefRef.current);
      skyBgColor.setHex(atm.skyColorHex);
      sceneFog.color.setHex(atm.fogColorHex);
      sceneFog.density = atm.fogDensity;
      sunLight.color.setHex(atm.sunColorHex);
      sunLight.intensity = atm.sunIntensity;
      sunLight.position.set(atm.sunPosition[0], atm.sunPosition[1], atm.sunPosition[2]);
      hemiLight.color.setHex(atm.hemiSkyHex);
      hemiLight.groundColor.setHex(atm.hemiGroundHex);
      hemiLight.intensity = atm.hemiIntensity;
      fillLight.color.setHex(atm.fillColorHex);
      fillLight.intensity = atm.fillIntensity;
      renderer.toneMappingExposure = atm.exposure;

      const warmNightBoost = Math.max(atm.nightFactor, atm.dawnDuskFactor * 0.45);
      nightCourtyardLight.intensity = warmNightBoost * 2.6;
      nightPondLight.intensity = warmNightBoost * 1.85;

      world3D.lanternFlames.forEach((flame, idx) => {
        const flicker = 0.92 + Math.sin(sec * 7 + idx * 1.7) * 0.12;
        flame.scale.setScalar(atm.lanternGlowMultiplier * flicker);
      });
      world3D.pathLanternPivots.forEach((pivot) => {
        const seed = (pivot.userData?.seed as number) ?? 0;
        pivot.rotation.z = Math.sin(sec * 1.55 + seed) * 0.065;
        pivot.rotation.x = Math.cos(sec * 1.2 + seed * 1.3) * 0.04;
      });
      const poolOpacity = Math.min(0.85, 0.18 + atm.nightFactor * 0.46 + atm.dawnDuskFactor * 0.24);
      world3D.pathLanternGlowMats.forEach((mat) => {
        mat.opacity = poolOpacity;
      });

      // Animate vast northern sea surf & occasionally passing coastal boats (coastline at z = -49.55m)
      world3D.shoreSurfGroup.children.forEach((foam, idx) => {
        const phase = sec * 1.25 + idx * 1.4;
        foam.position.z = -49.55 + Math.sin(phase) * 0.24;
        foam.scale.x = 1 + Math.sin(phase * 0.8) * 0.04;
      });
      for (const boat of world3D.seaBoats) {
        const span = boat.maxX - boat.minX;
        const rawProgress = (sec * boat.speed + boat.initialOffset) % span;
        const bx = boat.direction > 0 ? boat.minX + rawProgress : boat.maxX - rawProgress;
        const bob = Math.sin(sec * 1.6 + boat.bobSeed) * 0.08;
        const roll = Math.sin(sec * 1.25 + boat.bobSeed * 1.3) * 0.04;
        const pitch = Math.cos(sec * 1.45 + boat.bobSeed) * 0.025;
        boat.group.position.set(bx, boat.baseY + bob, boat.baseZ);
        boat.group.rotation.z = roll;
        boat.group.rotation.x = pitch;
        if (boat.lanternMesh) {
          const glowScale = Math.max(0.45, atm.lanternGlowMultiplier * 1.05);
          boat.lanternMesh.scale.setScalar(glowScale);
        }
      }

      atmosphere3D.update(atm, camera.position.x, camera.position.z, sec, dt, lowResRef.current);

      // Bell, Woodfish, Broom, Fish Leap ritual effects
      const bellEf = curEffects.find((e) => e.kind === 'bell' && now - e.createdAt < 2500);
      if (bellEf) {
        const age = (now - bellEf.createdAt) / 1000;
        world3D.bellBody.rotation.z = Math.sin(age * 14) * Math.exp(-age * 1.5) * 0.22;
      } else {
        world3D.bellBody.rotation.z = 0;
      }

      const woodEf = curEffects.find((e) => e.kind === 'woodfish' && now - e.createdAt < 650);
      if (woodEf) {
        const age = (now - woodEf.createdAt) / 1000;
        world3D.woodfishBody.position.y = 1.15 + Math.abs(Math.sin(age * 18)) * 0.14 * (1 - age / 0.65);
      } else {
        world3D.woodfishBody.position.y = 1.15;
      }

      const sweepEf = curEffects.find((e) => e.kind === 'sweep' && now - e.createdAt < 2200);
      if (sweepEf) {
        const age = (now - sweepEf.createdAt) / 1000;
        world3D.broomGroup.rotation.z = Math.sin(age * 11) * 0.4;
      } else {
        world3D.broomGroup.rotation.z = 0.22;
      }

      const fishEf = curEffects.find((e) => e.kind === 'fish' && now - e.createdAt < 2800);
      world3D.leapKoiGroup.children.forEach((child, idx) => {
        if (!fishEf) {
          child.visible = false;
          return;
        }
        const age = (now - fishEf.createdAt) / 1000 - idx * 0.18;
        const kt = Math.max(0, Math.min(1, age / 1.35));
        if (kt <= 0 || kt >= 1) {
          child.visible = false;
          return;
        }
        child.visible = true;
        child.position.set(-0.4 - kt * 3.1, 0.55 + Math.sin(kt * Math.PI) * 1.15, -kt * (0.8 + idx * 0.4));
        child.rotation.y = Math.PI * 0.9;
        child.rotation.z = Math.cos(kt * Math.PI) * 0.45;
      });

      const wishEf = curEffects.find((e) => e.kind === 'wish' && now - e.createdAt < 1800);
      if (wishEf) {
        const wt = Math.min(1, (now - wishEf.createdAt) / 1800);
        world3D.flyingWishRibbon.visible = true;
        world3D.flyingWishRibbon.position.set(
          THREE.MathUtils.lerp(0, 0.25, wt),
          THREE.MathUtils.lerp(1.38, 3.35, wt) + Math.sin(wt * Math.PI) * 1.35,
          THREE.MathUtils.lerp(1.9, 0.25, wt)
        );
        world3D.flyingWishRibbon.rotation.z = wt * Math.PI * 3;
        world3D.flyingWishRibbon.rotation.x = Math.sin(wt * Math.PI) * 0.8;
      } else {
        world3D.flyingWishRibbon.visible = false;
      }

      // Animate Memorial Ceremony Floating Lotus Halo & Ascending Orbs
      const curMem = latestMemorialRef.current;
      if (curMem && Date.now() - curMem.createdAt < 14_000) {
        world3D.memorialAuraGroup.visible = true;
        world3D.memorialAuraGroup.children.forEach((child, idx) => {
          if (idx === 0) {
            child.rotation.z = sec * 0.9;
          } else if (typeof child.userData?.seed === 'number') {
            const cyc = (sec * 0.52 + (child.userData.seed as number)) % 1;
            const ang = sec * 1.4 + (child.userData.seed as number);
            child.position.set(
              Math.cos(ang) * (0.45 + cyc * 0.28),
              cyc * 2.1,
              Math.sin(ang) * (0.45 + cyc * 0.28)
            );
          }
        });
      } else if (world3D.memorialAuraGroup.visible) {
        world3D.updateMemorialBanner3D(null);
      }

      // Sync Remote Players in 3D with sculpted robes & expressive limb animations
      const activeIds = new Set<string>();
      for (const p of roomRef.current.players) {
        if (p.userId === currentUserId) continue;
        activeIds.add(p.userId);
        const isOnDeck = p.stupaSlot !== null && p.stupaSlot !== undefined && p.stupaSlot >= 0;
        const targetY = isOnDeck ? STUPA_DECK_Y_3D : getEyeHeightForPose(p.x, p.y, false) - 1.56;
        let rig = remoteRigs.get(p.userId);
        if (!rig) {
          rig = createRemotePlayerRig3D(p.characterId, p.displayName);
          const rp = world2DTo3D(p.x, p.y);
          rig.group.position.set(rp.x, targetY, rp.z);
          scene.add(rig.group);
          remoteRigs.set(p.userId, rig);
        }
        const target3 = world2DTo3D(p.x, p.y);
        if (Math.abs(rig.group.position.y - targetY) > 6) {
          rig.group.position.set(target3.x, targetY, target3.z);
        } else {
          rig.group.position.x = THREE.MathUtils.damp(rig.group.position.x, target3.x, 12, dt);
          rig.group.position.z = THREE.MathUtils.damp(rig.group.position.z, target3.z, 12, dt);
          rig.group.position.y = THREE.MathUtils.damp(rig.group.position.y, targetY, 12, dt);
        }

        // Local character rig faces +Z, whereas camera yaw=0 faces -Z, so add Math.PI
        const targetYaw = directionToYaw(p.direction) + Math.PI;
        rig.group.rotation.y += shortestAngleDiff(rig.group.rotation.y, targetYaw) * Math.min(1, dt * 10);

        if (p.pose === 'walk') {
          const swing = Math.sin(now * 0.015) * 0.14;
          const armSwing = Math.sin(now * 0.015) * 0.34;
          rig.leftFoot.position.z = swing;
          rig.rightFoot.position.z = -swing;
          rig.leftArmPivot.rotation.x = -armSwing;
          rig.rightArmPivot.rotation.x = armSwing;
          rig.leftArmPivot.rotation.z = 0;
          rig.rightArmPivot.rotation.z = 0;
          rig.bodyPivot.position.y = Math.abs(swing) * 0.18;
        } else if (p.pose === 'meditate') {
          rig.leftFoot.position.z = 0.12;
          rig.rightFoot.position.z = 0.12;
          rig.bodyPivot.position.y = -0.22;
          rig.leftArmPivot.rotation.x = -0.45;
          rig.rightArmPivot.rotation.x = -0.45;
          rig.leftArmPivot.rotation.z = -0.22;
          rig.rightArmPivot.rotation.z = 0.22;
        } else if (p.pose === 'sit') {
          rig.leftFoot.position.z = 0.16;
          rig.rightFoot.position.z = 0.16;
          rig.bodyPivot.position.y = -0.34;
          rig.leftArmPivot.rotation.x = -0.38;
          rig.rightArmPivot.rotation.x = -0.38;
          rig.leftArmPivot.rotation.z = -0.14;
          rig.rightArmPivot.rotation.z = 0.14;
        } else if (p.pose === 'pray') {
          rig.leftFoot.position.z = 0;
          rig.rightFoot.position.z = 0;
          rig.bodyPivot.position.y = 0;
          rig.leftArmPivot.rotation.x = -0.95;
          rig.rightArmPivot.rotation.x = -0.95;
          rig.leftArmPivot.rotation.z = -0.35;
          rig.rightArmPivot.rotation.z = 0.35;
        } else {
          rig.leftFoot.position.z = 0;
          rig.rightFoot.position.z = 0;
          rig.bodyPivot.position.y = Math.sin(sec * 1.8) * 0.012;
          rig.leftArmPivot.rotation.x = 0;
          rig.rightArmPivot.rotation.x = 0;
          rig.leftArmPivot.rotation.z = 0;
          rig.rightArmPivot.rotation.z = 0;
        }
      }
      for (const [uid, rig] of remoteRigs.entries()) {
        if (!activeIds.has(uid)) {
          scene.remove(rig.group);
          rig.dispose();
          remoteRigs.delete(uid);
        }
      }

      // Periodically update React HUD status (zone name + nearby interact prompt)
      if (now - lastHudCheck > 150) {
        lastHudCheck = now;
        const zName = viewingStupaRef.current
          ? 'Đài Quan Sát · Bảo Tháp Tầng 9'
          : getZoneName(local.x, local.y);
        setZoneName((prev) => (prev === zName ? prev : zName));

        const act = activeRitualRef.current;
        if (act) {
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
            feed_birds: 'rải thức ăn cho đàn chim bồ câu & chim sẻ',
            wish: 'ném dải băng đỏ lên Cây Nguyện Ước',
            kitchen_menu: 'chọn thực đơn Gian Bếp Chay',
            kitchen_table: 'thưởng thức bữa chay thanh tịnh',
            kitchen_sink: 'rửa bát, rửa ly',
            memorial: 'làm lễ Cầu Siêu',
            stupa: 'lên Bảo Tháp ngắm toàn cảnh',
          };
          const msg =
            act.phase === 'walk'
              ? `Đang đi tới nơi ${actionNames[act.action]}...`
              : `Đang thực hiện ${actionNames[act.action]}...`;
          setStatusBanner((prev) => (prev === msg ? prev : msg));
          setNearbyPrompt(null);
        } else if (viewingStupaRef.current) {
          setStatusBanner(null);
          setNearbyPrompt(null);
        } else {
          setStatusBanner(null);
          // Check center reticle raycast first, or proximity
          raycaster.setFromCamera(_centerNdc, camera);
          const centerHits = raycaster.intersectObjects(world3D.clickables, true);
          let matched: { label: string; onActivate: () => void } | null = null;
          if (centerHits.length > 0 && centerHits[0].distance < 7.5) {
            const meta = centerHits[0].object.userData as {
              kind?: 'interactable' | 'cushion' | 'bench' | 'garden_plot' | 'precepts_stele';
              action?: RitualAction;
              mealTarget?: 'food' | 'drink';
              mealId?: string;
              index?: number;
              benchIndex?: number;
              label?: string;
            };
            if (meta.kind === 'garden_plot' && typeof meta.index === 'number' && meta.label) {
              const pIdx = meta.index;
              matched = { label: meta.label, onActivate: () => walkToGardenPlotRef.current(pIdx) };
            } else if (meta.kind === 'precepts_stele' && meta.label) {
              matched = { label: meta.label, onActivate: () => onInspectPreceptsRef.current?.() };
            } else if (meta.kind === 'interactable' && meta.action && meta.label) {
              const a = meta.action;
              const mTarget = meta.mealTarget;
              const mId = meta.mealId;
              matched = { label: meta.label, onActivate: () => startRitualRef.current(a, mTarget, mId) };
            } else if (meta.kind === 'cushion' && typeof meta.index === 'number' && meta.label) {
              const idx = meta.index;
              matched = { label: meta.label, onActivate: () => onSitCushionRef.current(idx) };
            } else if (meta.kind === 'bench' && typeof meta.benchIndex === 'number' && meta.label) {
              const bIdx = meta.benchIndex;
              const occ = getBenchOccupancy(roomRef.current.benches, bIdx);
              const bSpec = PERGOLA_BENCH_SPECS[bIdx];
              const benchText = bSpec
                ? `${bSpec.label} (${occ.count}/${occ.capacity} chỗ · Nhấn để ngồi)`
                : meta.label;
              matched = { label: benchText, onActivate: () => onSitBenchRef.current(bIdx) };
            }
          }
          if (!matched) {
            const near = findNearbyInteraction(local.x, local.y);
            if (near?.kind === 'garden_plot') {
              matched = { label: near.label, onActivate: () => walkToGardenPlotRef.current(near.plotIndex) };
            } else if (near?.kind === 'precepts_stele') {
              matched = { label: near.label, onActivate: () => onInspectPreceptsRef.current?.() };
            } else if (near?.kind === 'interactable') {
              matched = { label: near.label, onActivate: () => startRitualRef.current(near.action) };
            } else if (near?.kind === 'cushion') {
              matched = {
                label: near.label,
                onActivate: () => onSitCushionRef.current(near.cushionIndex),
              };
            } else if (near?.kind === 'bench') {
              const occ = getBenchOccupancy(roomRef.current.benches, near.benchIndex);
              const bSpec = PERGOLA_BENCH_SPECS[near.benchIndex];
              matched = {
                label: bSpec
                  ? `${bSpec.label} (${occ.count}/${occ.capacity} chỗ · Nhấn E để ngồi)`
                  : near.label,
                onActivate: () => onSitBenchRef.current(near.benchIndex),
              };
            }
          }
          setNearbyPrompt(matched);
        }
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

      // Render first frame synchronously, then signal readiness
      renderer.render(scene, camera);
      onLoadProgressRef.current?.(100);
      await yieldFrame();
      if (disposed) return;
      onReadyRef.current?.();

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro?.disconnect();
      removeListeners?.();

      remoteRigs.forEach((rig) => {
        cleanupScene?.remove(rig.group);
        rig.dispose();
      });
      remoteRigs.clear();

      cleanupFpRig?.dispose();
      cleanupAtmosphere3D?.dispose();
      world3DRef.current = null;
      cleanupWorld3D?.dispose();
      cleanupTextures?.dispose();
      cleanupEnvTex?.dispose();
      if (cleanupRenderer) {
        cleanupRenderer.dispose();
        if (cleanupRenderer.domElement.parentNode === mount) {
          mount.removeChild(cleanupRenderer.domElement);
        }
      }
    };
  }, [currentUserId]);

  // Virtual touch joystick handlers for intuitive phone/touch walking
  const handleJoyPointer = (clientX: number, clientY: number, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.36;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxR, dist);
    const nx = dist > 0 ? (dx / dist) * (clamped / maxR) : 0;
    const ny = dist > 0 ? (dy / dist) * (clamped / maxR) : 0;
    joyInputRef.current = { dx: nx, dy: -ny };
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = `translate(${nx * maxR}px, ${ny * maxR}px)`;
    }
    if (dist > 4) {
      walkRef.current = null;
      activeRitualRef.current = null;
    }
  };

  const resetJoy = () => {
    joyInputRef.current = { dx: 0, dy: 0 };
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = 'translate(0px, 0px)';
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#BFD5DF] select-none">
      {/* Isolated WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full touch-none cursor-grab active:cursor-grabbing" />

      {webglError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#231D19]/90 p-6 text-center">
          <p className="text-sm text-[#F5EFE6] max-w-sm">{webglError}</p>
        </div>
      )}

      {/* Top-Left Zone Plaque & First-Person Compass Hint (below top floating bar) */}
      <div className="pointer-events-none absolute top-14 left-3 z-10 flex flex-col gap-1 pt-[env(safe-area-inset-top)]">
        <div className="px-3 py-1.5 rounded-lg bg-[#1C1613]/68 border border-[#F5DFB0]/35 text-xs font-semibold font-display text-[#FBF2DC] shadow-md w-fit">
          {zoneName}
        </div>
        <div className="px-2.5 py-1 rounded-md bg-[#1C1613]/52 text-[11px] text-[#EFE6D9] w-fit">
          {viewingStupa
            ? 'Tầng 9 Bảo Tháp · Đi lại trên đài hoặc xoay 360° ngắm toàn cảnh'
            : 'Kéo xoay góc nhìn · Cuộn chuột zoom · Chạm vật thể để hành lễ'}
        </div>
      </div>

      {/* Subtle Center Gaze Reticle */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      >
        <div
          className={`rounded-full transition-all duration-150 ${
            nearbyPrompt
              ? 'w-4 h-4 border-2 border-[#F7D288] bg-[#F7D288]/25'
              : 'w-1.5 h-1.5 bg-white/55 shadow'
          }`}
        />
      </div>

      {/* Bottom Virtual Touch Walk Pad */}
      <div
        className="absolute left-3 z-10 touch-none"
        style={{ bottom: `${bottomHudInsetPx + 14}px` }}
      >
        <div
          role="slider"
          aria-label="Điều khiển bước đi"
          aria-valuetext="Di chuyển"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            handleJoyPointer(e.clientX, e.clientY, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 0 && e.pointerType === 'mouse') return;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              handleJoyPointer(e.clientX, e.clientY, e.currentTarget);
            }
          }}
          onPointerUp={resetJoy}
          onPointerCancel={resetJoy}
          className="w-20 h-20 rounded-full bg-[#1C1613]/55 border border-[#F5DFB0]/30 shadow-lg flex items-center justify-center relative cursor-pointer"
        >
          <span className="absolute top-1.5 text-[9px] font-semibold text-[#F5DFB0]/65 pointer-events-none">
            Tiến
          </span>
          <span className="absolute bottom-1.5 text-[9px] font-semibold text-[#F5DFB0]/45 pointer-events-none">
            Lùi
          </span>
          <div
            ref={joyKnobRef}
            className="w-8 h-8 rounded-full bg-[#E5B869]/85 border border-[#FBF0D4]/70 shadow-md transition-transform duration-75 pointer-events-none"
          />
        </div>
      </div>

      {/* Bottom-Center Action Banner / Tap-to-Interact Prompt */}
      {(statusBanner || nearbyPrompt) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-auto"
          style={{ bottom: `${bottomHudInsetPx + 18}px` }}
        >
          {statusBanner ? (
            <div className="px-3.5 py-1.5 rounded-lg bg-[#1C1613]/80 border border-[#E8B86A]/65 text-xs font-medium text-[#F5DFB0] shadow-lg whitespace-nowrap">
              {statusBanner}
            </div>
          ) : (
            nearbyPrompt && (
              <button
                type="button"
                onClick={nearbyPrompt.onActivate}
                className="px-3.5 py-2 rounded-lg bg-[#1C1613]/82 hover:bg-[#1C1613]/95 border border-[#E8B86A]/75 text-xs font-medium text-[#F7D288] shadow-lg whitespace-nowrap cursor-pointer touch-manipulation"
              >
                Chạm hoặc nhấn E · {nearbyPrompt.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
