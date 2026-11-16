import * as THREE from 'three';
import {
  CHARACTERS,
  CUSHION_POSITIONS,
  FIVE_PRECEPTS_LIST,
  FLOWER_CATALOG,
  GARDEN_PLOT_POSITIONS,
  HON_NON_BO_SPEC,
  INTERACTABLES,
  PERGOLA_BENCH_SPECS,
  PERGOLA_SPEC,
  PRECEPTS_STELE_SPEC,
  VEGETARIAN_DRINK_MENU,
  VEGETARIAN_FOOD_MENU,
  getEffectiveFlowerStage,
  type CharacterId,
  type GardenPlotState,
  type KitchenMealState,
  type LanternColor,
  type PondLanternState,
  type RitualAction,
  type TreeWishState,
} from '../../shared/types.ts';
import {
  MEMORIAL_GRAVE_SPECS,
  MOUNTAIN_PEAKS,
  MOUNTAIN_SPEC,
  MOUNTAIN_TRAIL_WAYPOINTS,
  PATH_LANTERN_POSTS,
  POND_SPEC,
  STUPA_DECK_Y_3D,
  STUPA_SPEC,
  getGroundElevation3D,
  world2DTo3D,
  WORLD_TO_3D_SCALE,
} from '../../shared/templeNavigation.ts';
import type { TempleTextureBundle } from './temple3dTextures.ts';
import {
  createCourtyardStatues3D,
  createSculptedAltarStatue,
} from './temple3dStatues.ts';

export interface AnimatedKoi3D {
  group: THREE.Group;
  tail: THREE.Mesh;
  pectoralL: THREE.Mesh;
  pectoralR: THREE.Mesh;
  originX: number;
  originZ: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
  depthY: number;
}

export interface BambooSway3D {
  group: THREE.Group;
  phase: number;
}

export interface SeaBoat3D {
  group: THREE.Group;
  speed: number;
  direction: 1 | -1;
  minX: number;
  maxX: number;
  initialOffset: number;
  baseY: number;
  baseZ: number;
  bobSeed: number;
  lanternMesh?: THREE.Mesh;
}

export interface AnimatedBird3D {
  group: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  head: THREE.Group;
  kind: 'dove' | 'sparrow';
  originX: number;
  originZ: number;
  baseY: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
  landX: number;
  landZ: number;
  stagger: number;
}

export interface TempleWorld3DHandles {
  root: THREE.Group;
  clickables: THREE.Object3D[];
  koiSchool: AnimatedKoi3D[];
  bambooGroups: BambooSway3D[];
  bodhiCanopy: THREE.Group;
  bellBody: THREE.Group;
  woodfishBody: THREE.Group;
  broomGroup: THREE.Group;
  smokeParticles: THREE.Group;
  altarSmokeParticles: THREE.Group;
  waterMesh: THREE.Mesh;
  shoreSurfGroup: THREE.Group;
  seaBoats: SeaBoat3D[];
  lanternFlames: THREE.Mesh[];
  ambientMotes: THREE.Points;
  leapKoiGroup: THREE.Group;
  pondLanternsGroup: THREE.Group;
  koiPelletGroup: THREE.Group;
  treeRibbonsGroup: THREE.Group;
  flyingWishRibbon: THREE.Group;
  memorialAuraGroup: THREE.Group;
  bougainvilleaPetals: THREE.Group;
  bougainvilleaBirds: AnimatedBird3D[];
  birdSeedsGroup: THREE.Group;
  honNonBoWaterfall: THREE.Group;
  honNonBoKoi: AnimatedKoi3D[];
  pathLanternPivots: THREE.Group[];
  pathLanternGlowMats: THREE.MeshBasicMaterial[];
  updateCourtIncenseSticks3D: (activeCount: number) => void;
  updateMemorialBanner3D: (deceasedName: string | null) => void;
  updateGardenPlots3D: (plots: GardenPlotState[]) => void;
  updatePondLanterns3D: (lanterns: PondLanternState[]) => void;
  updateTreeWishes3D: (wishes: TreeWishState[]) => void;
  updateKitchenMeal3D: (meals: KitchenMealState[]) => void;
  dispose: () => void;
}

function registerClickable(
  target: THREE.Object3D,
  clickables: THREE.Object3D[],
  meta:
    | {
        kind: 'interactable';
        action: RitualAction;
        label: string;
        mealTarget?: 'food' | 'drink';
        mealId?: string;
      }
    | { kind: 'cushion'; index: number; label: string }
    | { kind: 'bench'; benchIndex: number; label: string }
    | { kind: 'garden_plot'; index: number; label: string }
    | { kind: 'precepts_stele'; label: string }
) {
  target.userData = { ...target.userData, ...meta };
  target.traverse((child) => {
    child.userData = { ...child.userData, ...meta };
  });
  clickables.push(target);
}

function disposeGroupChildren(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
      const mat = (obj as THREE.Mesh).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });
  }
}

function createCurvedRoofGroup(
  width: number,
  depth: number,
  height: number,
  tileMat: THREE.Material,
  goldMat: THREE.Material,
  trimMat: THREE.Material,
  castShadow: boolean
): THREE.Group {
  const g = new THREE.Group();

  // Lower eaves tier
  const lowerGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.72, height * 0.56, 4);
  lowerGeo.rotateY(Math.PI / 4);
  const lowerMesh = new THREE.Mesh(lowerGeo, tileMat);
  lowerMesh.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
  lowerMesh.position.y = height * 0.28;
  lowerMesh.castShadow = castShadow;
  lowerMesh.receiveShadow = true;
  g.add(lowerMesh);

  // Upper tiered pagoda crown
  const upperGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.48, height * 0.54, 4);
  upperGeo.rotateY(Math.PI / 4);
  const upperMesh = new THREE.Mesh(upperGeo, tileMat);
  upperMesh.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
  upperMesh.position.y = height * 0.68;
  upperMesh.castShadow = castShadow;
  g.add(upperMesh);

  // Decorative upturned roof ridge & golden lotus finial
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 0.16, 0.22), trimMat);
  ridge.position.y = height * 0.92;
  g.add(ridge);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), goldMat);
  finial.position.y = height * 1.02;
  g.add(finial);

  return g;
}

function createKoiModel(
  tex: THREE.Texture,
  scale: number
): { group: THREE.Group; tail: THREE.Mesh; pectoralL: THREE.Mesh; pectoralR: THREE.Mesh } {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.22,
    metalness: 0.08,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xfff3e0,
    roughness: 0.35,
    transparent: true,
    opacity: 0.84,
    side: THREE.DoubleSide,
  });

  // Streamlined lathe body along Z then rotated to face +X
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -0.34),
    new THREE.Vector2(0.055, -0.22),
    new THREE.Vector2(0.105, -0.05),
    new THREE.Vector2(0.112, 0.08),
    new THREE.Vector2(0.082, 0.22),
    new THREE.Vector2(0.001, 0.31),
  ];
  const bodyGeo = new THREE.LatheGeometry(profile, 14);
  bodyGeo.rotateZ(-Math.PI / 2);
  bodyGeo.scale(1, 0.82, 0.72);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Dorsal fin
  const dorsalGeo = new THREE.ConeGeometry(0.045, 0.16, 4);
  dorsalGeo.rotateZ(Math.PI * 0.4);
  const dorsal = new THREE.Mesh(dorsalGeo, finMat);
  dorsal.position.set(-0.02, 0.085, 0);
  dorsal.scale.set(1.4, 1, 0.25);
  group.add(dorsal);

  // Flowing caudal tail fin
  const tailGeo = new THREE.PlaneGeometry(0.22, 0.19, 2, 2);
  tailGeo.translate(-0.11, 0, 0);
  const tail = new THREE.Mesh(tailGeo, finMat);
  tail.position.set(-0.31, 0, 0);
  group.add(tail);

  // Pectoral fins
  const pFinGeo = new THREE.CircleGeometry(0.075, 10);
  pFinGeo.scale(1.3, 0.65, 1);
  pFinGeo.rotateX(Math.PI / 2);
  const pectoralL = new THREE.Mesh(pFinGeo, finMat);
  pectoralL.position.set(0.08, -0.02, -0.085);
  pectoralL.rotation.y = 0.5;
  group.add(pectoralL);

  const pectoralR = new THREE.Mesh(pFinGeo, finMat);
  pectoralR.position.set(0.08, -0.02, 0.085);
  pectoralR.rotation.y = -0.5;
  group.add(pectoralR);

  group.scale.setScalar(scale);
  return { group, tail, pectoralL, pectoralR };
}

function createLotusFlower3D(x: number, y: number, z: number, withFlower: boolean): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const padMat = new THREE.MeshStandardMaterial({
    color: 0x4b8d57,
    roughness: 0.45,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const padGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.025, 18, 1, false, 0.25, Math.PI * 1.85);
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.rotation.y = (x * 1.7 + z) % (Math.PI * 2);
  g.add(pad);

  if (withFlower) {
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xf6a2b7,
      roughness: 0.42,
      emissive: 0x3b121c,
      emissiveIntensity: 0.14,
      side: THREE.DoubleSide,
    });
    const innerPetalMat = new THREE.MeshStandardMaterial({
      color: 0xfcd5df,
      roughness: 0.36,
      side: THREE.DoubleSide,
    });
    const flowerGroup = new THREE.Group();
    flowerGroup.position.y = 0.06;

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 6), petalMat);
      petal.position.set(Math.cos(ang) * 0.1, 0.04, Math.sin(ang) * 0.1);
      petal.rotation.z = -Math.cos(ang) * 0.72;
      petal.rotation.x = Math.sin(ang) * 0.72;
      flowerGroup.add(petal);
    }
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.3;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 6), innerPetalMat);
      petal.position.set(Math.cos(ang) * 0.055, 0.08, Math.sin(ang) * 0.055);
      petal.rotation.z = -Math.cos(ang) * 0.36;
      petal.rotation.x = Math.sin(ang) * 0.36;
      flowerGroup.add(petal);
    }
    const stamen = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8ce58, roughness: 0.5 })
    );
    stamen.position.y = 0.09;
    flowerGroup.add(stamen);
    g.add(flowerGroup);
  }
  return g;
}

export function buildTempleWorld3D(
  textures: TempleTextureBundle,
  incenseCount: number,
  isSoftwareGl: boolean
): TempleWorld3DHandles {
  const root = new THREE.Group();
  const clickables: THREE.Object3D[] = [];
  const lanternFlames: THREE.Mesh[] = [];
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTexs: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T) => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T) => {
    disposableMats.push(m);
    return m;
  };

  // Shared calibrated PBR Materials
  const grassMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.grassTex, roughness: 0.92, metalness: 0.0 })
  );
  const courtyardMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.courtyardTileTex, roughness: 0.76, metalness: 0.04 })
  );
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.woodPlankTex, roughness: 0.62, metalness: 0.04 })
  );
  const crimsonPillarMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x993b2f, roughness: 0.38, metalness: 0.08 })
  );
  const tileRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.terracottaTex, roughness: 0.52, metalness: 0.06 })
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe3b35e, roughness: 0.24, metalness: 0.85 })
  );
  const bronzeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x9f743b, roughness: 0.32, metalness: 0.82 })
  );
  const stoneMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.stoneTex, roughness: 0.82, metalness: 0.04 })
  );
  const barkMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.barkTex, roughness: 0.9, metalness: 0.0 })
  );
  const bambooMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.bambooTex, roughness: 0.45, metalness: 0.04 })
  );
  const darkWoodMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x4b2e20, roughness: 0.58, metalness: 0.05 })
  );

  // 1. Temple Meadow + Open Northern Coastal Beach + Vast Sea Vista & Distant Horizon Islands
  // Expanded westward to cover Hòn Non Bộ & Vườn Bồ Đề (x down to -440)
  const meadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(265, 175)), grassMat);
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.set(-10, -0.02, 37.75); // North edge ends cleanly at z = -49.75m (shoreline)
  meadow.receiveShadow = true;
  root.add(meadow);

  const sandMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd7c59b, roughness: 0.92 }));
  const coastalSand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(265, 0.24, 4.4)), sandMat);
  coastalSand.position.set(-10, -0.14, -48.0);
  coastalSand.receiveShadow = true;
  root.add(coastalSand);

  // Coastal Timber Sea-View Deck right outside the Small Back Gate (x: 840..1080, y: -605..-522)
  const deckCenter3 = world2DTo3D(960, -563.5);
  const coastalDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.6, 0.26, 3.32)), woodMat);
  coastalDeck.position.set(deckCenter3.x, 0.01, deckCenter3.z);
  coastalDeck.receiveShadow = true;
  root.add(coastalDeck);

  // Timber safety railing along coastal deck north/west/east edges
  for (const rx of [-4.6, -3.1, -1.55, 0, 1.55, 3.1, 4.6]) {
    const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.85, 0.11)), darkWoodMat);
    post.position.set(rx, 0.54, deckCenter3.z - 1.52);
    root.add(post);
  }
  const northTopRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.35, 0.08, 0.1)), woodMat);
  northTopRail.position.set(0, 0.94, deckCenter3.z - 1.52);
  root.add(northTopRail);
  const northMidRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.35, 0.06, 0.08)), woodMat);
  northMidRail.position.set(0, 0.56, deckCenter3.z - 1.52);
  root.add(northMidRail);
  for (const sx of [-4.6, 4.6]) {
    const sideRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.08, 3.1)), woodMat);
    sideRail.position.set(sx, 0.94, deckCenter3.z);
    root.add(sideRail);
    const midSidePost = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.85, 0.11)), darkWoodMat);
    midSidePost.position.set(sx, 0.54, deckCenter3.z + 1.4);
    root.add(midSidePost);
  }

  // Vast Northern Shimmering Ocean Plane (extends 185m out toward horizon)
  const oceanGeo = trackGeo(new THREE.PlaneGeometry(390, 185));
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1f6888,
      roughness: 0.18,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.16,
    })
  );
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.set(-10, -0.34, -142.0);
  oceanMesh.receiveShadow = true;
  root.add(oceanMesh);

  // Subtle translucent shore surf strips animated along shoreline z ~ -49.55m
  const shoreSurfGroup = new THREE.Group();
  const surfMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe6f7fa,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    })
  );
  for (let i = 0; i < 6; i++) {
    const foam = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(36, 0.55)), surfMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set((i - 2.5) * 40 - 8, -0.27, -49.55);
    shoreSurfGroup.add(foam);
  }
  root.add(shoreSurfGroup);

  // Distant hazy coastal headland silhouettes on far horizon
  const hillMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x496144, roughness: 0.95 }));
  const islandMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x4f727d, roughness: 0.95 }));
  for (const isl of [
    { x: -86, z: -175, r: 22, h: 6.5 },
    { x: 92, z: -188, r: 28, h: 8.2 },
  ]) {
    const island = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(isl.r, isl.h, 12)), islandMat);
    island.position.set(isl.x, isl.h * 0.25 - 0.5, isl.z);
    island.scale.set(1.9, 1, 0.7);
    root.add(island);
  }

  // Rolling Hills strictly flanking outer East/West/South beyond the expanded temple walls
  const hillCoords = [
    { x: -90, z: 12, r: 26, h: 9 },
    { x: 68, z: 16, r: 28, h: 10 },
    { x: -72, z: 62, r: 24, h: 8 },
    { x: 48, z: 60, r: 25, h: 8.5 },
  ];
  for (const hl of hillCoords) {
    const hill = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(hl.r, hl.h, 12)), hillMat);
    hill.position.set(hl.x, hl.h * 0.4, hl.z);
    hill.scale.set(1.4, 1, 0.9);
    root.add(hill);
  }

  // Passing Wooden Boats & Traditional Sailboats cruising gently on the sea
  const seaBoats: SeaBoat3D[] = [];
  const sailClothMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd8a369, roughness: 0.82, side: THREE.DoubleSide })
  );
  const canopyStrawMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xbfa06c, roughness: 0.88 }));
  const boatLanternMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff9f38, emissiveIntensity: 1.9 })
  );
  const boatSpecs: Array<{
    baseZ: number;
    speed: number;
    direction: 1 | -1;
    initialOffset: number;
    hasSail: boolean;
    scale: number;
  }> = [
    { baseZ: -60, speed: 1.85, direction: 1, initialOffset: 15, hasSail: false, scale: 1.0 },
    { baseZ: -76, speed: 1.35, direction: -1, initialOffset: 75, hasSail: true, scale: 1.35 },
    { baseZ: -98, speed: 1.15, direction: 1, initialOffset: 115, hasSail: true, scale: 1.6 },
    { baseZ: -66, speed: 1.6, direction: -1, initialOffset: 145, hasSail: false, scale: 1.1 },
    { baseZ: -120, speed: 0.95, direction: 1, initialOffset: 42, hasSail: true, scale: 1.9 },
  ];
  boatSpecs.forEach((spec, idx) => {
    const bg = new THREE.Group();
    const hull = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.55, 1.05)), darkWoodMat);
    hull.position.y = 0.22;
    bg.add(hull);

    const bow = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.56, 1.25, 4)), woodMat);
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.scale.set(0.6, 1, 0.92);
    bow.position.set(2.15, 0.28, 0);
    bg.add(bow);

    const stern = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.5, 0.95, 4)), woodMat);
    stern.rotation.z = Math.PI / 2;
    stern.rotation.y = Math.PI / 4;
    stern.scale.set(0.6, 1, 0.9);
    stern.position.set(-2.0, 0.28, 0);
    bg.add(stern);

    if (spec.hasSail) {
      const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.08, 3.8, 8)), barkMat);
      mast.position.set(0.15, 2.0, 0);
      bg.add(mast);

      const sail = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.1, 2.7)), sailClothMat);
      sail.position.set(-0.35, 2.25, 0);
      sail.rotation.z = -0.1;
      bg.add(sail);
    } else {
      const canopy = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.55, 0.55, 1.55, 8, 1, false, 0, Math.PI)),
        canopyStrawMat
      );
      canopy.rotation.z = Math.PI / 2;
      canopy.rotation.x = Math.PI / 2;
      canopy.position.set(-0.15, 0.56, 0);
      bg.add(canopy);
    }

    const bLantern = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.14, 8, 8)), boatLanternMat);
    bLantern.position.set(spec.hasSail ? 0.5 : 1.0, spec.hasSail ? 1.55 : 0.85, 0);
    bg.add(bLantern);

    bg.scale.setScalar(spec.scale);
    if (spec.direction < 0) {
      bg.rotation.y = Math.PI;
    }
    bg.position.set(0, -0.34, spec.baseZ);
    root.add(bg);
    seaBoats.push({
      group: bg,
      speed: spec.speed,
      direction: spec.direction,
      minX: -112,
      maxX: 95,
      initialOffset: spec.initialOffset,
      baseY: -0.34,
      baseZ: spec.baseZ,
      bobSeed: idx * 1.7,
      lanternMesh: bLantern,
    });
  });

  // 2. Temple Sandstone Perimeter Wall expanded westward to x = -416 for Hòn Non Bộ garden
  const wallHeight = 2.1;
  const wallThick = 0.9;
  const addWall = (x2d: number, y2d: number, w2d: number, h2d: number) => {
    const p = world2DTo3D(x2d + w2d / 2, y2d + h2d / 2);
    const w = w2d * WORLD_TO_3D_SCALE;
    const d = h2d * WORLD_TO_3D_SCALE;
    const wall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, wallHeight, d)), stoneMat);
    wall.position.set(p.x, wallHeight / 2, p.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);

    const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.25, 0.22, d + 0.25)), tileRoofMat);
    cap.position.set(p.x, wallHeight + 0.1, p.z);
    root.add(cap);
  };
  addWall(-416, -520, 1340, 36);
  addWall(996, -520, 900, 36);
  addWall(-416, -520, 36, 1756);
  addWall(1860, -520, 36, 1756);
  addWall(-416, 1118, 1260, 44);
  addWall(1076, 1118, 820, 44);
  void wallThick;

  // Small Back Gate (Cửa Nhỏ Sau Chùa) at (960, -502)
  const backGateP = world2DTo3D(960, -502);
  const backGateGroup = new THREE.Group();
  backGateGroup.position.set(backGateP.x, 0, backGateP.z);
  for (const gx of [-1.42, 1.42]) {
    const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.19, 2.6, 12)), crimsonPillarMat);
    post.position.set(gx, 1.3, 0);
    post.castShadow = true;
    backGateGroup.add(post);
  }
  // Open wooden door leaves angled outward toward the coastal deck
  for (const side of [-1, 1]) {
    const doorPivot = new THREE.Group();
    doorPivot.position.set(side * 1.32, 0.02, -0.2);
    doorPivot.rotation.y = side * -1.05;
    const doorLeaf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 2.0, 0.1)), darkWoodMat);
    doorLeaf.position.set(-side * 0.59, 1.0, 0);
    doorLeaf.castShadow = !isSoftwareGl;
    doorPivot.add(doorLeaf);
    backGateGroup.add(doorPivot);
  }
  const backGateRoof = createCurvedRoofGroup(4.2, 2.3, 1.35, tileRoofMat, goldMat, crimsonPillarMat, !isSoftwareGl);
  backGateRoof.position.set(0, 2.55, 0);
  backGateGroup.add(backGateRoof);
  root.add(backGateGroup);

  // 3. Central Courtyard Terrace, Approach Promenade & Stepping Stones
  const courtP = world2DTo3D(960, 717);
  const courtyard = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(640 * WORLD_TO_3D_SCALE, 0.08, 385 * WORLD_TO_3D_SCALE)),
    courtyardMat
  );
  courtyard.position.set(courtP.x, 0.02, courtP.z);
  courtyard.receiveShadow = true;
  root.add(courtyard);

  const promP = world2DTo3D(960, 1035);
  const promenade = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(190 * WORLD_TO_3D_SCALE, 0.07, 270 * WORLD_TO_3D_SCALE)),
    courtyardMat
  );
  promenade.position.set(promP.x, 0.02, promP.z);
  promenade.receiveShadow = true;
  root.add(promenade);

  const backGatePadP = world2DTo3D(960, -452);
  const backGatePad = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(92 * WORLD_TO_3D_SCALE, 0.06, 130 * WORLD_TO_3D_SCALE)),
    courtyardMat
  );
  backGatePad.position.set(backGatePadP.x, 0.018, backGatePadP.z);
  backGatePad.receiveShadow = true;
  root.add(backGatePad);

  const westPathP = world2DTo3D(612, 735);
  const westPath = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(128 * WORLD_TO_3D_SCALE, 0.06, 70 * WORLD_TO_3D_SCALE)),
    courtyardMat
  );
  westPath.position.set(westPathP.x, 0.018, westPathP.z);
  westPath.receiveShadow = true;
  root.add(westPath);

  const eastPathP = world2DTo3D(1357, 639);
  const eastPath = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(175 * WORLD_TO_3D_SCALE, 0.06, 58 * WORLD_TO_3D_SCALE)),
    courtyardMat
  );
  eastPath.position.set(eastPathP.x, 0.018, eastPathP.z);
  eastPath.receiveShadow = true;
  root.add(eastPath);

  const leftPlazaBorderP = world2DTo3D(50, 274);
  const leftPlazaBorder = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(790 * WORLD_TO_3D_SCALE, 0.025, 392 * WORLD_TO_3D_SCALE)),
    stoneMat
  );
  leftPlazaBorder.position.set(leftPlazaBorderP.x, 0.004, leftPlazaBorderP.z);
  leftPlazaBorder.receiveShadow = true;
  root.add(leftPlazaBorder);

  const leftPlaza = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(744 * WORLD_TO_3D_SCALE, 0.03, 348 * WORLD_TO_3D_SCALE)),
    courtyardMat
  );
  leftPlaza.position.set(leftPlazaBorderP.x, 0.012, leftPlazaBorderP.z);
  leftPlaza.receiveShadow = true;
  root.add(leftPlaza);

  const steppingStones = [
    { x: 645, y: 580 }, { x: 585, y: 515 }, { x: 515, y: 455 }, { x: 445, y: 410 }, { x: 375, y: 370 },
    // Paths linking Vườn Bồ Đề, Quét Lá, Hòn Non Bộ & Thủy Đình
    { x: 205, y: 312 }, { x: 145, y: 300 }, { x: 85, y: 288 }, { x: 78, y: 250 }, { x: 30, y: 278 },
    { x: 112, y: 356 }, { x: 52, y: 388 }, { x: -12, y: 408 }, { x: -115, y: 412 },
    { x: -125, y: 495 }, { x: -105, y: 555 },
    { x: 1415, y: 695 }, { x: 1455, y: 760 }, { x: 1515, y: 825 }, { x: 1595, y: 865 },
    { x: 1090, y: 970 }, { x: 1150, y: 978 }, { x: 1210, y: 985 }, { x: 1265, y: 988 },
    // Entrance stones leading into NE Gian Bếp Chay pavilion
    { x: 1485, y: 638 }, { x: 1545, y: 632 }, { x: 1613, y: 626 },
    // Backyard path stones leading around Chánh Điện & Bảo Tháp to Sân Sau & Small Back Gate
    { x: 642, y: 360 }, { x: 640, y: 260 }, { x: 640, y: 160 }, { x: 642, y: 60 },
    { x: 648, y: -50 }, { x: 675, y: -145 }, { x: 745, y: -175 }, { x: 840, y: -178 },
    { x: 1278, y: 360 }, { x: 1280, y: 260 }, { x: 1280, y: 160 }, { x: 1278, y: 60 },
    { x: 1272, y: -50 }, { x: 1245, y: -145 }, { x: 1175, y: -175 }, { x: 1080, y: -178 },
    // Loop around Bảo Tháp to Small Back Gate
    { x: 810, y: -275 }, { x: 815, y: -365 }, { x: 875, y: -418 }, { x: 960, y: -430 },
    { x: 1110, y: -275 }, { x: 1105, y: -365 }, { x: 1045, y: -418 },
    // Path west to Khu Công Viên Cầu Siêu & West Chánh Điện link
    { x: 644, y: 465 }, { x: 615, y: -200 }, { x: 565, y: -225 }, { x: 505, y: -240 },
    { x: 330, y: 50 }, { x: 330, y: -10 },
  ];
  for (const st of steppingStones) {
    const sp = world2DTo3D(st.x, st.y);
    const stone = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.75, 0.82, 0.08, 12)), stoneMat);
    stone.position.set(sp.x, 0.03, sp.z);
    stone.receiveShadow = true;
    root.add(stone);
  }

  const mossMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c874e, roughness: 0.92 }));

  // 5. Expanded Lotus Pond (Ao Sen), Koi School, Lotus Flowers, Walkable Arched Bridge & Fish Pier
  const pondCenter = world2DTo3D(POND_SPEC.cx, POND_SPEC.cy);
  const pondRx = POND_SPEC.rx * WORLD_TO_3D_SCALE;
  const pondRz = POND_SPEC.ry * WORLD_TO_3D_SCALE;

  // Pond bed (dark teal-slate floor below water)
  const pondBedGeo = trackGeo(new THREE.CircleGeometry(1, 40));
  pondBedGeo.rotateX(-Math.PI / 2);
  const pondBedMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a3e44, roughness: 0.95 }));
  const pondBed = new THREE.Mesh(pondBedGeo, pondBedMat);
  pondBed.scale.set(pondRx + 0.35, 1, pondRz + 0.35);
  pondBed.position.set(pondCenter.x, 0.01, pondCenter.z);
  root.add(pondBed);

  // Translucent reflective water surface
  const waterGeo = trackGeo(new THREE.CircleGeometry(1, 40));
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x3b848a,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.74,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.scale.set(pondRx, 1, pondRz);
  waterMesh.position.set(pondCenter.x, 0.24, pondCenter.z);
  waterMesh.receiveShadow = true;
  root.add(waterMesh);

  // Shoreline embankment boulders (leave west & east bridge openings clear)
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    const bx = pondCenter.x + Math.cos(ang) * (pondRx + 0.22);
    const bz = pondCenter.z + Math.sin(ang) * (pondRz + 0.22);
    if (Math.abs(ang - Math.PI) < 0.28 || ang < 0.25 || ang > Math.PI * 2 - 0.25) continue;
    const boulder = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.45 + (i % 3) * 0.16, 1)), stoneMat);
    boulder.scale.set(1.2, 0.65, 1.0);
    boulder.position.set(bx, 0.22, bz);
    boulder.rotation.y = ang;
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    root.add(boulder);
    if (i % 2 === 0) {
      const m = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.28, 8, 6)), mossMat);
      m.scale.set(1.1, 0.35, 1.0);
      m.position.set(bx, 0.44, bz);
      root.add(m);
    }
  }

  // Arched Wooden Bridge (Cầu Ao Sen) spanning x: 110..566 across y = 735
  const bridgeGroup = new THREE.Group();
  const bridgeSegs = 22;
  const bridgeSpanX2d = POND_SPEC.bridgeXMax - POND_SPEC.bridgeXMin;
  const bridgeStepW = (bridgeSpanX2d / bridgeSegs) * WORLD_TO_3D_SCALE + 0.04;
  for (let i = 0; i < bridgeSegs; i++) {
    const x2d = POND_SPEC.bridgeXMin + ((i + 0.5) / bridgeSegs) * bridgeSpanX2d;
    const nextX2d = POND_SPEC.bridgeXMin + ((i + 1.5) / bridgeSegs) * bridgeSpanX2d;
    const elev = getGroundElevation3D(x2d, POND_SPEC.cy);
    const nextElev = getGroundElevation3D(Math.min(POND_SPEC.bridgeXMax, nextX2d), POND_SPEC.cy);
    const slope = Math.atan2(nextElev - elev, (bridgeSpanX2d / bridgeSegs) * WORLD_TO_3D_SCALE);
    const p3 = world2DTo3D(x2d, POND_SPEC.cy);

    const plank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(bridgeStepW, 0.12, 2.02)), woodMat);
    plank.position.set(p3.x, elev - 0.05, p3.z);
    plank.rotation.z = slope;
    plank.castShadow = !isSoftwareGl;
    plank.receiveShadow = true;
    bridgeGroup.add(plank);

    // Underside support beams every few planks
    if (i % 4 === 2) {
      for (const rz of [-0.82, 0.82]) {
        const pileH = Math.max(0.4, elev);
        const pile = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.09, pileH, 8)), darkWoodMat);
        pile.position.set(p3.x, pileH / 2 - 0.02, p3.z + rz);
        bridgeGroup.add(pile);
      }
    }
  }
  // Curved bridge handrails & crimson balustrade posts
  const railPostCount = 9;
  for (const rz of [-0.94, 0.94]) {
    const railPts: THREE.Vector3[] = [];
    for (let i = 0; i < railPostCount; i++) {
      const t = i / (railPostCount - 1);
      const x2d = POND_SPEC.bridgeXMin + t * bridgeSpanX2d;
      const elev = getGroundElevation3D(x2d, POND_SPEC.cy);
      const p3 = world2DTo3D(x2d, POND_SPEC.cy);
      const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.86, 0.11)), crimsonPillarMat);
      post.position.set(p3.x, elev + 0.4, p3.z + rz);
      post.castShadow = !isSoftwareGl;
      bridgeGroup.add(post);

      const cap = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.08, 8, 6)), goldMat);
      cap.position.set(p3.x, elev + 0.86, p3.z + rz);
      bridgeGroup.add(cap);

      railPts.push(new THREE.Vector3(p3.x, elev + 0.78, p3.z + rz));
    }
    const railCurve = new THREE.CatmullRomCurve3(railPts);
    const topRailMesh = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(railCurve, 24, 0.048, 8, false)),
      crimsonPillarMat
    );
    bridgeGroup.add(topRailMesh);
  }
  root.add(bridgeGroup);

  // 3D Koi Fish School swimming in the expanded Lotus Pond (north & south halves clear of bridge arch)
  const koiSchool: AnimatedKoi3D[] = [];
  const koiConfigs = [
    { ox: 270, oy: 650, rx: 2.1, rz: 0.75, speed: 0.52, tex: textures.koiKohakuTex, scale: 1.45, depthY: 0.14 },
    { ox: 410, oy: 816, rx: 2.2, rz: 0.82, speed: -0.45, tex: textures.koiYamabukiTex, scale: 1.32, depthY: 0.13 },
    { ox: 250, oy: 814, rx: 1.7, rz: 0.72, speed: 0.48, tex: textures.koiShowaTex, scale: 1.25, depthY: 0.15 },
    { ox: 425, oy: 652, rx: 1.8, rz: 0.7, speed: -0.54, tex: textures.koiKohakuTex, scale: 1.18, depthY: 0.14 },
    { ox: 342, oy: 640, rx: 1.5, rz: 0.6, speed: 0.42, tex: textures.koiYamabukiTex, scale: 1.1, depthY: 0.12 },
  ];
  for (let i = 0; i < koiConfigs.length; i++) {
    const kc = koiConfigs[i];
    const origin = world2DTo3D(kc.ox, kc.oy);
    const { group, tail, pectoralL, pectoralR } = createKoiModel(kc.tex, kc.scale);
    group.position.set(origin.x, kc.depthY, origin.z);
    root.add(group);
    koiSchool.push({
      group,
      tail,
      pectoralL,
      pectoralR,
      originX: origin.x,
      originZ: origin.z,
      rx: kc.rx,
      rz: kc.rz,
      speed: kc.speed,
      phase: i * 1.4,
      depthY: kc.depthY,
    });
  }

  // 3D Lotus Pads & Layered Blooms across north & south pond waters
  const lotusSpots = [
    { x: 218, y: 652, flower: true },
    { x: 315, y: 632, flower: false },
    { x: 438, y: 648, flower: true },
    { x: 486, y: 676, flower: true },
    { x: 228, y: 812, flower: true },
    { x: 342, y: 838, flower: false },
    { x: 458, y: 816, flower: true },
    { x: 184, y: 688, flower: false },
  ];
  for (const ls of lotusSpots) {
    const lp = world2DTo3D(ls.x, ls.y);
    root.add(createLotusFlower3D(lp.x, 0.255, lp.z, ls.flower));
  }

  // West Tea Deck beside Ao Sen Bridge West Entry
  const teaDeckP = world2DTo3D(88, 735);
  const teaDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.22, 4.4)), woodMat);
  teaDeck.position.set(teaDeckP.x, 0.11, teaDeckP.z);
  teaDeck.receiveShadow = true;
  root.add(teaDeck);

  // 6. Chánh Điện (Elongated Main Sanctuary Platform y: -85..495 for 10 Cushions & Dual Shrines)
  const sancP = world2DTo3D(960, 205);
  const sancBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(560 * WORLD_TO_3D_SCALE, 0.28, 580 * WORLD_TO_3D_SCALE)),
    woodMat
  );
  sancBase.position.set(sancP.x, 0.12, sancP.z);
  sancBase.receiveShadow = true;
  root.add(sancBase);

  // Entrance stone steps
  const stepP = world2DTo3D(960, 515);
  for (let s = 0; s < 3; s++) {
    const stepMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.4, 0.09, 0.55)), stoneMat);
    stepMesh.position.set(stepP.x, 0.05 + s * 0.075, stepP.z + 0.5 - s * 0.5);
    stepMesh.receiveShadow = true;
    root.add(stepMesh);
  }

  // Wide Crimson Sanctuary Carpet spanning both rows of 10 cushions
  const carpetP = world2DTo3D(960, 303.5);
  const carpetMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x99352c, roughness: 0.85 }));
  const carpet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.88, 0.02, 15.32)), carpetMat);
  carpet.position.set(carpetP.x, 0.265, carpetP.z);
  carpet.receiveShadow = true;
  root.add(carpet);

  // Crimson Lacquered Pillars with Golden Bases
  const pillarCoords = [
    { x: 720, y: 468 }, { x: 830, y: 468 }, { x: 1090, y: 468 }, { x: 1200, y: 468 },
    { x: 720, y: 185 }, { x: 1200, y: 185 },
    { x: 720, y: -52 }, { x: 1200, y: -52 },
  ];
  for (const pc of pillarCoords) {
    const pp = world2DTo3D(pc.x, pc.y);
    const base = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 0.2, 14)), stoneMat);
    base.position.set(pp.x, 0.34, pp.z);
    root.add(base);

    const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.24, 4.75, 14)), crimsonPillarMat);
    col.position.set(pp.x, 2.72, pp.z);
    col.castShadow = true;
    root.add(col);

    const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.24, 0.04, 8, 16)), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pp.x, 0.5, pp.z);
    root.add(ring);
  }

  // Back wall behind unified dual Altar at north end of elongated Chánh Điện
  const backWallP = world2DTo3D(960, -72);
  const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20.5, 4.75, 0.45)), darkWoodMat);
  backWall.position.set(backWallP.x, 2.62, backWallP.z);
  backWall.receiveShadow = true;
  root.add(backWall);

  // Unified Wide Sacred Altar Table & Dual Sculpted Shrines (Phật & Bồ Tát side-by-side)
  const altarP = world2DTo3D(960, 82);
  const altarTable = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.6, 1.35, 1.45)), darkWoodMat);
  altarTable.position.set(altarP.x, 0.92, altarP.z);
  altarTable.castShadow = true;
  altarTable.receiveShadow = true;
  root.add(altarTable);

  const altarTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.76, 0.1, 1.54)), goldMat);
  altarTrim.position.set(altarP.x, 1.56, altarP.z);
  root.add(altarTrim);

  // Left Shrine: Phật Thích Ca Mâu Ni (876) & Right Shrine: Bồ Tát Quán Thế Âm (1044)
  const buddhaP = world2DTo3D(876, 82);
  const buddhaStatueRes = createSculptedAltarStatue(
    'buddha',
    isSoftwareGl,
    textures.woodPlankTex.anisotropy
  );
  buddhaStatueRes.group.position.set(buddhaP.x, 0.25, altarP.z - 1.62);
  root.add(buddhaStatueRes.group);

  const quanAmP = world2DTo3D(1044, 82);
  const quanAmStatueRes = createSculptedAltarStatue(
    'quanAm',
    isSoftwareGl,
    textures.woodPlankTex.anisotropy
  );
  quanAmStatueRes.group.position.set(quanAmP.x, 0.25, altarP.z - 1.62);
  root.add(quanAmStatueRes.group);

  // Central golden altar censer with ash bed, burning incense sticks & rising smoke
  const altarCenserGroup = new THREE.Group();
  altarCenserGroup.position.set(altarP.x, 1.61, altarP.z - 0.1);
  const altarBowlProfile = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.22, 0.02),
    new THREE.Vector2(0.16, 0.08),
    new THREE.Vector2(0.31, 0.2),
    new THREE.Vector2(0.29, 0.31),
    new THREE.Vector2(0.36, 0.36),
    new THREE.Vector2(0.25, 0.36),
    new THREE.Vector2(0.23, 0.29),
  ];
  const altarCenserBowl = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(altarBowlProfile, 18)), goldMat);
  altarCenserBowl.castShadow = !isSoftwareGl;
  altarCenserGroup.add(altarCenserBowl);

  for (const side of [-0.32, 0.32]) {
    const altarEar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.08, 0.024, 8, 12)), goldMat);
    altarEar.position.set(side, 0.24, 0);
    altarCenserGroup.add(altarEar);
  }

  const altarAshBed = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x7d766e, roughness: 0.95 }))
  );
  altarAshBed.position.y = 0.31;
  altarCenserGroup.add(altarAshBed);

  const altarStickMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xb56840, roughness: 0.72 }));
  const altarEmberMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xff6e38, emissive: 0xff5a20, emissiveIntensity: 2.3 })
  );
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 0.055;
    const stickHolder = new THREE.Group();
    stickHolder.position.set(off, 0.32, (i % 2 === 0 ? 1 : -1) * 0.025);
    stickHolder.rotation.z = -off * 0.45;
    const stick = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.011, 0.011, 0.44, 6)), altarStickMat);
    stick.position.y = 0.22;
    stickHolder.add(stick);
    const ember = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.021, 6, 6)), altarEmberMat);
    ember.position.y = 0.44;
    stickHolder.add(ember);
    altarCenserGroup.add(stickHolder);
  }

  const altarSmokeParticles = new THREE.Group();
  altarSmokeParticles.position.set(0, 0.78, 0);
  const altarSmokeMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xf4eee4, transparent: true, opacity: 0.2, depthWrite: false })
  );
  for (let s = 0; s < 5; s++) {
    const puff = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 7, 7)), altarSmokeMat);
    puff.userData = { seed: s * 0.8 };
    altarSmokeParticles.add(puff);
  }
  altarCenserGroup.add(altarSmokeParticles);
  root.add(altarCenserGroup);

  // Altar Candles flanking left, center & right
  const flameMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff9f38, emissiveIntensity: 1.8 })
  );
  for (const cx of [-4.9, -0.75, 0.75, 4.9]) {
    const stick = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.08, 0.09, 0.45, 10)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xd44b3b, roughness: 0.4 }))
    );
    stick.position.set(altarP.x + cx, 1.82, altarP.z + 0.25);
    root.add(stick);

    const flame = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.08, 8, 8)), flameMat);
    flame.scale.set(0.8, 1.5, 0.8);
    flame.position.set(altarP.x + cx, 2.12, altarP.z + 0.25);
    root.add(flame);
    lanternFlames.push(flame);
  }

  // Sanctuary Curved Roof (elongated northward overhead at y = 4.85m so player walks unobstructed beneath)
  const sancRoof = createCurvedRoofGroup(24.8, 25.0, 4.1, tileRoofMat, goldMat, crimsonPillarMat, !isSoftwareGl);
  sancRoof.position.set(sancP.x, 4.85, sancP.z);
  root.add(sancRoof);

  // Meditation Cushions (Bồ đoàn) inside Chánh Điện
  for (const cushion of CUSHION_POSITIONS) {
    const cp = world2DTo3D(cushion.x, cushion.y);
    const cg = new THREE.Group();
    cg.position.set(cp.x, 0.26, cp.z);

    const pad = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.55, 0.62, 0.18, 18)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x8a5133, roughness: 0.78 }))
    );
    pad.position.y = 0.09;
    cg.add(pad);

    const trim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.54, 0.035, 8, 20)), goldMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.16;
    cg.add(trim);

    registerClickable(cg, clickables, {
      kind: 'cushion',
      index: cushion.index,
      label: `${cushion.label} (Tọa thiền)`,
    });
    root.add(cg);
  }

  // Embroidered Golden Lotus Bowing Mat (Thảm Lạy Phật) in Chánh Điện
  const bowPos3 = world2DTo3D(INTERACTABLES.bow.x, INTERACTABLES.bow.y);
  const bowMatGroup = new THREE.Group();
  bowMatGroup.position.set(bowPos3.x, 0.275, bowPos3.z);

  const bowOuterPad = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.48, 0.06, 1.05)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xb64533, roughness: 0.82 }))
  );
  bowOuterPad.position.y = 0.03;
  bowOuterPad.receiveShadow = true;
  bowMatGroup.add(bowOuterPad);

  const bowGoldBorder = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.36, 0.07, 0.94)), goldMat);
  bowGoldBorder.position.y = 0.03;
  bowMatGroup.add(bowGoldBorder);

  const bowInnerVelvet = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.24, 0.078, 0.82)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x8d2b22, roughness: 0.86 }))
  );
  bowInnerVelvet.position.y = 0.03;
  bowMatGroup.add(bowInnerVelvet);

  const bowLotusEmblem = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.22, 16)), goldMat);
  bowLotusEmblem.rotation.x = -Math.PI / 2;
  bowLotusEmblem.position.y = 0.072;
  bowMatGroup.add(bowLotusEmblem);

  registerClickable(bowMatGroup, clickables, {
    kind: 'interactable',
    action: 'bow',
    label: INTERACTABLES.bow.label,
  });
  root.add(bowMatGroup);

  // 7. Lầu Chuông (Bell Pavilion) & Đại Hồng Chung
  const bellPos = world2DTo3D(INTERACTABLES.bell.x, INTERACTABLES.bell.y);
  const bellBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.4, 0.18, 5.0)), woodMat);
  bellBase.position.set(bellPos.x, 0.09, bellPos.z);
  bellBase.receiveShadow = true;
  root.add(bellBase);

  for (const dx of [-2.1, 2.1]) {
    for (const dz of [-1.9, 1.9]) {
      const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.18, 3.6, 10)), crimsonPillarMat);
      col.position.set(bellPos.x + dx, 1.95, bellPos.z + dz);
      col.castShadow = true;
      root.add(col);
    }
  }
  const bellRoof = createCurvedRoofGroup(6.6, 6.2, 2.2, tileRoofMat, goldMat, crimsonPillarMat, !isSoftwareGl);
  bellRoof.position.set(bellPos.x, 3.7, bellPos.z);
  root.add(bellRoof);

  const bellStand = new THREE.Group();
  bellStand.position.set(bellPos.x, 0.18, bellPos.z);
  for (const sx of [-1.05, 1.05]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 2.5, 0.18)), darkWoodMat);
    leg.position.set(sx, 1.25, 0);
    bellStand.add(leg);
  }
  const crossBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.22, 0.24)), darkWoodMat);
  crossBeam.position.set(0, 2.48, 0);
  bellStand.add(crossBeam);

  const bellBody = new THREE.Group();
  bellBody.position.set(0, 2.4, 0);
  const bellProfile = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.32, -0.05),
    new THREE.Vector2(0.45, -0.45),
    new THREE.Vector2(0.56, -1.05),
    new THREE.Vector2(0.66, -1.32),
    new THREE.Vector2(0.54, -1.32),
  ];
  const bellMesh = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(bellProfile, 22)), bronzeMat);
  bellMesh.castShadow = true;
  bellBody.add(bellMesh);
  const bellCrown = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.14, 0.045, 8, 16)), goldMat);
  bellCrown.position.y = 0.02;
  bellBody.add(bellCrown);
  bellStand.add(bellBody);
  registerClickable(bellStand, clickables, {
    kind: 'interactable',
    action: 'bell',
    label: INTERACTABLES.bell.label,
  });
  root.add(bellStand);

  // 8. Gác Mõ (Woodfish Pavilion) & Carved Woodfish
  const woodPos = world2DTo3D(INTERACTABLES.woodfish.x, INTERACTABLES.woodfish.y);
  const woodBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.4, 0.18, 5.0)), woodMat);
  woodBase.position.set(woodPos.x, 0.09, woodPos.z);
  woodBase.receiveShadow = true;
  root.add(woodBase);

  for (const dx of [-2.1, 2.1]) {
    for (const dz of [-1.9, 1.9]) {
      const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.18, 3.6, 10)), crimsonPillarMat);
      col.position.set(woodPos.x + dx, 1.95, woodPos.z + dz);
      col.castShadow = true;
      root.add(col);
    }
  }
  const woodRoof = createCurvedRoofGroup(6.6, 6.2, 2.2, tileRoofMat, goldMat, crimsonPillarMat, !isSoftwareGl);
  woodRoof.position.set(woodPos.x, 3.7, woodPos.z);
  root.add(woodRoof);

  const woodfishStand = new THREE.Group();
  woodfishStand.position.set(woodPos.x, 0.18, woodPos.z);
  const wfPedestal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.55, 0.85, 14)), darkWoodMat);
  wfPedestal.position.y = 0.425;
  woodfishStand.add(wfPedestal);
  const wfCushion = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.36, 0.1, 8, 18)),
    crimsonPillarMat
  );
  wfCushion.rotation.x = Math.PI / 2;
  wfCushion.position.y = 0.88;
  woodfishStand.add(wfCushion);

  const woodfishBody = new THREE.Group();
  woodfishBody.position.set(0, 1.15, 0);
  const wfShell = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.44, 18, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xa56237, roughness: 0.42 }))
  );
  wfShell.scale.set(1.22, 0.9, 0.95);
  wfShell.castShadow = true;
  woodfishBody.add(wfShell);
  const wfSlit = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.55, 0.08, 0.5)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x26150c, roughness: 0.9 }))
  );
  wfSlit.position.set(0.18, -0.02, 0);
  woodfishBody.add(wfSlit);
  woodfishStand.add(woodfishBody);
  registerClickable(woodfishStand, clickables, {
    kind: 'interactable',
    action: 'woodfish',
    label: INTERACTABLES.woodfish.label,
  });
  root.add(woodfishStand);

  // 9. Lư Hương (Bronze Incense Cauldron) & Rising Smoke
  const incPos = world2DTo3D(INTERACTABLES.incense.x, INTERACTABLES.incense.y);
  const incGroup = new THREE.Group();
  incGroup.position.set(incPos.x, 0.06, incPos.z);

  const incPlinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.95, 1.12, 0.45, 16)), stoneMat);
  incPlinth.position.y = 0.225;
  incPlinth.castShadow = true;
  incGroup.add(incPlinth);

  const bowlProfile = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.42, 0.05),
    new THREE.Vector2(0.76, 0.42),
    new THREE.Vector2(0.68, 0.72),
    new THREE.Vector2(0.82, 0.8),
    new THREE.Vector2(0.56, 0.8),
    new THREE.Vector2(0.52, 0.68),
  ];
  const bowl = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(bowlProfile, 22)), bronzeMat);
  bowl.position.y = 0.45;
  bowl.castShadow = true;
  incGroup.add(bowl);

  for (const side of [-0.76, 0.76]) {
    const ear = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.18, 0.055, 8, 14)), goldMat);
    ear.position.set(side, 1.05, 0);
    incGroup.add(ear);
  }

  const ashBed = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.54, 0.54, 0.08, 16)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x7a736c, roughness: 0.95 }))
  );
  ashBed.position.y = 1.14;
  incGroup.add(ashBed);

  const courtSticksGroup = new THREE.Group();
  incGroup.add(courtSticksGroup);
  const stickMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xb56840, roughness: 0.75 }));
  const emberMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xff6e38, emissive: 0xff5a20, emissiveIntensity: 2 })
  );
  const sharedStickGeo = trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 6));
  const sharedEmberGeo = trackGeo(new THREE.SphereGeometry(0.02, 6, 6));

  const updateCourtIncenseSticks3D = (activeCount: number) => {
    while (courtSticksGroup.children.length > 0) {
      courtSticksGroup.remove(courtSticksGroup.children[0]);
    }
    const stickCount = Math.min(9, Math.max(1, activeCount));
    for (let i = 0; i < stickCount; i++) {
      const off = (i - (stickCount - 1) / 2) * 0.085;
      const stick = new THREE.Mesh(sharedStickGeo, stickMat);
      stick.position.set(off, 1.4, (i % 2 === 0 ? 1 : -1) * 0.05);
      stick.rotation.z = -off * 0.28;
      courtSticksGroup.add(stick);
      const ember = new THREE.Mesh(sharedEmberGeo, emberMat);
      ember.position.set(off * 1.18, 1.66, (i % 2 === 0 ? 1 : -1) * 0.05);
      courtSticksGroup.add(ember);
    }
  };
  updateCourtIncenseSticks3D(Math.min(2, Math.max(1, incenseCount)));

  const smokeParticles = new THREE.Group();
  smokeParticles.position.set(0, 1.72, 0);
  const smokeMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xf4eee4, transparent: true, opacity: 0.22, depthWrite: false })
  );
  for (let s = 0; s < 8; s++) {
    const puff = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 8, 8)), smokeMat);
    puff.userData = { seed: s * 0.75 };
    smokeParticles.add(puff);
  }
  incGroup.add(smokeParticles);
  registerClickable(incGroup, clickables, {
    kind: 'interactable',
    action: 'incense',
    label: INTERACTABLES.incense.label,
  });
  root.add(incGroup);

  // 10. Bàn Xin Xăm (Fortune Slip Table)
  const fortPos = world2DTo3D(INTERACTABLES.fortune.x, INTERACTABLES.fortune.y);
  const fortGroup = new THREE.Group();
  fortGroup.position.set(fortPos.x, 0.06, fortPos.z);

  const fTableTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.3, 0.12, 0.9)), darkWoodMat);
  fTableTop.position.y = 0.86;
  fTableTop.castShadow = true;
  fortGroup.add(fTableTop);
  for (const lx of [-0.52, 0.52]) {
    for (const lz of [-0.34, 0.34]) {
      const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.86, 0.1)), darkWoodMat);
      leg.position.set(lx, 0.43, lz);
      fortGroup.add(leg);
    }
  }
  const tube = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.48, 12)), bambooMat);
  tube.position.set(0, 1.16, 0);
  fortGroup.add(tube);
  for (let s = -2; s <= 2; s++) {
    const stick = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.024, 0.36, 0.015)), goldMat);
    stick.position.set(s * 0.032, 1.38 + (Math.abs(s) % 2) * 0.05, 0);
    stick.rotation.z = s * 0.08;
    fortGroup.add(stick);
  }
  registerClickable(fortGroup, clickables, {
    kind: 'interactable',
    action: 'fortune',
    label: INTERACTABLES.fortune.label,
  });
  root.add(fortGroup);

  // 11. Realistic Bodhi Tree (Cây Bồ Đề) with Spreading Roots, Forked Trunk, Layered Canopy & Leaf-Sweeping Station
  const bodhiPos = world2DTo3D(285, 310);
  const bodhiGroup = new THREE.Group();
  bodhiGroup.position.set(bodhiPos.x, 0, bodhiPos.z);

  // Mossy soil mound
  const mound = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.4, 2.0, 0.25, 16)), mossMat);
  mound.position.y = 0.12;
  bodhiGroup.add(mound);

  // Spreading gnarled surface roots
  for (let r = 0; r < 5; r++) {
    const ang = (r / 5) * Math.PI * 2 + 0.3;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(ang) * 0.35, 0.75, Math.sin(ang) * 0.35),
      new THREE.Vector3(Math.cos(ang) * 0.9, 0.28, Math.sin(ang) * 0.9),
      new THREE.Vector3(Math.cos(ang) * 1.65, 0.06, Math.sin(ang) * 1.65),
    ]);
    const rootMesh = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(curve, 10, 0.16, 7, false)), barkMat);
    rootMesh.castShadow = true;
    bodhiGroup.add(rootMesh);
  }

  // Main gnarled trunk & 4 structural boughs
  const trunkMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.48, 0.72, 3.2, 12)), barkMat);
  trunkMesh.position.y = 1.6;
  trunkMesh.castShadow = true;
  bodhiGroup.add(trunkMesh);

  const boughs = [
    [0.0, 2.7, 0.0, -1.6, 4.3, -0.9],
    [0.0, 2.8, 0.0, 1.7, 4.4, -0.6],
    [0.0, 2.9, 0.0, -0.9, 4.6, 1.4],
    [0.0, 2.8, 0.0, 1.3, 4.2, 1.2],
  ];
  for (const b of boughs) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(b[0], b[1], b[2]),
      new THREE.Vector3((b[0] + b[3]) * 0.5, (b[1] + b[4]) * 0.52, (b[2] + b[5]) * 0.5),
      new THREE.Vector3(b[3], b[4], b[5]),
    ]);
    const limb = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(curve, 10, 0.2, 8, false)), barkMat);
    limb.castShadow = true;
    bodhiGroup.add(limb);
  }

  // Layered multi-tone Bodhi leaf canopy
  const bodhiCanopy = new THREE.Group();
  const leafColors = [0x406c3c, 0x4f8249, 0x5d9652, 0x72ab60, 0x84bd6f];
  const crownPuffs = [
    { x: -1.7, y: 4.5, z: -0.9, r: 1.55, c: 0 },
    { x: 1.8, y: 4.6, z: -0.7, r: 1.6, c: 1 },
    { x: -1.0, y: 4.8, z: 1.4, r: 1.45, c: 1 },
    { x: 1.3, y: 4.4, z: 1.3, r: 1.4, c: 2 },
    { x: 0.0, y: 5.5, z: 0.0, r: 1.85, c: 3 },
    { x: -0.9, y: 5.2, z: -0.3, r: 1.3, c: 4 },
    { x: 1.0, y: 5.1, z: 0.4, r: 1.25, c: 4 },
  ];
  for (const pf of crownPuffs) {
    const leafMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: leafColors[pf.c],
        roughness: 0.78,
        metalness: 0.0,
      })
    );
    const puff = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(pf.r, 1)), leafMat);
    puff.scale.set(1.15, 0.82, 1.15);
    puff.position.set(pf.x, pf.y, pf.z);
    puff.castShadow = !isSoftwareGl;
    puff.receiveShadow = true;
    bodhiCanopy.add(puff);
  }
  bodhiGroup.add(bodhiCanopy);
  root.add(bodhiGroup);

  // Stone bench beside Bodhi tree
  const benchP = world2DTo3D(384, 339);
  const bodhiBench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.3, 0.46, 0.72)), stoneMat);
  bodhiBench.position.set(benchP.x, 0.23, benchP.z);
  bodhiBench.castShadow = true;
  root.add(bodhiBench);

  // Leaf-Sweeping Station (Quét lá · Chổi tre & lá vàng rơi)
  const sweepPos = world2DTo3D(INTERACTABLES.sweep.x, INTERACTABLES.sweep.y);
  const sweepGroup = new THREE.Group();
  sweepGroup.position.set(sweepPos.x, 0, sweepPos.z);

  const goldenLeafMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdba64c, roughness: 0.7, side: THREE.DoubleSide })
  );
  const fallenOffsets = [
    [-0.7, 0.03, 0.2], [-0.3, 0.03, 0.55], [0.45, 0.03, 0.38],
    [0.8, 0.03, -0.15], [-0.2, 0.03, -0.35], [0.22, 0.03, 0.68],
  ];
  for (let i = 0; i < fallenOffsets.length; i++) {
    const [lx, ly, lz] = fallenOffsets[i];
    const leaf = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.16, 6)), goldenLeafMat);
    leaf.rotation.x = -Math.PI / 2;
    leaf.rotation.z = i * 0.9;
    leaf.position.set(lx, ly, lz);
    sweepGroup.add(leaf);
  }

  // Extra scattered golden Bodhi leaves extending into the expanded sweeping courtyard
  const extraYardLeaves3D = [
    { x: 225, y: 416 },
    { x: 176, y: 405 },
    { x: 132, y: 392 },
    { x: 88, y: 372 },
    { x: 256, y: 382 },
  ];
  extraYardLeaves3D.forEach((el, idx) => {
    const ep = world2DTo3D(el.x, el.y);
    const leaf = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.16, 6)), goldenLeafMat);
    leaf.rotation.x = -Math.PI / 2;
    leaf.rotation.z = idx * 1.1;
    leaf.position.set(ep.x, 0.032, ep.z);
    root.add(leaf);
  });

  const broomGroup = new THREE.Group();
  broomGroup.position.set(0, 0.04, 0);
  broomGroup.rotation.z = 0.22;
  const broomHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.035, 1.45, 8)), bambooMat);
  broomHandle.position.y = 0.88;
  broomGroup.add(broomHandle);
  const broomHead = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.28, 0.48, 8)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xd9b66c, roughness: 0.88 }))
  );
  broomHead.position.y = 0.24;
  broomGroup.add(broomHead);
  sweepGroup.add(broomGroup);
  registerClickable(sweepGroup, clickables, {
    kind: 'interactable',
    action: 'sweep',
    label: INTERACTABLES.sweep.label,
  });
  root.add(sweepGroup);

  // Ornamental layered evergreen garden trees framing the expanded Vườn Bồ Đề & Hòn Non Bộ
  const gardenTreeLeafMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b6c41, roughness: 0.82 }));
  for (const gt of [
    { x: -310, y: 115, scale: 1.05 },
    { x: -305, y: 425, scale: 1.0 },
  ]) {
    const gp = world2DTo3D(gt.x, gt.y);
    const tg = new THREE.Group();
    tg.position.set(gp.x, 0, gp.z);
    tg.scale.setScalar(gt.scale);
    const tTrunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 8)), barkMat);
    tTrunk.position.y = 0.75;
    tTrunk.castShadow = !isSoftwareGl;
    tg.add(tTrunk);
    for (let t = 0; t < 3; t++) {
      const tier = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(1.15 - t * 0.24, 1.45, 9)),
        gardenTreeLeafMat
      );
      tier.position.y = 1.65 + t * 0.8;
      tier.castShadow = !isSoftwareGl;
      tg.add(tier);
    }
    root.add(tg);
  }

  // 12. Fish Release Pier & Wooden Tub (Thả cá phóng sinh)
  const fishPos = world2DTo3D(INTERACTABLES.fish.x, INTERACTABLES.fish.y);
  const fishGroup = new THREE.Group();
  fishGroup.position.set(fishPos.x, 0, fishPos.z);

  const pierDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.24, 1.25)), woodMat);
  pierDeck.position.y = 0.12;
  pierDeck.receiveShadow = true;
  fishGroup.add(pierDeck);

  const tubOuter = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.56, 0.46, 0.36, 16, 1, true)),
    darkWoodMat
  );
  tubOuter.position.y = 0.42;
  fishGroup.add(tubOuter);

  const tubWater = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.52, 16)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x428b92, roughness: 0.15 }))
  );
  tubWater.rotation.x = -Math.PI / 2;
  tubWater.position.y = 0.52;
  fishGroup.add(tubWater);

  // Tiny golden carp inside tub
  const tubFish = createKoiModel(textures.koiKohakuTex, 0.65).group;
  tubFish.position.set(-0.08, 0.51, 0.04);
  fishGroup.add(tubFish);

  // Leaping Koi group shown during release effect
  const leapKoiGroup = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const lk = createKoiModel(i === 1 ? textures.koiYamabukiTex : textures.koiKohakuTex, 0.9).group;
    lk.visible = false;
    leapKoiGroup.add(lk);
  }
  fishGroup.add(leapKoiGroup);

  registerClickable(fishGroup, clickables, {
    kind: 'interactable',
    action: 'fish',
    label: INTERACTABLES.fish.label,
  });
  root.add(fishGroup);

  // 13. Segmented Bamboo Groves (Rừng Trúc) - south of Dàn Hoa Giấy Hồng so garden seating stays open
  const bambooClusters = [
    { x: 1450, y: 885, stalks: 6 },
    { x: 1615, y: 920, stalks: 7 },
    { x: 1775, y: 875, stalks: 6 },
    { x: 1530, y: 1005, stalks: 7 },
    { x: 1715, y: 1015, stalks: 6 },
    { x: 170, y: 1015, stalks: 6 },
    { x: 310, y: 1045, stalks: 5 },
  ];
  const bambooGroups: BambooSway3D[] = [];
  const bambooLeafMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6ea45c, roughness: 0.65, side: THREE.DoubleSide })
  );
  for (let c = 0; c < bambooClusters.length; c++) {
    const bc = bambooClusters[c];
    const bp = world2DTo3D(bc.x, bc.y);
    const bGroup = new THREE.Group();
    bGroup.position.set(bp.x, 0, bp.z);

    for (let i = 0; i < bc.stalks; i++) {
      const ox = (i - (bc.stalks - 1) / 2) * 0.48;
      const oz = ((i * 7) % 5 - 2) * 0.25;
      const h = 3.4 + (i % 3) * 0.85;
      const stalk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.085, h, 8)), bambooMat);
      stalk.position.set(ox, h / 2, oz);
      stalk.rotation.z = ((i % 3) - 1) * 0.05;
      stalk.castShadow = !isSoftwareGl;
      bGroup.add(stalk);

      for (let lf = 0; lf < 4; lf++) {
        const leafSpray = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.32, 0.85, 5)), bambooLeafMat);
        leafSpray.scale.set(1.2, 0.45, 0.4);
        leafSpray.position.set(ox + (lf % 2 === 0 ? 0.24 : -0.24), h * (0.7 + lf * 0.08), oz);
        leafSpray.rotation.z = (lf % 2 === 0 ? -0.9 : 0.9);
        bGroup.add(leafSpray);
      }
    }
    root.add(bGroup);
    bambooGroups.push({ group: bGroup, phase: c * 1.1 });
  }

  // 14. Stone Lanterns (Đèn Đá) along Walkways & Coastal Sea Deck
  const lanternCoords = [
    { x: 830, y: 1035 }, { x: 1090, y: 1035 }, { x: 830, y: 895 }, { x: 1090, y: 895 },
    { x: 548, y: 695 }, { x: 158, y: 695 }, { x: 705, y: 575 }, { x: 1215, y: 575 },
    { x: 1420, y: 625 }, { x: 440, y: 395 },
    { x: -310, y: 265 }, { x: 45, y: 115 }, { x: 45, y: 425 },
    { x: 845, y: -592 }, { x: 1075, y: -592 },
    { x: 165, y: -395 }, { x: 495, y: -395 }, { x: 165, y: -110 }, { x: 495, y: -110 },
  ];
  for (const lc of lanternCoords) {
    const lp = world2DTo3D(lc.x, lc.y);
    const lg = new THREE.Group();
    lg.position.set(lp.x, 0, lp.z);
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.75, 0.25, 0.75)), stoneMat);
    base.position.y = 0.125;
    lg.add(base);
    const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 0.95, 8)), stoneMat);
    post.position.y = 0.7;
    lg.add(post);
    const lanternCore = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 0.42, 0.38)), flameMat);
    lanternCore.position.y = 1.35;
    lg.add(lanternCore);
    lanternFlames.push(lanternCore);
    const cap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.54, 0.38, 4)), stoneMat);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 1.72;
    lg.add(cap);
    root.add(lg);
  }

  // 14b. Guiding Silk Lantern Posts (Hệ Thống Đèn Lồng Dẫn Lối: Chánh Điện -> Hòn Non Bộ & Công Viên Cầu Siêu)
  const pathLanternPivots: THREE.Group[] = [];
  const pathLanternGlowMats: THREE.MeshBasicMaterial[] = [];

  const createLanternGroundGlowTex = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255, 206, 118, 0.95)');
    g.addColorStop(0.45, 'rgba(255, 168, 76, 0.42)');
    g.addColorStop(1, 'rgba(255, 140, 48, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const pathGlowTex = createLanternGroundGlowTex();
  disposableTexs.push(pathGlowTex);

  const pathSilkLanternMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe65336,
      emissive: 0xff8a30,
      emissiveIntensity: 1.25,
      roughness: 0.42,
      transparent: true,
      opacity: 0.93,
    })
  );
  const pathTasselMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd93829,
      emissive: 0x4f120b,
      emissiveIntensity: 0.35,
      roughness: 0.72,
    })
  );
  const pathGlowPoolGeo = trackGeo(new THREE.CircleGeometry(1.45, 20));
  pathGlowPoolGeo.rotateX(-Math.PI / 2);

  for (const pl of PATH_LANTERN_POSTS) {
    const pp = world2DTo3D(pl.x, pl.y);
    const postGroup = new THREE.Group();
    postGroup.position.set(pp.x, 0, pp.z);
    // Notice 2D armDir angles map to 3D XZ plane via rotation.y = -armDir (since +X -> +X, +Y -> +Z)
    postGroup.rotation.y = -pl.armDir;

    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.16, 0.42)), stoneMat);
    plinth.position.y = 0.08;
    plinth.receiveShadow = true;
    postGroup.add(plinth);

    const timberPost = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.065, 0.085, 2.52, 8)),
      darkWoodMat
    );
    timberPost.position.y = 1.38;
    timberPost.castShadow = !isSoftwareGl;
    postGroup.add(timberPost);

    const postCrown = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.085, 8, 6)), goldMat);
    postCrown.position.y = 2.66;
    postGroup.add(postCrown);

    // Overhanging wooden arm extending along +X (in local rotated coordinates)
    const arm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 0.075, 0.08)), darkWoodMat);
    arm.position.set(0.26, 2.48, 0);
    postGroup.add(arm);

    const armTip = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.052, 8, 6)), goldMat);
    armTip.position.set(0.55, 2.49, 0);
    postGroup.add(armTip);

    const strut = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.4, 0.05, 0.05)), woodMat);
    strut.position.set(0.16, 2.31, 0);
    strut.rotation.z = 0.68;
    postGroup.add(strut);

    // Swaying silk lantern pivot hung at arm tip
    const pivot = new THREE.Group();
    pivot.position.set(0.48, 2.46, 0);
    pivot.userData = { seed: pl.x * 0.03 + pl.y * 0.02 };

    const cord = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)), goldMat);
    cord.position.y = -0.11;
    pivot.add(cord);

    const topRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.045, 12)), goldMat);
    topRing.position.y = -0.23;
    pivot.add(topRing);

    const silkBody = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.21, 14, 10)), pathSilkLanternMat);
    silkBody.scale.set(1.0, 1.32, 1.0);
    silkBody.position.y = -0.49;
    pivot.add(silkBody);

    const innerFlame = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 8, 8)), flameMat);
    innerFlame.position.y = -0.49;
    lanternFlames.push(innerFlame);
    pivot.add(innerFlame);

    const bottomRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.1, 0.045, 12)), goldMat);
    bottomRing.position.y = -0.75;
    pivot.add(bottomRing);

    const tassel = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.042, 0.22, 8)), pathTasselMat);
    tassel.position.y = -0.88;
    pivot.add(tassel);

    postGroup.add(pivot);
    pathLanternPivots.push(pivot);

    // Warm additive glow pool directly beneath the lantern over the walkway
    const poolMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: pathGlowTex,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    pathLanternGlowMats.push(poolMat);
    const glowPool = new THREE.Mesh(pathGlowPoolGeo, poolMat);
    glowPool.position.set(0.46, 0.035, 0);
    postGroup.add(glowPool);

    root.add(postGroup);
  }

  // 15. Ornamental Bonsai Planters outside Chánh Điện Door Guardians (courtyard stone benches built interactively in Section 25)
  for (const px of [792, 1128]) {
    const pp = world2DTo3D(px, 536);
    const pg = new THREE.Group();
    pg.position.set(pp.x, 0.04, pp.z);
    const pot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.35, 0.48, 12)), darkWoodMat);
    pot.position.y = 0.24;
    pg.add(pot);
    const trunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.12, 0.72, 8)), barkMat);
    trunk.position.y = 0.75;
    pg.add(trunk);
    const foliage = new THREE.Mesh(
      trackGeo(new THREE.IcosahedronGeometry(0.48, 1)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x4f8a54, roughness: 0.75 }))
    );
    foliage.position.y = 1.18;
    pg.add(foliage);
    root.add(pg);
  }

  // 15b. 12 La Hán Statues & 2 Chánh Điện Door Guardians (exact 2D sculpture artwork)
  const courtyardStatuesRes = createCourtyardStatues3D(
    isSoftwareGl,
    textures.woodPlankTex.anisotropy
  );
  root.add(courtyardStatuesRes.group);

  // 16. Cổng Tam Quan (Southern Archway Gate)
  const gatePos = world2DTo3D(960, 1125);
  const gateGroup = new THREE.Group();
  gateGroup.position.set(gatePos.x, 0, gatePos.z);
  for (const gx of [-4.2, 4.2]) {
    const gCol = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 4.1, 14)), crimsonPillarMat);
    gCol.position.set(gx, 2.05, 0);
    gCol.castShadow = true;
    gateGroup.add(gCol);
  }
  const gateRoof = createCurvedRoofGroup(10.8, 3.2, 2.4, tileRoofMat, goldMat, crimsonPillarMat, !isSoftwareGl);
  gateRoof.position.set(0, 4.05, 0);
  gateGroup.add(gateRoof);
  root.add(gateGroup);

  // 17. 3D Sunlit Floating Dust Motes & Petals inside the Temple Grounds
  const moteCount = 150;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.56) * 76;
    motePos[i * 3 + 1] = 0.4 + Math.random() * 5.8;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 44;
  }
  const moteGeo = trackGeo(new THREE.BufferGeometry());
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = trackMat(
    new THREE.PointsMaterial({
      size: 0.24,
      map: textures.moteGlowTex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const ambientMotes = new THREE.Points(moteGeo, moteMat);
  root.add(ambientMotes);

  // 18. Thủy Đình Lantern Table (136, 765) & North Koi Feed Jar (345, 618)
  const lanternStandP = world2DTo3D(INTERACTABLES.lantern.x, INTERACTABLES.lantern.y);
  const lanternStand = new THREE.Group();
  lanternStand.position.set(lanternStandP.x, 0.22, lanternStandP.z);
  const lTableTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 0.1, 0.85)), darkWoodMat);
  lTableTop.position.y = 0.72;
  lTableTop.castShadow = true;
  lanternStand.add(lTableTop);
  for (const lx of [-0.45, 0.45]) {
    for (const lz of [-0.3, 0.3]) {
      const lLeg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.72, 0.08)), darkWoodMat);
      lLeg.position.set(lx, 0.36, lz);
      lanternStand.add(lLeg);
    }
  }
  const sampleGold = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.14, 0.16, 8)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xf3b44c, emissive: 0x8f5610, emissiveIntensity: 0.6 }))
  );
  sampleGold.position.set(-0.22, 0.85, 0);
  lanternStand.add(sampleGold);
  const sampleLotus = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.14, 0.16, 8)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xeb82a0, emissive: 0x7d2642, emissiveIntensity: 0.6 }))
  );
  sampleLotus.position.set(0.22, 0.85, 0);
  lanternStand.add(sampleLotus);
  registerClickable(lanternStand, clickables, {
    kind: 'interactable',
    action: 'lantern',
    label: INTERACTABLES.lantern.label,
  });
  root.add(lanternStand);

  const feedJarP = world2DTo3D(INTERACTABLES.feed_koi.x, INTERACTABLES.feed_koi.y);
  const feedJarGroup = new THREE.Group();
  feedJarGroup.position.set(feedJarP.x, 0, feedJarP.z);
  const jarBody = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.32, 0.24, 0.56, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x9e5c3e, roughness: 0.55 }))
  );
  jarBody.position.y = 0.28;
  jarBody.castShadow = true;
  feedJarGroup.add(jarBody);
  const jarGrain = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.26, 12)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xe8b85a, roughness: 0.85 }))
  );
  jarGrain.rotation.x = -Math.PI / 2;
  jarGrain.position.y = 0.57;
  feedJarGroup.add(jarGrain);
  registerClickable(feedJarGroup, clickables, {
    kind: 'interactable',
    action: 'feed_koi',
    label: INTERACTABLES.feed_koi.label,
  });
  root.add(feedJarGroup);

  const koiPelletOrigin = world2DTo3D(POND_SPEC.cx, 635);
  const koiPelletGroup = new THREE.Group();
  koiPelletGroup.position.set(koiPelletOrigin.x, 0.26, koiPelletOrigin.z);
  koiPelletGroup.visible = false;
  const pelletMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf4c65c, roughness: 0.6 }));
  for (let i = 0; i < 8; i++) {
    const pel = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 6, 6)), pelletMat);
    pel.position.set(Math.sin(i * 2.3) * 0.75, 0, Math.cos(i * 1.7) * 0.42);
    koiPelletGroup.add(pel);
  }
  root.add(koiPelletGroup);

  // 19. Dynamic Floating Pond Wish Lanterns (Hoa Đăng Ao Sen)
  const pondLanternsGroup = new THREE.Group();
  root.add(pondLanternsGroup);

  const lanternColorHex: Record<LanternColor, number> = {
    gold: 0xf3b44c,
    lotus: 0xeb82a0,
    jade: 0x6cc4a6,
    ivory: 0xf5ead2,
  };

  const updatePondLanterns3D = (lanterns: PondLanternState[]) => {
    disposeGroupChildren(pondLanternsGroup);
    for (let i = 0; i < lanterns.length; i++) {
      const l = lanterns[i];
      const angle = ((l.seed % 100) / 100) * Math.PI * 2 + i * 0.85;
      const distFactor = 0.28 + ((l.seed % 7) / 7) * 0.48;
      let lx2d = POND_SPEC.cx + Math.cos(angle) * 155 * distFactor;
      let ly2d = POND_SPEC.cy + Math.sin(angle) * 98 * distFactor;
      // Nudge floating lanterns north or south of Cầu Ao Sen bridge corridor
      if (Math.abs(ly2d - POND_SPEC.cy) < 34) {
        ly2d = ly2d >= POND_SPEC.cy ? POND_SPEC.cy + 46 : POND_SPEC.cy - 46;
      }
      const p3 = world2DTo3D(lx2d, ly2d);

      const lg = new THREE.Group();
      lg.position.set(p3.x, 0.27, p3.z);
      lg.userData = { baseX: p3.x, baseZ: p3.z, seed: l.seed };

      const colHex = lanternColorHex[l.color] || lanternColorHex.gold;
      const cupMat = new THREE.MeshStandardMaterial({
        color: colHex,
        emissive: colHex,
        emissiveIntensity: 0.72,
        roughness: 0.42,
      });
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.11, 0.14, 8), cupMat);
      cup.position.y = 0.07;
      lg.add(cup);

      const candle = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe68a })
      );
      candle.position.y = 0.15;
      lg.add(candle);

      pondLanternsGroup.add(lg);
    }
  };

  // 20. Vườn Hoa Liên Tâm (6 Interactive Flower Beds + Water Jar)
  const gardenBaseP = world2DTo3D(624, 998);
  const gardenLawn = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(344 * WORLD_TO_3D_SCALE, 0.06, 152 * WORLD_TO_3D_SCALE)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x567344, roughness: 0.92 }))
  );
  gardenLawn.position.set(gardenBaseP.x, 0.02, gardenBaseP.z);
  gardenLawn.receiveShadow = true;
  root.add(gardenLawn);

  const waterJarP = world2DTo3D(768, 1000);
  const waterJarGroup = new THREE.Group();
  waterJarGroup.position.set(waterJarP.x, 0.04, waterJarP.z);
  const wJar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.38, 0.3, 0.62, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x6d5242, roughness: 0.68 }))
  );
  wJar.position.y = 0.31;
  wJar.castShadow = true;
  waterJarGroup.add(wJar);
  const wFill = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.32, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x4b9096, roughness: 0.18 }))
  );
  wFill.rotation.x = -Math.PI / 2;
  wFill.position.y = 0.63;
  waterJarGroup.add(wFill);
  registerClickable(waterJarGroup, clickables, {
    kind: 'interactable',
    action: 'flower',
    label: INTERACTABLES.flower.label,
  });
  root.add(waterJarGroup);

  const soilMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x4b3427, roughness: 0.95 }));
  const bedFrameMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x8b5d3e, roughness: 0.72 }));
  const plantContainers: THREE.Group[] = [];

  for (const plotPos of GARDEN_PLOT_POSITIONS) {
    const pp = world2DTo3D(plotPos.x, plotPos.y);
    const bedGroup = new THREE.Group();
    bedGroup.position.set(pp.x, 0.05, pp.z);

    const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.35, 0.14, 1.55)), bedFrameMat);
    frame.position.y = 0.07;
    frame.receiveShadow = true;
    bedGroup.add(frame);

    const soil = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.05, 0.16, 1.25)), soilMat);
    soil.position.y = 0.08;
    soil.receiveShadow = true;
    bedGroup.add(soil);

    const plantContainer = new THREE.Group();
    plantContainer.position.y = 0.16;
    bedGroup.add(plantContainer);
    plantContainers.push(plantContainer);

    registerClickable(bedGroup, clickables, {
      kind: 'garden_plot',
      index: plotPos.index,
      label: `${plotPos.label} (Gieo hạt / Dâng hoa)`,
    });
    root.add(bedGroup);
  }

  const updateGardenPlots3D = (plots: GardenPlotState[]) => {
    const nowMs = Date.now();
    for (const pos of GARDEN_PLOT_POSITIONS) {
      const container = plantContainers[pos.index];
      if (!container) continue;
      disposeGroupChildren(container);

      const plot = plots.find((p) => p.plotIndex === pos.index);
      const effectiveStage = plot ? getEffectiveFlowerStage(plot, nowMs) : 0;
      if (!plot || plot.species === 'none' || effectiveStage === 0) continue;

      const cat = FLOWER_CATALOG.find((f) => f.id === plot.species) || FLOWER_CATALOG[0];
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x5aa04e, roughness: 0.72 });
      const petalMat = new THREE.MeshStandardMaterial({
        color: cat.petalColor,
        emissive: cat.petalColor,
        emissiveIntensity: 0.12,
        roughness: 0.45,
      });
      const centerMat = new THREE.MeshStandardMaterial({ color: 0xf7c948, roughness: 0.5 });

      if (effectiveStage === 1) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.28, 6), stemMat);
        stem.position.y = 0.14;
        container.add(stem);
        for (const side of [-1, 1]) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), stemMat);
          leaf.scale.set(1.4, 0.35, 0.8);
          leaf.position.set(side * 0.1, 0.24, 0);
          leaf.rotation.z = -side * 0.4;
          container.add(leaf);
        }
      } else if (effectiveStage === 2) {
        for (const ox of [-0.36, 0, 0.36]) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.46, 6), stemMat);
          stem.position.set(ox, 0.23, (ox === 0 ? -0.1 : 0.1));
          container.add(stem);
          const bud = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), petalMat);
          bud.scale.set(0.85, 1.25, 0.85);
          bud.position.set(ox, 0.49, (ox === 0 ? -0.1 : 0.1));
          container.add(bud);
        }
      } else {
        const bloomOffsets = [
          { x: -0.45, z: 0.14, h: 0.54 },
          { x: 0.45, z: -0.1, h: 0.56 },
          { x: 0, z: 0, h: 0.68 },
        ];
        for (const bo of bloomOffsets) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, bo.h, 6), stemMat);
          stem.position.set(bo.x, bo.h / 2, bo.z);
          container.add(stem);

          const head = new THREE.Group();
          head.position.set(bo.x, bo.h + 0.04, bo.z);
          for (let p = 0; p < 6; p++) {
            const ang = (p / 6) * Math.PI * 2;
            const petal = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), petalMat);
            petal.scale.set(1.2, 0.42, 0.85);
            petal.position.set(Math.cos(ang) * 0.12, 0, Math.sin(ang) * 0.12);
            petal.rotation.y = -ang;
            head.add(petal);
          }
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), centerMat);
          core.position.y = 0.03;
          head.add(core);
          container.add(head);
        }
      }
    }
  };

  // 21. Cây Nguyện Ước (Wishing Tree with Red Silk Ribbons at SE courtyard)
  const wishTreePos = world2DTo3D(INTERACTABLES.wish.x, INTERACTABLES.wish.y);
  const wishingTreeGroup = new THREE.Group();
  wishingTreeGroup.position.set(wishTreePos.x, 0, wishTreePos.z);

  const wishCurb = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.45, 1.58, 0.24, 18)), stoneMat);
  wishCurb.position.y = 0.12;
  wishCurb.receiveShadow = true;
  wishingTreeGroup.add(wishCurb);

  const wishSoil = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.26, 1.32, 0.26, 16)), mossMat);
  wishSoil.position.y = 0.13;
  wishingTreeGroup.add(wishSoil);

  const wishTrunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.36, 0.56, 2.8, 12)), barkMat);
  wishTrunk.position.y = 1.45;
  wishTrunk.castShadow = true;
  wishingTreeGroup.add(wishTrunk);

  const wishSilkWrap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.42, 0.44, 0.24, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xc93632, roughness: 0.5 }))
  );
  wishSilkWrap.position.y = 1.1;
  wishingTreeGroup.add(wishSilkWrap);

  const wishBoughs = [
    [0.0, 2.4, 0.0, -1.5, 3.8, -0.8],
    [0.0, 2.5, 0.0, 1.6, 3.9, -0.5],
    [0.0, 2.45, 0.0, -0.9, 3.9, 1.3],
    [0.0, 2.5, 0.0, 1.2, 3.7, 1.2],
  ];
  for (const wb of wishBoughs) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(wb[0], wb[1], wb[2]),
      new THREE.Vector3((wb[0] + wb[3]) * 0.5, (wb[1] + wb[4]) * 0.52, (wb[2] + wb[5]) * 0.5),
      new THREE.Vector3(wb[3], wb[4], wb[5]),
    ]);
    const limb = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(curve, 10, 0.16, 8, false)), barkMat);
    limb.castShadow = true;
    wishingTreeGroup.add(limb);
  }

  const wishCrownPuffs = [
    { x: -1.5, y: 4.0, z: -0.8, r: 1.35, c: 0x457444 },
    { x: 1.6, y: 4.1, z: -0.6, r: 1.4, c: 0x52884d },
    { x: -0.9, y: 4.2, z: 1.2, r: 1.3, c: 0x5d9556 },
    { x: 1.2, y: 3.9, z: 1.1, r: 1.25, c: 0x67a05e },
    { x: 0.0, y: 4.85, z: 0.0, r: 1.6, c: 0x6ba662 },
    { x: -1.1, y: 4.4, z: 0.4, r: 0.65, c: 0xf4a2b6 },
    { x: 1.15, y: 4.35, z: -0.2, r: 0.68, c: 0xf7b5c4 },
    { x: 0.1, y: 5.15, z: 0.55, r: 0.72, c: 0xf9c3cf },
  ];
  for (const wp of wishCrownPuffs) {
    const pMat = trackMat(new THREE.MeshStandardMaterial({ color: wp.c, roughness: 0.76 }));
    const puff = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(wp.r, 1)), pMat);
    puff.scale.set(1.15, 0.82, 1.15);
    puff.position.set(wp.x, wp.y, wp.z);
    puff.castShadow = !isSoftwareGl;
    puff.receiveShadow = true;
    wishingTreeGroup.add(puff);
  }

  const treeRibbonsGroup = new THREE.Group();
  wishingTreeGroup.add(treeRibbonsGroup);

  const ribbonAnchor3D = [
    { x: -1.75, y: 3.05, z: 0.35 },
    { x: -1.2, y: 2.85, z: 0.95 },
    { x: -0.55, y: 3.25, z: 1.35 },
    { x: 0.35, y: 2.95, z: 1.4 },
    { x: 1.15, y: 3.15, z: 1.05 },
    { x: 1.72, y: 2.9, z: 0.42 },
    { x: -1.65, y: 3.35, z: -0.55 },
    { x: -0.8, y: 3.55, z: -1.15 },
    { x: 0.45, y: 3.45, z: -1.2 },
    { x: 1.48, y: 3.3, z: -0.65 },
    { x: -0.15, y: 3.65, z: 0.75 },
    { x: 0.75, y: 3.5, z: 0.65 },
    { x: -1.0, y: 3.6, z: -0.2 },
    { x: 0.95, y: 3.7, z: -0.25 },
    { x: 0.0, y: 3.9, z: -0.75 },
    { x: -0.45, y: 2.95, z: 0.55 },
  ];

  const updateTreeWishes3D = (wishes: TreeWishState[]) => {
    disposeGroupChildren(treeRibbonsGroup);
    const count = Math.min(ribbonAnchor3D.length, Math.max(4, wishes.length + 3));
    for (let i = 0; i < count; i++) {
      const anc = ribbonAnchor3D[i];
      const rg = new THREE.Group();
      rg.position.set(anc.x, anc.y, anc.z);
      rg.userData = { seed: wishes[i]?.seed ?? i * 19 };

      const ribbonMat = new THREE.MeshStandardMaterial({
        color: i < wishes.length ? 0xe03e36 : 0xc63530,
        emissive: 0x3b0c09,
        emissiveIntensity: 0.25,
        roughness: 0.55,
        side: THREE.DoubleSide,
      });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.72), ribbonMat);
      strip.position.y = -0.36;
      rg.add(strip);

      const charm = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.14, 0.03),
        new THREE.MeshStandardMaterial({ color: 0xf4c65c, roughness: 0.35 })
      );
      charm.position.y = -0.06;
      rg.add(charm);

      treeRibbonsGroup.add(rg);
    }
  };

  // Flying red wish ribbon used during toss animation
  const flyingWishRibbon = new THREE.Group();
  const flyStrip = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.14, 0.76)),
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe84034,
        emissive: 0x5c110d,
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
      })
    )
  );
  flyingWishRibbon.add(flyStrip);
  const flyGold = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.07, 8, 8)), goldMat);
  flyGold.position.y = 0.35;
  flyingWishRibbon.add(flyGold);
  flyingWishRibbon.visible = false;
  wishingTreeGroup.add(flyingWishRibbon);

  registerClickable(wishingTreeGroup, clickables, {
    kind: 'interactable',
    action: 'wish',
    label: INTERACTABLES.wish.label,
  });
  root.add(wishingTreeGroup);

  // 22. Gian Bếp Chay (NE Vegetarian Kitchen Pavilion: x 1442..1784, y 262..612)
  const kitchenCenterP = world2DTo3D(1613, 437);
  const kitchenGroup = new THREE.Group();
  kitchenGroup.position.set(kitchenCenterP.x, 0, kitchenCenterP.z);

  const kitchenDeck = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(342 * WORLD_TO_3D_SCALE, 0.28, 350 * WORLD_TO_3D_SCALE)),
    woodMat
  );
  kitchenDeck.position.y = 0.08;
  kitchenDeck.receiveShadow = true;
  kitchenGroup.add(kitchenDeck);

  // 4 Timber Corner Pillars + Open Timber Kitchen Roof Overhead
  for (const kx of [-6.35, 6.35]) {
    for (const kz of [-6.5, 6.5]) {
      const kCol = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.18, 0.2, 3.7, 10)),
        darkWoodMat
      );
      kCol.position.set(kx, 1.98, kz);
      kCol.castShadow = !isSoftwareGl;
      kitchenGroup.add(kCol);
    }
  }
  const kitchenRoof = createCurvedRoofGroup(14.8, 15.0, 2.35, tileRoofMat, goldMat, darkWoodMat, !isSoftwareGl);
  kitchenRoof.position.set(0, 3.85, 0);
  kitchenGroup.add(kitchenRoof);

  // Warm hanging kitchen lantern illuminating dining table
  const kLanternBulb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.24, 10, 8)), flameMat);
  kLanternBulb.position.set(0, 3.4, 0.4);
  kitchenGroup.add(kLanternBulb);
  lanternFlames.push(kLanternBulb);

  const kitchenWarmLight = new THREE.PointLight(0xffdaa0, 1.25, 14, 1.3);
  kitchenWarmLight.position.set(0, 3.15, 0.6);
  kitchenGroup.add(kitchenWarmLight);
  root.add(kitchenGroup);

  // 22a. Quầy Bếp & Thực Đơn (792, 62)
  const kMenuPos3 = world2DTo3D(INTERACTABLES.kitchen_menu.x, INTERACTABLES.kitchen_menu.y);
  const kMenuGroup = new THREE.Group();
  kMenuGroup.position.set(kMenuPos3.x, 0.14, kMenuPos3.z);

  const counterBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 0.96, 1.15)), darkWoodMat);
  counterBase.position.y = 0.48;
  counterBase.castShadow = !isSoftwareGl;
  counterBase.receiveShadow = true;
  kMenuGroup.add(counterBase);

  const counterTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.54, 0.1, 1.28)), woodMat);
  counterTop.position.y = 1.0;
  kMenuGroup.add(counterTop);

  // Clay broth pot & bamboo steamer on counter
  const brothPot = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.28, 0.24, 0.34, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x6f432b, roughness: 0.65 }))
  );
  brothPot.position.set(-0.95, 1.22, 0);
  kMenuGroup.add(brothPot);

  const bambooSteamer = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.26, 0.26, 0.28, 14)), bambooMat);
  bambooSteamer.position.set(-0.22, 1.19, 0.05);
  kMenuGroup.add(bambooSteamer);

  // Basket of sculpted fresh red apples for apple juice (Nước Ép Táo!)
  const appleBasket = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.24, 0.18, 12)), bambooMat);
  appleBasket.position.set(0.55, 1.14, 0.06);
  kMenuGroup.add(appleBasket);
  const redAppleMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0xcf2620, roughness: 0.22, clearcoat: 0.65, clearcoatRoughness: 0.14 })
  );
  const appleStemMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.8 }));
  const appleProfile = [
    new THREE.Vector2(0.001, -0.055),
    new THREE.Vector2(0.045, -0.072),
    new THREE.Vector2(0.088, -0.045),
    new THREE.Vector2(0.095, 0.005),
    new THREE.Vector2(0.08, 0.055),
    new THREE.Vector2(0.042, 0.072),
    new THREE.Vector2(0.001, 0.045),
  ];
  const wholeAppleGeo = trackGeo(new THREE.LatheGeometry(appleProfile, 14));
  [
    [0.46, 1.25, 0.04],
    [0.62, 1.25, 0.09],
    [0.54, 1.32, -0.02],
  ].forEach(([ax, ay, az], idx) => {
    const apple = new THREE.Mesh(wholeAppleGeo, redAppleMat);
    apple.position.set(ax, ay, az);
    apple.rotation.z = (idx - 1) * 0.18;
    kMenuGroup.add(apple);
    const stem = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.006, 0.008, 0.04, 6)), appleStemMat);
    stem.position.set(ax, ay + 0.068, az);
    stem.rotation.z = apple.rotation.z + 0.15;
    kMenuGroup.add(stem);
  });

  // Upright Menu Plaque on right side of counter
  const menuBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.56, 0.08)), darkWoodMat);
  menuBoard.position.set(1.22, 1.33, -0.1);
  menuBoard.rotation.x = -0.18;
  kMenuGroup.add(menuBoard);
  const menuPaper = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.56, 0.44, 0.09)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xf4e8ce, roughness: 0.85 }))
  );
  menuPaper.position.copy(menuBoard.position);
  menuPaper.rotation.copy(menuBoard.rotation);
  kMenuGroup.add(menuPaper);

  registerClickable(kMenuGroup, clickables, {
    kind: 'interactable',
    action: 'kitchen_menu',
    label: INTERACTABLES.kitchen_menu.label,
  });
  root.add(kMenuGroup);

  // 22b. Bàn Ăn Chay (Shared Vegetarian Dining Table supporting multiple fellow players)
  const kTablePos3 = world2DTo3D(INTERACTABLES.kitchen_table.x, INTERACTABLES.kitchen_table.y);
  const kTableGroup = new THREE.Group();
  kTableGroup.position.set(kTablePos3.x, 0.14, kTablePos3.z);

  const dTableTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.65, 0.09, 1.68)), woodMat);
  dTableTop.position.y = 0.84;
  dTableTop.castShadow = !isSoftwareGl;
  dTableTop.receiveShadow = true;
  kTableGroup.add(dTableTop);

  for (const tx of [-1.62, 1.62]) {
    for (const tz of [-0.62, 0.62]) {
      const tLeg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.84, 0.11)), darkWoodMat);
      tLeg.position.set(tx, 0.42, tz);
      kTableGroup.add(tLeg);
    }
  }
  for (const bz of [-1.06, 1.06]) {
    const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.25, 0.44, 0.42)), darkWoodMat);
    bench.position.set(0, 0.22, bz);
    bench.castShadow = !isSoftwareGl;
    kTableGroup.add(bench);
  }

  // Dynamic container for up to 6 shared bowls & drink glasses on Bàn Ăn Chay
  const kitchenMealsContainer = new THREE.Group();
  kitchenMealsContainer.position.set(0, 0.89, 0);
  kTableGroup.add(kitchenMealsContainer);

  registerClickable(dTableTop, clickables, {
    kind: 'interactable',
    action: 'kitchen_table',
    label: INTERACTABLES.kitchen_table.label,
  });
  clickables.push(kitchenMealsContainer);
  root.add(kTableGroup);

  const updateKitchenMeal3D = (meals: KitchenMealState[]) => {
    disposeGroupChildren(kitchenMealsContainer);
    const activeMeals = meals.slice(0, 6);
    if (activeMeals.length === 0) return;

    const count = activeMeals.length;
    const slotScale = count === 1 ? 1.0 : count === 2 ? 0.78 : 0.62;
    const slots: Array<{ x: number; z: number }> =
      count === 1
        ? [{ x: 0, z: 0.06 }]
        : count === 2
        ? [
            { x: -0.92, z: 0.06 },
            { x: 0.92, z: 0.06 },
          ]
        : count <= 4
        ? [
            { x: -0.9, z: -0.36 },
            { x: 0.9, z: -0.36 },
            { x: -0.9, z: 0.36 },
            { x: 0.9, z: 0.36 },
          ]
        : [
            { x: -1.12, z: -0.36 },
            { x: 0, z: -0.36 },
            { x: 1.12, z: -0.36 },
            { x: -1.12, z: 0.36 },
            { x: 0, z: 0.36 },
            { x: 1.12, z: 0.36 },
          ];

    const trayMat = new THREE.MeshStandardMaterial({ color: 0x5d3926, roughness: 0.6 });
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.35 });
    const chopstickMat = new THREE.MeshStandardMaterial({ color: 0x8b5a36, roughness: 0.5 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf6f7,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.52,
    });

    activeMeals.forEach((meal, idx) => {
      const slot = slots[idx] ?? slots[0];
      const portionGroup = new THREE.Group();
      portionGroup.position.set(slot.x, 0, slot.z);
      portionGroup.scale.setScalar(slotScale);

      const foodInfo =
        VEGETARIAN_FOOD_MENU.find((f) => f.id === meal.foodId) ?? VEGETARIAN_FOOD_MENU[0];
      const drinkInfo =
        VEGETARIAN_DRINK_MENU.find((d) => d.id === meal.drinkId) ?? VEGETARIAN_DRINK_MENU[0];
      const recipientTag =
        meal.recipientMode === 'all'
          ? 'Mời cả chùa'
          : meal.targetName
          ? `Phần ${meal.targetName}`
          : meal.orderedByName;

      // Food Bowl & Chopsticks on Left of Portion
      const mealFoodGroup = new THREE.Group();
      mealFoodGroup.position.set(-0.34, 0, 0);
      portionGroup.add(mealFoodGroup);

      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.025, 16), trayMat);
      tray.position.y = 0.012;
      mealFoodGroup.add(tray);

      const bowlBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.14, 0.14, 14), bowlMat);
      bowlBody.position.y = 0.09;
      mealFoodGroup.add(bowlBody);

      if (!meal.foodEaten) {
        const foodFill = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
          new THREE.MeshStandardMaterial({ color: foodInfo.color, roughness: 0.55 })
        );
        foodFill.scale.set(1, 0.65, 1);
        foodFill.position.y = 0.13;
        mealFoodGroup.add(foodFill);

        const garnish = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x5aa34e, roughness: 0.7 })
        );
        garnish.position.set(0.05, 0.21, 0.02);
        mealFoodGroup.add(garnish);
      } else {
        const emptyInner = new THREE.Mesh(
          new THREE.CircleGeometry(0.2, 14),
          new THREE.MeshStandardMaterial({ color: 0xe3dccf, roughness: 0.4 })
        );
        emptyInner.rotation.x = -Math.PI / 2;
        emptyInner.position.y = 0.162;
        mealFoodGroup.add(emptyInner);
      }

      for (const cz of [-0.03, 0.03]) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), chopstickMat);
        stick.rotation.z = Math.PI / 2;
        stick.position.set(0.18, 0.17, cz);
        mealFoodGroup.add(stick);
      }

      mealFoodGroup.traverse((child) => {
        child.userData = {
          ...child.userData,
          kind: 'interactable',
          action: 'kitchen_table',
          mealTarget: 'food',
          mealId: meal.id,
          label: meal.foodEaten
            ? `Đã ăn xong ${foodInfo.name} (${recipientTag})`
            : `Nhấn để ăn ${foodInfo.name} · ${recipientTag}`,
        };
      });

      // Drink Glass / Cup on Right of Portion
      const mealDrinkGroup = new THREE.Group();
      mealDrinkGroup.position.set(0.34, 0, 0);
      portionGroup.add(mealDrinkGroup);

      const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12), trayMat);
      coaster.position.y = 0.01;
      mealDrinkGroup.add(coaster);

      const glassWall = new THREE.Mesh(
        new THREE.CylinderGeometry(0.125, 0.105, 0.3, 12, 1, true),
        glassMat
      );
      glassWall.position.y = 0.17;
      mealDrinkGroup.add(glassWall);

      if (!meal.drinkDrunk) {
        const juiceMat = new THREE.MeshPhysicalMaterial({
          color: drinkInfo.color,
          emissive: drinkInfo.color,
          emissiveIntensity: drinkInfo.id === 'nuoc-ep-tao' ? 0.14 : 0.18,
          roughness: 0.14,
          clearcoat: 0.4,
          transparent: true,
          opacity: 0.92,
        });
        const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.095, 0.23, 12), juiceMat);
        liquid.position.y = 0.14;
        mealDrinkGroup.add(liquid);

        if (drinkInfo.id === 'nuoc-ep-tao') {
          const iceMat = new THREE.MeshPhysicalMaterial({
            color: 0xf4fcff,
            roughness: 0.08,
            clearcoat: 0.9,
            transparent: true,
            opacity: 0.62,
          });
          [
            { x: -0.025, y: 0.235, z: 0.02, ry: 0.4, rz: 0.18 },
            { x: 0.032, y: 0.228, z: -0.022, ry: -0.5, rz: -0.22 },
          ].forEach((ic) => {
            const cube = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.038, 0.042), iceMat);
            cube.position.set(ic.x, ic.y, ic.z);
            cube.rotation.set(0.2, ic.ry, ic.rz);
            mealDrinkGroup.add(cube);
          });

          const appleWedgeGroup = new THREE.Group();
          appleWedgeGroup.position.set(0.116, 0.308, 0.008);
          appleWedgeGroup.rotation.set(0.08, 0.28, -0.34);

          const fleshShape = new THREE.Shape();
          fleshShape.absarc(0, 0, 0.072, -Math.PI * 0.44, Math.PI * 0.44, false);
          fleshShape.quadraticCurveTo(0.016, 0.028, 0.012, 0.01);
          fleshShape.quadraticCurveTo(0.024, 0, 0.012, -0.01);
          fleshShape.quadraticCurveTo(
            0.016,
            -0.028,
            Math.cos(-Math.PI * 0.44) * 0.072,
            Math.sin(-Math.PI * 0.44) * 0.072
          );

          const fleshGeo = new THREE.ExtrudeGeometry(fleshShape, {
            depth: 0.022,
            bevelEnabled: true,
            bevelThickness: 0.004,
            bevelSize: 0.004,
            bevelSegments: 2,
            curveSegments: 12,
          });
          fleshGeo.translate(0, 0, -0.011);
          const fleshMat = new THREE.MeshPhysicalMaterial({
            color: 0xf7ecd2,
            roughness: 0.2,
            clearcoat: 0.55,
            clearcoatRoughness: 0.14,
          });
          appleWedgeGroup.add(new THREE.Mesh(fleshGeo, fleshMat));

          const skinShape = new THREE.Shape();
          skinShape.absarc(0, 0, 0.081, -Math.PI * 0.45, Math.PI * 0.45, false);
          skinShape.absarc(0, 0, 0.07, Math.PI * 0.45, -Math.PI * 0.45, true);
          skinShape.closePath();

          const skinGeo = new THREE.ExtrudeGeometry(skinShape, {
            depth: 0.027,
            bevelEnabled: true,
            bevelThickness: 0.003,
            bevelSize: 0.003,
            bevelSegments: 2,
            curveSegments: 12,
          });
          skinGeo.translate(0, 0, -0.0135);
          const skinMat = new THREE.MeshPhysicalMaterial({
            color: 0xd42620,
            roughness: 0.16,
            clearcoat: 0.82,
            clearcoatRoughness: 0.08,
          });
          appleWedgeGroup.add(new THREE.Mesh(skinGeo, skinMat));

          const seedMat = new THREE.MeshPhysicalMaterial({
            color: 0x3b2012,
            roughness: 0.25,
            clearcoat: 0.6,
          });
          const seedGeo = new THREE.SphereGeometry(0.0055, 8, 6);
          for (const [sy, sz] of [
            [0.014, 0.014],
            [-0.014, -0.014],
          ] as const) {
            const seed = new THREE.Mesh(seedGeo, seedMat);
            seed.scale.set(0.65, 1.35, 0.55);
            seed.position.set(0.028, sy, sz);
            seed.rotation.z = sy > 0 ? 0.35 : -0.35;
            appleWedgeGroup.add(seed);
          }

          const leafShape = new THREE.Shape();
          leafShape.moveTo(0, 0);
          leafShape.quadraticCurveTo(0.022, 0.022, 0.05, 0.01);
          leafShape.quadraticCurveTo(0.025, -0.016, 0, 0);
          const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.003, bevelEnabled: false });
          const mintLeaf = new THREE.Mesh(
            leafGeo,
            new THREE.MeshStandardMaterial({ color: 0x4ca64a, roughness: 0.45 })
          );
          mintLeaf.position.set(0.015, 0.052, 0.008);
          mintLeaf.rotation.set(0.3, -0.4, 0.55);
          appleWedgeGroup.add(mintLeaf);

          mealDrinkGroup.add(appleWedgeGroup);
        }

        const straw = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.38, 6),
          new THREE.MeshStandardMaterial({ color: 0xd9c28e, roughness: 0.5 })
        );
        straw.position.set(-0.03, 0.24, 0);
        straw.rotation.z = 0.18;
        mealDrinkGroup.add(straw);
      }

      mealDrinkGroup.traverse((child) => {
        child.userData = {
          ...child.userData,
          kind: 'interactable',
          action: 'kitchen_table',
          mealTarget: 'drink',
          mealId: meal.id,
          label: meal.drinkDrunk
            ? `Đã uống xong ${drinkInfo.name} (${recipientTag})`
            : `Nhấn để uống ${drinkInfo.name} · ${recipientTag}`,
        };
      });

      kitchenMealsContainer.add(portionGroup);
    });
  };

  // 22c. Bồn Rửa Bát & Ly (1140, 62)
  const kSinkPos3 = world2DTo3D(INTERACTABLES.kitchen_sink.x, INTERACTABLES.kitchen_sink.y);
  const kSinkGroup = new THREE.Group();
  kSinkGroup.position.set(kSinkPos3.x, 0.14, kSinkPos3.z);

  const sinkCabinet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.88, 1.18)), darkWoodMat);
  sinkCabinet.position.y = 0.44;
  sinkCabinet.castShadow = !isSoftwareGl;
  sinkCabinet.receiveShadow = true;
  kSinkGroup.add(sinkCabinet);

  const sinkStoneRim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.18, 0.96)), stoneMat);
  sinkStoneRim.position.set(-0.48, 0.95, 0);
  kSinkGroup.add(sinkStoneRim);

  const sinkWater = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(1.42, 0.72)),
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x4b9aa3,
        roughness: 0.12,
        transparent: true,
        opacity: 0.82,
      })
    )
  );
  sinkWater.rotation.x = -Math.PI / 2;
  sinkWater.position.set(-0.48, 1.05, 0);
  kSinkGroup.add(sinkWater);

  // Bamboo faucet pipe
  const faucetPipe = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.045, 0.055, 0.56, 8)), bambooMat);
  faucetPipe.position.set(-0.48, 1.25, -0.36);
  kSinkGroup.add(faucetPipe);
  const faucetSpout = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8)), bambooMat);
  faucetSpout.rotation.x = Math.PI / 2;
  faucetSpout.position.set(-0.48, 1.46, -0.22);
  kSinkGroup.add(faucetSpout);

  // Wooden dish & glass drying rack on the right of sink
  const rackBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 0.08, 0.72)), woodMat);
  rackBase.position.set(0.86, 0.92, 0);
  kSinkGroup.add(rackBase);
  for (let b = 0; b < 3; b++) {
    const cleanBowl = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.14, 0.09, 0.09, 12)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.35 }))
    );
    cleanBowl.position.set(0.62 + b * 0.24, 1.01, -0.1);
    kSinkGroup.add(cleanBowl);
  }

  registerClickable(kSinkGroup, clickables, {
    kind: 'interactable',
    action: 'kitchen_sink',
    label: INTERACTABLES.kitchen_sink.label,
  });
  root.add(kSinkGroup);

  // 23. Bảo Tháp Cửu Tầng & Đài Quan Sát Tầng 9 (9-Tier Pagoda at STUPA_SPEC 960, -295)
  const stupaP = world2DTo3D(STUPA_SPEC.cx, STUPA_SPEC.cy);
  const stupaGroup = new THREE.Group();
  stupaGroup.position.set(stupaP.x, 0, stupaP.z);

  // Broad raised octagonal stone plaza beneath Bảo Tháp
  const stupaBasePlaza = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.3, 3.65, 0.34, 8)), stoneMat);
  stupaBasePlaza.position.y = 0.17;
  stupaBasePlaza.receiveShadow = true;
  stupaGroup.add(stupaBasePlaza);

  const stupaPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.3, 0.5, 4.3)), stoneMat);
  stupaPlinth.position.y = 0.56;
  stupaPlinth.castShadow = !isSoftwareGl;
  stupaPlinth.receiveShadow = true;
  stupaGroup.add(stupaPlinth);

  // South entry steps facing Chánh Điện back courtyard
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.12, 0.48)), stoneMat);
    step.position.set(0, 0.12 + s * 0.12, 2.42 - s * 0.28);
    stupaGroup.add(step);
  }

  // 8 enclosed tapering pagoda tiers (tiers 1..8) leading up to the 9th-tier Observation Deck
  const tierColors = [
    0xf2e4cc, 0xefdfc4, 0xecdabc, 0xe8d5b5,
    0xe5d0ad, 0xe2cba5, 0xdfc69e, 0xdcc096,
  ];
  const darkRecessMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b1e14, roughness: 0.85 }));
  const windowLatticeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x6f3922, roughness: 0.7 }));
  let curTierY = 0.8;
  for (let t = 0; t < 8; t++) {
    const tierW = 3.55 - t * 0.16;
    const scale = tierW / 3.55;
    const tierH = 1.68 - t * 0.05;
    const wallMat = trackMat(new THREE.MeshStandardMaterial({ color: tierColors[t], roughness: 0.72 }));

    const tierBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(tierW, tierH, tierW)), wallMat);
    tierBody.position.y = curTierY + tierH / 2;
    tierBody.castShadow = !isSoftwareGl;
    tierBody.receiveShadow = true;
    stupaGroup.add(tierBody);

    // Corner crimson pillars
    const pOff = tierW * 0.48;
    for (const px of [-pOff, pOff]) {
      for (const pz of [-pOff, pOff]) {
        const col = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.085 * scale, 0.1 * scale, tierH, 8)),
          crimsonPillarMat
        );
        col.position.set(px, curTierY + tierH / 2, pz);
        stupaGroup.add(col);
      }
    }

    // Gold doorway plaque on ground tier (t=0) & carved arched windows on tiers 2..8
    if (t === 0) {
      const doorRecess = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(1.22, 1.38, 0.18)),
        darkRecessMat
      );
      doorRecess.position.set(0, curTierY + 0.69, tierW / 2 + 0.02);
      stupaGroup.add(doorRecess);

      const doorArch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.46, 0.18, 0.24)), goldMat);
      doorArch.position.set(0, curTierY + 1.42, tierW / 2 + 0.05);
      stupaGroup.add(doorArch);
    } else {
      const winW = 0.56 * scale;
      const winH = 0.72 * scale;
      const winGeo = trackGeo(new THREE.BoxGeometry(winW, winH, 0.1));
      const frameGeo = trackGeo(new THREE.BoxGeometry(winW + 0.1, winH + 0.1, 0.06));
      for (const side of [0, 1, 2, 3]) {
        const wFrame = new THREE.Mesh(frameGeo, windowLatticeMat);
        const wInner = new THREE.Mesh(winGeo, darkRecessMat);
        const wy = curTierY + tierH * 0.52;
        const offset = tierW / 2 + 0.01;
        if (side === 0) {
          wFrame.position.set(0, wy, offset);
          wInner.position.set(0, wy, offset + 0.02);
        } else if (side === 1) {
          wFrame.position.set(0, wy, -offset);
          wInner.position.set(0, wy, -offset - 0.02);
        } else if (side === 2) {
          wFrame.rotation.y = Math.PI / 2;
          wInner.rotation.y = Math.PI / 2;
          wFrame.position.set(offset, wy, 0);
          wInner.position.set(offset + 0.02, wy, 0);
        } else {
          wFrame.rotation.y = Math.PI / 2;
          wInner.rotation.y = Math.PI / 2;
          wFrame.position.set(-offset, wy, 0);
          wInner.position.set(-offset - 0.02, wy, 0);
        }
        stupaGroup.add(wFrame);
        stupaGroup.add(wInner);
      }
    }

    // Upturned pagoda eave roof for each tier
    const tierRoof = createCurvedRoofGroup(
      tierW + 1.28 * scale,
      tierW + 1.28 * scale,
      0.9 - t * 0.04,
      tileRoofMat,
      goldMat,
      crimsonPillarMat,
      !isSoftwareGl
    );
    tierRoof.position.y = curTierY + tierH;
    stupaGroup.add(tierRoof);

    curTierY += tierH + (0.58 - t * 0.02);
  }

  // Corbelled bracket transition from tier 8 (y = 16.92m) to 9th-tier Observation Deck (y = 17.80m)
  const corbelNeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.5, 0.34, 2.5)), crimsonPillarMat);
  corbelNeck.position.y = curTierY + 0.17;
  stupaGroup.add(corbelNeck);

  const corbelBracket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.65, 0.28, 3.65)), woodMat);
  corbelBracket.position.y = curTierY + 0.47;
  stupaGroup.add(corbelBracket);

  // 9th Tier (Tầng 9): Open-Air Đài Quan Sát Observation Deck (top surface at STUPA_DECK_Y_3D = 17.8m)
  const deckSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.32, 0.28, 4.32)), stoneMat);
  deckSlab.position.y = STUPA_DECK_Y_3D - 0.14;
  deckSlab.castShadow = !isSoftwareGl;
  deckSlab.receiveShadow = true;
  stupaGroup.add(deckSlab);

  const deckFloorMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.woodPlankTex, color: 0xc28a58, roughness: 0.62 })
  );
  const deckFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.92, 0.03, 3.92)), deckFloorMat);
  deckFloor.position.y = STUPA_DECK_Y_3D + 0.005;
  deckFloor.receiveShadow = true;
  stupaGroup.add(deckFloor);

  // Subtle carved lotus medallion in the center of the 9th-tier Observation Deck
  const lotusMedallion = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.62, 0.66, 0.02, 16)),
    goldMat
  );
  lotusMedallion.position.y = STUPA_DECK_Y_3D + 0.015;
  stupaGroup.add(lotusMedallion);

  // 360° Open Perimeter Safety Balustrade Railings (waist-height 0.90m so sightlines stay wide open)
  const railSpan = 2.02;
  const railPostGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.94, 0.12));
  const railCapGeo = trackGeo(new THREE.SphereGeometry(0.085, 8, 8));
  const postCoords: Array<[number, number]> = [
    [-railSpan, -railSpan], [0, -railSpan], [railSpan, -railSpan],
    [-railSpan, 0], [railSpan, 0],
    [-railSpan, railSpan], [0, railSpan], [railSpan, railSpan],
  ];
  for (const [px, pz] of postCoords) {
    const post = new THREE.Mesh(railPostGeo, crimsonPillarMat);
    post.position.set(px, STUPA_DECK_Y_3D + 0.47, pz);
    stupaGroup.add(post);

    const cap = new THREE.Mesh(railCapGeo, goldMat);
    cap.position.set(px, STUPA_DECK_Y_3D + 0.99, pz);
    stupaGroup.add(cap);
  }

  const railLen = railSpan * 2;
  const hRailTopGeo = trackGeo(new THREE.BoxGeometry(railLen, 0.08, 0.09));
  const hRailMidGeo = trackGeo(new THREE.BoxGeometry(railLen, 0.055, 0.07));
  const vSpindleGeo = trackGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.78, 6));
  for (const side of [0, 1, 2, 3]) {
    const sideGroup = new THREE.Group();
    sideGroup.rotation.y = (side * Math.PI) / 2;
    const topRail = new THREE.Mesh(hRailTopGeo, crimsonPillarMat);
    topRail.position.set(0, STUPA_DECK_Y_3D + 0.88, railSpan);
    sideGroup.add(topRail);

    const midRail = new THREE.Mesh(hRailMidGeo, goldMat);
    midRail.position.set(0, STUPA_DECK_Y_3D + 0.44, railSpan);
    sideGroup.add(midRail);

    const lowRail = new THREE.Mesh(hRailMidGeo, crimsonPillarMat);
    lowRail.position.set(0, STUPA_DECK_Y_3D + 0.12, railSpan);
    sideGroup.add(lowRail);

    for (const sx of [-1.52, -1.02, -0.52, 0.52, 1.02, 1.52]) {
      const sp = new THREE.Mesh(vSpindleGeo, crimsonPillarMat);
      sp.position.set(sx, STUPA_DECK_Y_3D + 0.47, railSpan);
      sideGroup.add(sp);
    }
    stupaGroup.add(sideGroup);
  }

  // 4 slender crimson corner pillars supporting the 9th-tier open-air pavilion roof
  const deckColOff = 1.82;
  const deckPavilionH = 3.0;
  const deckColGeo = trackGeo(new THREE.CylinderGeometry(0.105, 0.125, deckPavilionH, 10));
  const deckColRingGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10));
  const deckLanternBodyGeo = trackGeo(new THREE.SphereGeometry(0.14, 8, 6));
  const deckLanternGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffd27a,
      emissive: 0xffa638,
      emissiveIntensity: 0.95,
      roughness: 0.3,
    })
  );

  for (const px of [-deckColOff, deckColOff]) {
    for (const pz of [-deckColOff, deckColOff]) {
      const col = new THREE.Mesh(deckColGeo, crimsonPillarMat);
      col.position.set(px, STUPA_DECK_Y_3D + deckPavilionH / 2, pz);
      col.castShadow = !isSoftwareGl;
      stupaGroup.add(col);

      const baseRing = new THREE.Mesh(deckColRingGeo, goldMat);
      baseRing.position.set(px, STUPA_DECK_Y_3D + 0.06, pz);
      stupaGroup.add(baseRing);

      const lanternGlow = new THREE.Mesh(deckLanternBodyGeo, deckLanternGlowMat);
      lanternGlow.position.set(px * 0.94, STUPA_DECK_Y_3D + deckPavilionH - 0.36, pz * 0.94);
      lanternFlames.push(lanternGlow);
      stupaGroup.add(lanternGlow);
    }
  }

  // 9th-Tier Crowning Upturned Pagoda Canopy Roof & Towering Golden Spire Finial
  const crownRoof = createCurvedRoofGroup(
    5.4,
    5.4,
    1.55,
    tileRoofMat,
    goldMat,
    crimsonPillarMat,
    !isSoftwareGl
  );
  crownRoof.position.y = STUPA_DECK_Y_3D + deckPavilionH;
  stupaGroup.add(crownRoof);

  const spireYBase = STUPA_DECK_Y_3D + deckPavilionH + 1.55;
  const spireBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.36, 0.52, 0.5, 12)), goldMat);
  spireBase.position.y = spireYBase + 0.2;
  stupaGroup.add(spireBase);

  const spireOrb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.28, 12, 10)), goldMat);
  spireOrb.position.y = spireYBase + 0.58;
  stupaGroup.add(spireOrb);

  const spireShaft = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.2, 2.05, 12)), goldMat);
  spireShaft.position.y = spireYBase + 1.65;
  stupaGroup.add(spireShaft);

  registerClickable(stupaGroup, clickables, {
    kind: 'interactable',
    action: 'stupa',
    label: INTERACTABLES.stupa.label,
  });
  root.add(stupaGroup);

  // 24. Khu Công Viên Cầu Siêu (Back-Left Memorial Park: x 90..570, y -460..-40)
  const memCenterP = world2DTo3D(330, -245);
  const memPlaza = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(440 * WORLD_TO_3D_SCALE, 0.06, 390 * WORLD_TO_3D_SCALE)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x9aa392, roughness: 0.9 }))
  );
  memPlaza.position.set(memCenterP.x, 0.015, memCenterP.z);
  memPlaza.receiveShadow = true;
  root.add(memPlaza);

  // Framing cypress trees around Công Viên Cầu Siêu
  const cypressLeafMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x355c3c, roughness: 0.82 }));
  const cypressCoords = [
    { x: 118, y: -425 }, { x: 330, y: -445 }, { x: 540, y: -425 },
    { x: 118, y: -250 }, { x: 118, y: -75 }, { x: 540, y: -75 },
  ];
  for (const cc of cypressCoords) {
    const cp = world2DTo3D(cc.x, cc.y);
    const cyGroup = new THREE.Group();
    cyGroup.position.set(cp.x, 0, cp.z);
    const cTrunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 8)), barkMat);
    cTrunk.position.y = 0.8;
    cyGroup.add(cTrunk);
    for (let tier = 0; tier < 3; tier++) {
      const cone = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.92 - tier * 0.22, 1.75, 10)),
        cypressLeafMat
      );
      cone.position.y = 1.85 + tier * 0.92;
      cone.castShadow = !isSoftwareGl;
      cyGroup.add(cone);
    }
    root.add(cyGroup);
  }

  // 4 Sculpted Stone Graves (Mộ Phần) with upright carved steles, incense cups & flower vases
  const graniteDarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x52575b, roughness: 0.68 }));
  const graniteLightMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xaab0b3, roughness: 0.72 }));
  for (const grave of MEMORIAL_GRAVE_SPECS) {
    const gp = world2DTo3D(grave.x, grave.y);
    const gGroup = new THREE.Group();
    gGroup.position.set(gp.x, 0.03, gp.z);

    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.24, 2.25)), graniteLightMat);
    plinth.position.y = 0.12;
    plinth.castShadow = !isSoftwareGl;
    plinth.receiveShadow = true;
    gGroup.add(plinth);

    const moundSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.36, 0.26, 1.65)), graniteDarkMat);
    moundSlab.position.set(0, 0.34, 0.12);
    gGroup.add(moundSlab);

    const stele = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 1.05, 0.22)), graniteDarkMat);
    stele.position.set(0, 0.78, -0.78);
    stele.castShadow = !isSoftwareGl;
    gGroup.add(stele);

    const stelePlaque = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.72, 0.72, 0.24)), goldMat);
    stelePlaque.position.set(0, 0.82, -0.78);
    gGroup.add(stelePlaque);

    const cup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.08, 0.14, 10)), bronzeMat);
    cup.position.set(0, 0.52, 0.56);
    gGroup.add(cup);

    const vase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.06, 0.22, 10)), graniteLightMat);
    vase.position.set(-0.46, 0.56, 0.52);
    gGroup.add(vase);

    const lotusBloom = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.08, 8, 6)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xf4a2b7, roughness: 0.45 }))
    );
    lotusBloom.position.set(-0.46, 0.72, 0.52);
    gGroup.add(lotusBloom);

    root.add(gGroup);
  }

  // Central Đài Cầu Siêu (Memorial Ceremony Altar at INTERACTABLES.memorial 330, -240)
  const memAltarP = world2DTo3D(INTERACTABLES.memorial.x, INTERACTABLES.memorial.y);
  const memAltarGroup = new THREE.Group();
  memAltarGroup.position.set(memAltarP.x, 0.03, memAltarP.z);

  const memHexBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.42, 1.62, 0.34, 6)), stoneMat);
  memHexBase.position.y = 0.17;
  memHexBase.receiveShadow = true;
  memAltarGroup.add(memHexBase);

  const memPedestal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.72, 0.85, 8)), graniteDarkMat);
  memPedestal.position.y = 0.72;
  memPedestal.castShadow = !isSoftwareGl;
  memAltarGroup.add(memPedestal);

  const memLotusBowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.58, 0.34, 0.28, 12)), goldMat);
  memLotusBowl.position.y = 1.22;
  memAltarGroup.add(memLotusBowl);

  const memTablet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.64, 0.88, 0.1)), crimsonPillarMat);
  memTablet.position.set(0, 1.56, -0.26);
  memAltarGroup.add(memTablet);

  const memTabletGold = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.68, 0.12)), goldMat);
  memTabletGold.position.set(0, 1.56, -0.26);
  memAltarGroup.add(memTabletGold);

  // Floating Luminous Memorial Ceremony Aura & Ascending Lotus Orbs
  const memorialAuraGroup = new THREE.Group();
  memorialAuraGroup.position.set(0, 1.55, 0);
  memorialAuraGroup.visible = false;

  const memRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffdf88,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const memHalo = new THREE.Mesh(trackGeo(new THREE.RingGeometry(0.55, 0.92, 24)), memRingMat);
  memHalo.rotation.x = -Math.PI / 2;
  memorialAuraGroup.add(memHalo);

  const memOrbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: 0xffb84d,
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.88,
    })
  );
  for (let i = 0; i < 6; i++) {
    const orb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.09, 10, 8)), memOrbMat);
    orb.userData = { seed: i * 1.05 };
    memorialAuraGroup.add(orb);
  }

  const memBannerCanvas = document.createElement('canvas');
  memBannerCanvas.width = 512;
  memBannerCanvas.height = 112;
  const memBannerTex = new THREE.CanvasTexture(memBannerCanvas);
  memBannerTex.colorSpace = THREE.SRGBColorSpace;
  disposableTexs.push(memBannerTex);
  const memBannerMat = trackMat(
    new THREE.SpriteMaterial({ map: memBannerTex, transparent: true, depthTest: false })
  );
  const memBannerSprite = new THREE.Sprite(memBannerMat);
  memBannerSprite.scale.set(3.4, 0.75, 1);
  memBannerSprite.position.set(0, 1.65, 0);
  memorialAuraGroup.add(memBannerSprite);
  memAltarGroup.add(memorialAuraGroup);

  const updateMemorialBanner3D = (deceasedName: string | null) => {
    if (!deceasedName) {
      memorialAuraGroup.visible = false;
      return;
    }
    memorialAuraGroup.visible = true;
    const bctx = memBannerCanvas.getContext('2d');
    if (bctx) {
      bctx.clearRect(0, 0, memBannerCanvas.width, memBannerCanvas.height);
      bctx.fillStyle = 'rgba(28, 21, 16, 0.84)';
      bctx.strokeStyle = 'rgba(245, 207, 128, 0.85)';
      bctx.lineWidth = 4;
      bctx.fillRect(14, 14, 484, 84);
      bctx.strokeRect(14, 14, 484, 84);
      bctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
      bctx.fillStyle = '#FFE4A3';
      bctx.textAlign = 'center';
      bctx.textBaseline = 'middle';
      bctx.fillText(`Cầu Siêu · ${deceasedName.slice(0, 26)}`, 256, 56);
      memBannerTex.needsUpdate = true;
    }
  };

  registerClickable(memAltarGroup, clickables, {
    kind: 'interactable',
    action: 'memorial',
    label: INTERACTABLES.memorial.label,
  });
  root.add(memAltarGroup);

  // 25. Dàn Hoa Giấy Hồng & 2 Ghế Đá Phía Trước Gian Bếp Chay (PERGOLA_SPEC & PERGOLA_BENCH_SPECS)
  const pergolaP = world2DTo3D(PERGOLA_SPEC.cx, PERGOLA_SPEC.cy);
  const pergolaW3 = (PERGOLA_SPEC.maxX - PERGOLA_SPEC.minX) * WORLD_TO_3D_SCALE;
  const pergolaD3 = (PERGOLA_SPEC.maxY - PERGOLA_SPEC.minY) * WORLD_TO_3D_SCALE;
  const pergolaGroup = new THREE.Group();
  pergolaGroup.position.set(pergolaP.x, 0, pergolaP.z);

  const pergolaPatio = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(pergolaW3 + 1.2, 0.16, pergolaD3 + 1.1)),
    courtyardMat
  );
  pergolaPatio.position.y = 0.0;
  pergolaPatio.receiveShadow = true;
  pergolaGroup.add(pergolaPatio);

  const pergolaBorder = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(pergolaW3 + 1.45, 0.1, pergolaD3 + 1.35)),
    stoneMat
  );
  pergolaBorder.position.y = 0.02;
  pergolaBorder.receiveShadow = true;
  pergolaGroup.add(pergolaBorder);

  const postHalfX = pergolaW3 / 2 - 0.56;
  const postHalfZ = pergolaD3 / 2 - 0.52;
  const pergolaPostH = 2.75;
  for (const px of [-postHalfX, postHalfX]) {
    for (const pz of [-postHalfZ, postHalfZ]) {
      const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.34, 0.46)), stoneMat);
      plinth.position.set(px, 0.25, pz);
      pergolaGroup.add(plinth);

      const post = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.11, 0.13, pergolaPostH, 10)),
        darkWoodMat
      );
      post.position.set(px, 0.34 + pergolaPostH / 2, pz);
      post.castShadow = !isSoftwareGl;
      pergolaGroup.add(post);
    }
  }

  // Main side beams & cross pergola trellis rafters
  for (const pz of [-postHalfZ, postHalfZ]) {
    const beam = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(pergolaW3 + 0.45, 0.18, 0.2)),
      darkWoodMat
    );
    beam.position.set(0, 3.04, pz);
    beam.castShadow = !isSoftwareGl;
    pergolaGroup.add(beam);
  }
  for (let i = 0; i <= 7; i++) {
    const rx = -pergolaW3 / 2 - 0.1 + (i / 7) * (pergolaW3 + 0.2);
    const rafter = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.11, 0.14, pergolaD3 + 0.5)),
      woodMat
    );
    rafter.position.set(rx, 3.16, 0);
    rafter.castShadow = !isSoftwareGl;
    pergolaGroup.add(rafter);
  }
  for (const rz of [-postHalfZ * 0.52, 0, postHalfZ * 0.52]) {
    const lath = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(pergolaW3 + 0.35, 0.06, 0.08)),
      woodMat
    );
    lath.position.set(0, 3.24, rz);
    pergolaGroup.add(lath);
  }

  // Winding climbing woody stems & cascading pink bougainvillea canopy
  const vineMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c3e2a, roughness: 0.9 }));
  const bgLeafMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x457d46, roughness: 0.72 }));
  const bgLeafBrightMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5d9954, roughness: 0.7 }));
  const bgPinkDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd93875,
      emissive: 0x3b0b1d,
      emissiveIntensity: 0.14,
      roughness: 0.55,
    })
  );
  const bgPinkMidMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef629a,
      emissive: 0x461028,
      emissiveIntensity: 0.16,
      roughness: 0.5,
    })
  );
  const bgPinkSoftMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf99dc2,
      emissive: 0x451226,
      emissiveIntensity: 0.12,
      roughness: 0.48,
    })
  );

  for (const [px, pz] of [
    [-postHalfX, -postHalfZ],
    [postHalfX, -postHalfZ],
    [-postHalfX, postHalfZ],
    [postHalfX, postHalfZ],
  ] as const) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const ang = t * Math.PI * 3.5;
      pts.push(
        new THREE.Vector3(
          px + Math.cos(ang) * 0.18,
          0.2 + t * 2.95,
          pz + Math.sin(ang) * 0.18
        )
      );
    }
    const vineCurve = new THREE.CatmullRomCurve3(pts);
    const vineMesh = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(vineCurve, 20, 0.04, 6, false)), vineMat);
    pergolaGroup.add(vineMesh);
  }

  // Lush blooming pink bougainvillea canopy garlands draping over roof & eaves
  const blossomClusterGeo = trackGeo(new THREE.DodecahedronGeometry(0.42, 0));
  const foliageClusterGeo = trackGeo(new THREE.IcosahedronGeometry(0.46, 0));
  const pinkMats = [bgPinkDarkMat, bgPinkMidMat, bgPinkSoftMat];
  for (let i = 0; i < 42; i++) {
    const u = (i % 7) / 6;
    const v = Math.floor(i / 7) / 5;
    const bx = (u - 0.5) * (pergolaW3 + 0.35) + Math.sin(i * 1.9) * 0.25;
    const bz = (v - 0.5) * (pergolaD3 + 0.35) + Math.cos(i * 2.3) * 0.22;
    const isEdge = u <= 0.18 || u >= 0.82 || v <= 0.18 || v >= 0.82;
    const by = 3.24 + Math.sin(i * 1.3) * 0.18 - (isEdge ? (i % 3) * 0.22 : 0);

    const leafBlob = new THREE.Mesh(foliageClusterGeo, i % 2 === 0 ? bgLeafMat : bgLeafBrightMat);
    leafBlob.position.set(bx, by - 0.05, bz);
    leafBlob.scale.set(0.95 + (i % 3) * 0.18, 0.65, 0.92 + (i % 2) * 0.2);
    leafBlob.rotation.set(i * 0.4, i * 0.7, 0);
    pergolaGroup.add(leafBlob);

    const flowerBlob = new THREE.Mesh(blossomClusterGeo, pinkMats[i % pinkMats.length]);
    flowerBlob.position.set(bx + Math.cos(i) * 0.14, by + 0.1, bz + Math.sin(i) * 0.14);
    flowerBlob.scale.set(1.0 + (i % 4) * 0.16, 0.72, 1.0 + (i % 3) * 0.14);
    flowerBlob.rotation.set(i * 0.5, i * 1.1, i * 0.3);
    flowerBlob.castShadow = !isSoftwareGl;
    pergolaGroup.add(flowerBlob);
  }

  // Hanging side garlands draped down around the corners
  for (const [gx, gz] of [
    [-postHalfX - 0.08, postHalfZ + 0.14],
    [postHalfX + 0.08, postHalfZ + 0.14],
    [-postHalfX - 0.08, -postHalfZ - 0.14],
    [postHalfX + 0.08, -postHalfZ - 0.14],
  ] as const) {
    for (let h = 0; h < 3; h++) {
      const hangFlower = new THREE.Mesh(blossomClusterGeo, pinkMats[h % pinkMats.length]);
      hangFlower.position.set(gx, 2.75 - h * 0.36, gz);
      hangFlower.scale.set(0.68 - h * 0.1, 0.62, 0.68 - h * 0.1);
      pergolaGroup.add(hangFlower);
    }
  }

  // Softly falling pink bougainvillea petals animated inside TempleFirstPersonView
  const bougainvilleaPetals = new THREE.Group();
  const petalMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xf471a8, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })
  );
  const petalGeo = trackGeo(new THREE.PlaneGeometry(0.11, 0.07));
  for (let p = 0; p < 24; p++) {
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.userData = {
      seed: p * 0.73,
      ox: ((p % 6) - 2.5) * 1.45,
      oz: (Math.floor(p / 6) - 1.5) * 1.15,
    };
    bougainvilleaPetals.add(petal);
  }
  pergolaGroup.add(bougainvilleaPetals);
  root.add(pergolaGroup);

  // Carved 2-Person Granite Stone Benches under Dàn Hoa Giấy Hồng & Scenic Spots Across the Temple Grounds
  const benchStoneTopMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xc2bcb3, roughness: 0.62 }));
  const benchStoneLegMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x8b857c, roughness: 0.78 }));
  const benchPadMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9f9588, roughness: 0.75 }));
  for (const benchSpec of PERGOLA_BENCH_SPECS) {
    const bp = world2DTo3D(benchSpec.x, benchSpec.y - 4);
    const baseElev = getGroundElevation3D(benchSpec.x, benchSpec.y);
    const bGroup = new THREE.Group();
    bGroup.position.set(bp.x, baseElev, bp.z);

    // Carved stone pedestal legs
    for (const lx of [-0.86, 0.86]) {
      const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.42, 0.58)), benchStoneLegMat);
      leg.position.set(lx, 0.21, 0);
      leg.castShadow = !isSoftwareGl;
      bGroup.add(leg);
    }
    // Smooth wide granite 2-person bench seat (2.34m wide so two avatars at ±0.76m sit cleanly side-by-side)
    const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.34, 0.11, 0.7)), benchStoneTopMat);
    seat.position.set(0, 0.46, 0.02);
    seat.castShadow = !isSoftwareGl;
    seat.receiveShadow = true;
    bGroup.add(seat);

    // Dual subtle stone seat inlays at Left (-0.76m) & Right (+0.76m)
    for (const sx of [-0.76, 0.76]) {
      const seatInlay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.84, 0.025, 0.52)), benchPadMat);
      seatInlay.position.set(sx, 0.525, 0.04);
      bGroup.add(seatInlay);
    }

    // Sculpted stone backrest facing south (+Z)
    const backrest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.24, 0.46, 0.12)), benchStoneTopMat);
    backrest.position.set(0, 0.73, -0.27);
    backrest.rotation.x = -0.1;
    backrest.castShadow = !isSoftwareGl;
    bGroup.add(backrest);

    // Decorative lotus corner armrests
    for (const ax of [-1.14, 1.14]) {
      const armrest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.24, 0.68)), benchStoneLegMat);
      armrest.position.set(ax, 0.58, 0.01);
      bGroup.add(armrest);
    }

    registerClickable(bGroup, clickables, {
      kind: 'bench',
      benchIndex: benchSpec.index,
      label: `${benchSpec.label} (Tối đa 2 người · Nhấn để ngồi)`,
    });
    root.add(bGroup);
  }

  // 25b. Khay Thóc Chim, Hạt Thóc Rải & Đàn Chim Bồ Câu / Chim Sẻ (Dàn Hoa Giấy Hồng)
  const birdFeederP = world2DTo3D(INTERACTABLES.feed_birds.x, INTERACTABLES.feed_birds.y);
  const birdFeederGroup = new THREE.Group();
  birdFeederGroup.position.set(birdFeederP.x, 0.08, birdFeederP.z);

  const bfPedestal = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.12, 0.17, 0.46, 10)),
    darkWoodMat
  );
  bfPedestal.position.y = 0.23;
  bfPedestal.castShadow = !isSoftwareGl;
  birdFeederGroup.add(bfPedestal);

  const bfTray = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.32, 0.22, 0.11, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xb07346, roughness: 0.62 }))
  );
  bfTray.position.y = 0.5;
  bfTray.castShadow = !isSoftwareGl;
  birdFeederGroup.add(bfTray);

  const bfGrainsMound = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xeac058, roughness: 0.85 }))
  );
  bfGrainsMound.scale.set(1, 0.36, 1);
  bfGrainsMound.position.y = 0.53;
  birdFeederGroup.add(bfGrainsMound);

  registerClickable(birdFeederGroup, clickables, {
    kind: 'interactable',
    action: 'feed_birds',
    label: INTERACTABLES.feed_birds.label,
  });
  root.add(birdFeederGroup);

  const birdSeedsOrigin = world2DTo3D(PERGOLA_SPEC.cx, 774);
  const birdSeedsGroup = new THREE.Group();
  birdSeedsGroup.position.set(birdSeedsOrigin.x, 0.105, birdSeedsOrigin.z);
  birdSeedsGroup.visible = false;
  const milletSeedMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf4cc5a, roughness: 0.65 }));
  const milletSeedGeo = trackGeo(new THREE.SphereGeometry(0.036, 6, 5));
  for (let i = 0; i < 24; i++) {
    const seedMesh = new THREE.Mesh(milletSeedGeo, milletSeedMat);
    seedMesh.scale.set(1.35, 0.65, 0.9);
    seedMesh.position.set(Math.sin(i * 2.17) * 1.65, 0, Math.cos(i * 1.63) * 0.72);
    seedMesh.rotation.y = i * 0.7;
    birdSeedsGroup.add(seedMesh);
  }
  root.add(birdSeedsGroup);

  // Articulated 3D Doves (Chim Bồ Câu) & Sparrows (Chim Sẻ) gliding over Dàn Hoa Giấy Hồng
  const doveBodyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.52 }));
  const doveWingTipMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xc8c7c2, roughness: 0.58 }));
  const doveBeakMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe28a72, roughness: 0.48 }));
  const sparrowBackMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x825636, roughness: 0.68 }));
  const sparrowBellyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2cca9, roughness: 0.66 }));
  const sparrowBeakMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd9a04b, roughness: 0.55 }));
  const birdEyeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a1513, roughness: 0.3 }));

  const createBirdModel3D = (kind: 'dove' | 'sparrow') => {
    const g = new THREE.Group();
    const isDove = kind === 'dove';
    const sc = isDove ? 1.0 : 0.66;

    const torso = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.11 * sc, 10, 8)),
      isDove ? doveBodyMat : sparrowBellyMat
    );
    torso.scale.set(0.85, 0.78, 1.55);
    torso.castShadow = !isSoftwareGl;
    g.add(torso);

    if (!isDove) {
      const mantle = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.105 * sc, 8, 6)), sparrowBackMat);
      mantle.scale.set(0.82, 0.55, 1.45);
      mantle.position.set(0, 0.03 * sc, -0.01 * sc);
      g.add(mantle);
    }

    const head = new THREE.Group();
    head.position.set(0, 0.075 * sc, 0.145 * sc);
    const skull = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.068 * sc, 9, 8)),
      isDove ? doveBodyMat : sparrowBackMat
    );
    head.add(skull);

    const beak = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.022 * sc, 0.075 * sc, 6)),
      isDove ? doveBeakMat : sparrowBeakMat
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.008 * sc, 0.08 * sc);
    head.add(beak);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.012 * sc, 6, 5)), birdEyeMat);
      eye.position.set(side * 0.044 * sc, 0.015 * sc, 0.036 * sc);
      head.add(eye);
    }
    g.add(head);

    const tail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.11 * sc, 0.018 * sc, 0.18 * sc)),
      isDove ? doveWingTipMat : sparrowBackMat
    );
    tail.position.set(0, 0.02 * sc, -0.2 * sc);
    tail.rotation.x = 0.2;
    g.add(tail);

    const makeWing = (side: -1 | 1) => {
      const wPivot = new THREE.Group();
      wPivot.position.set(side * 0.075 * sc, 0.045 * sc, 0.02 * sc);
      const innerWing = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.24 * sc, 0.022 * sc, 0.15 * sc)),
        isDove ? doveBodyMat : sparrowBackMat
      );
      innerWing.position.set(side * 0.12 * sc, 0, -0.01 * sc);
      innerWing.castShadow = !isSoftwareGl;
      wPivot.add(innerWing);

      const outerTip = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.14 * sc, 0.016 * sc, 0.11 * sc)),
        isDove ? doveWingTipMat : sparrowBackMat
      );
      outerTip.position.set(side * 0.27 * sc, 0, -0.035 * sc);
      wPivot.add(outerTip);
      return wPivot;
    };

    const wingL = makeWing(-1);
    const wingR = makeWing(1);
    g.add(wingL, wingR);

    return { group: g, wingL, wingR, head };
  };

  const bougainvilleaBirds: AnimatedBird3D[] = [];
  const birdConfigs3D = [
    { kind: 'dove' as const, rx: 4.5, rz: 2.6, baseY: 4.15, speed: 0.68, phase: 0.0, landX: -0.95, landZ: -0.3, stagger: 0.0 },
    { kind: 'dove' as const, rx: 5.1, rz: 2.3, baseY: 4.45, speed: -0.62, phase: 1.7, landX: 0.8, landZ: -0.15, stagger: 0.14 },
    { kind: 'dove' as const, rx: 3.9, rz: 2.9, baseY: 3.95, speed: 0.74, phase: 3.3, landX: -0.25, landZ: 0.44, stagger: 0.28 },
    { kind: 'dove' as const, rx: 5.5, rz: 2.5, baseY: 4.65, speed: -0.56, phase: 4.8, landX: 1.2, landZ: 0.4, stagger: 0.42 },
    { kind: 'sparrow' as const, rx: 3.4, rz: 2.0, baseY: 3.65, speed: 1.05, phase: 0.6, landX: -1.42, landZ: 0.24, stagger: 0.08 },
    { kind: 'sparrow' as const, rx: 4.1, rz: 1.9, baseY: 3.85, speed: -0.96, phase: 2.1, landX: -0.48, landZ: -0.55, stagger: 0.22 },
    { kind: 'sparrow' as const, rx: 3.7, rz: 2.4, baseY: 3.72, speed: 1.12, phase: 3.7, landX: 0.4, landZ: 0.08, stagger: 0.34 },
    { kind: 'sparrow' as const, rx: 4.6, rz: 2.15, baseY: 4.02, speed: -1.04, phase: 5.1, landX: 1.44, landZ: -0.24, stagger: 0.46 },
    { kind: 'sparrow' as const, rx: 3.1, rz: 1.75, baseY: 3.55, speed: 1.18, phase: 1.2, landX: 0.16, landZ: 0.62, stagger: 0.18 },
  ];

  for (const cfg of birdConfigs3D) {
    const model = createBirdModel3D(cfg.kind);
    model.group.position.set(pergolaP.x, cfg.baseY, pergolaP.z);
    root.add(model.group);
    bougainvilleaBirds.push({
      group: model.group,
      wingL: model.wingL,
      wingR: model.wingR,
      head: model.head,
      kind: cfg.kind,
      originX: pergolaP.x,
      originZ: pergolaP.z,
      baseY: cfg.baseY,
      rx: cfg.rx,
      rz: cfg.rz,
      speed: cfg.speed,
      phase: cfg.phase,
      landX: birdSeedsOrigin.x + cfg.landX,
      landZ: birdSeedsOrigin.z + cfg.landZ,
      stagger: cfg.stagger,
    });
  }

  // 26. Dãy Núi Liên Sơn (Climbable Back-Right Mountain Range equal in height to Bảo Tháp ~ 24.4m)
  const mountainGroup = new THREE.Group();
  const rockDarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5d645e, roughness: 0.94, flatShading: true }));
  const rockMidMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x73796f, roughness: 0.9, flatShading: true }));
  const rockMossMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x4b6844, roughness: 0.88, flatShading: true }));
  const pineNeedleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2c5236, roughness: 0.84 }));
  const stairStoneMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9b9286, roughness: 0.82 }));
  const stairCurbMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x706960, roughness: 0.88 }));

  // Mountain ridges & towering faceted granite/moss peaks
  for (let idx = 0; idx < MOUNTAIN_PEAKS.length; idx++) {
    const pk = MOUNTAIN_PEAKS[idx];
    const p3 = world2DTo3D(pk.x, pk.y);
    const radius3 = pk.radius * WORLD_TO_3D_SCALE;

    // Lower mossy rocky massif skirt
    const skirt = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(radius3 * 1.12, pk.height * 0.72, 7)),
      rockMossMat
    );
    skirt.position.set(p3.x, pk.height * 0.34, p3.z);
    skirt.rotation.y = idx * 0.85;
    skirt.scale.set(1.08, 1, 0.94);
    skirt.castShadow = !isSoftwareGl;
    skirt.receiveShadow = true;
    mountainGroup.add(skirt);

    // Upper rugged granite spire matching Bảo Tháp stature (up to 24.4m)
    const spire = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(radius3 * 0.76, pk.height, 6)),
      idx % 2 === 0 ? rockDarkMat : rockMidMat
    );
    spire.position.set(p3.x, pk.height * 0.49, p3.z);
    spire.rotation.y = idx * 1.15 + 0.35;
    spire.castShadow = !isSoftwareGl;
    spire.receiveShadow = true;
    mountainGroup.add(spire);
  }

  // Secondary rocky cliff outcrops & mossy foothill boulders
  const rockOutcrops = [
    { x: 1475, y: 120, r: 2.3, h: 4.5 },
    { x: 1795, y: 85, r: 2.8, h: 6.2 },
    { x: 1455, y: -60, r: 2.6, h: 7.4 },
    { x: 1810, y: -95, r: 3.1, h: 10.5 },
    { x: 1495, y: -395, r: 3.4, h: 12.2 },
    { x: 1785, y: -405, r: 3.2, h: 13.8 },
  ];
  rockOutcrops.forEach((ro, rIdx) => {
    const r3 = world2DTo3D(ro.x, ro.y);
    const rock = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(ro.r, ro.h, 6)),
      rIdx % 2 === 0 ? rockDarkMat : rockMossMat
    );
    rock.position.set(r3.x, ro.h * 0.46, r3.z);
    rock.rotation.y = rIdx * 0.9;
    rock.receiveShadow = true;
    mountainGroup.add(rock);
  });

  // Alpine wind-swept pine trees along ridges (grouped trunk + layered tiered crowns)
  const pineCoords = [
    { x: 1455, y: 115, scale: 1.0 },
    { x: 1785, y: 120, scale: 1.1 },
    { x: 1480, y: -30, scale: 0.95 },
    { x: 1805, y: -35, scale: 1.15 },
    { x: 1475, y: -225, scale: 1.05 },
    { x: 1815, y: -240, scale: 1.2 },
    { x: 1525, y: -385, scale: 1.1 },
    { x: 1765, y: -405, scale: 1.15 },
  ];
  for (const pc of pineCoords) {
    const p3 = world2DTo3D(pc.x, pc.y);
    const baseElev = Math.max(0.4, getGroundElevation3D(pc.x, pc.y) * 0.55 + 1.2);
    const pine = new THREE.Group();
    pine.position.set(p3.x, baseElev, p3.z);
    pine.scale.setScalar(pc.scale);

    const pTrunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.18, 1.4, 7)), barkMat);
    pTrunk.position.y = 0.7;
    pine.add(pTrunk);

    for (let t = 0; t < 3; t++) {
      const cone = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.95 - t * 0.22, 1.45, 8)),
        pineNeedleMat
      );
      cone.position.y = 1.45 + t * 0.78;
      cone.castShadow = !isSoftwareGl;
      pine.add(cone);
    }
    mountainGroup.add(pine);
  }

  // Continuous Stone Stair Trail following MOUNTAIN_TRAIL_WAYPOINTS from 0.0m to 18.2m Summit Overlook
  for (let i = 0; i < MOUNTAIN_TRAIL_WAYPOINTS.length - 1; i++) {
    const a = MOUNTAIN_TRAIL_WAYPOINTS[i];
    const b = MOUNTAIN_TRAIL_WAYPOINTS[i + 1];
    const a3 = world2DTo3D(a.x, a.y);
    const b3 = world2DTo3D(b.x, b.y);
    const dx3 = b3.x - a3.x;
    const dz3 = b3.z - a3.z;
    const segLen3 = Math.hypot(dx3, dz3);
    const yaw = Math.atan2(dx3, dz3);
    const stepCount = Math.max(8, Math.ceil(segLen3 / 0.42));

    for (let s = 0; s <= stepCount; s++) {
      const t = s / stepCount;
      const sx = THREE.MathUtils.lerp(a3.x, b3.x, t);
      const sz = THREE.MathUtils.lerp(a3.z, b3.z, t);
      const sy = THREE.MathUtils.lerp(a.elev, b.elev, t);

      // Solid earth/rock embankment beneath stairs so trail never floats
      const supportH = Math.max(0.4, sy + 0.6);
      const support = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(2.35, supportH, 0.72)),
        rockDarkMat
      );
      support.position.set(sx, sy - supportH / 2 - 0.02, sz);
      support.rotation.y = yaw;
      support.receiveShadow = true;
      mountainGroup.add(support);

      // Walkable stone stair tread matching getGroundElevation3D
      const tread = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(2.15, 0.18, 0.56)),
        stairStoneMat
      );
      tread.position.set(sx, sy - 0.09, sz);
      tread.rotation.y = yaw;
      tread.receiveShadow = true;
      mountainGroup.add(tread);

      // Wooden safety posts every 5 steps along outer trail edge
      if (s % 5 === 0) {
        const nx = Math.cos(yaw);
        const nz = -Math.sin(yaw);
        for (const side of [-1.02, 1.02]) {
          const post = new THREE.Mesh(
            trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 0.82, 6)),
            darkWoodMat
          );
          post.position.set(sx + nx * side, sy + 0.4, sz + nz * side);
          mountainGroup.add(post);
        }
      }
    }

    // Switchback stone landing pad at start of segments
    if (i > 0) {
      const landing = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(1.38, 1.56, 0.24, 8)),
        stairStoneMat
      );
      landing.position.set(a3.x, a.elev - 0.12, a3.z);
      landing.receiveShadow = true;
      mountainGroup.add(landing);
    }
  }

  // Summit Overlook Platform (Đài Ngắm Cảnh Đỉnh Núi at P6 1615, -258, elev = 18.2m)
  const summitWp = MOUNTAIN_TRAIL_WAYPOINTS[MOUNTAIN_TRAIL_WAYPOINTS.length - 1];
  const summitP3 = world2DTo3D(summitWp.x, summitWp.y);
  const summitY = summitWp.elev;

  const summitBaseSupport = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.65, 4.4, summitY, 10)),
    rockDarkMat
  );
  summitBaseSupport.position.set(summitP3.x, summitY / 2 - 0.15, summitP3.z);
  summitBaseSupport.receiveShadow = true;
  mountainGroup.add(summitBaseSupport);

  const summitDeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.45, 2.65, 0.34, 8)),
    stairStoneMat
  );
  summitDeck.position.set(summitP3.x, summitY - 0.17, summitP3.z);
  summitDeck.receiveShadow = true;
  mountainGroup.add(summitDeck);

  // Carved Stone Safety Balustrade & Mountain Summit Stone Lanterns (open south-east entry)
  for (let seg = 0; seg < 8; seg++) {
    const ang = (seg / 8) * Math.PI * 2;
    const px = summitP3.x + Math.cos(ang) * 2.25;
    const pz = summitP3.z + Math.sin(ang) * 2.25;
    const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.86, 0.18)), stairCurbMat);
    post.position.set(px, summitY + 0.43, pz);
    mountainGroup.add(post);

    if (seg % 2 === 0) {
      const capOrb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.12, 8, 6)), flameMat);
      capOrb.position.set(px, summitY + 0.92, pz);
      lanternFlames.push(capOrb);
      mountainGroup.add(capOrb);
    }

    // Connect handrail bars except entrance toward P5 (southeast/east)
    const nextAng = ((seg + 1) / 8) * Math.PI * 2;
    const midAng = (ang + nextAng) / 2;
    if (Math.sin(midAng) < 0.72 || Math.cos(midAng) < 0.4) {
      const nx = summitP3.x + Math.cos(nextAng) * 2.25;
      const nz = summitP3.z + Math.sin(nextAng) * 2.25;
      const barLen = Math.hypot(nx - px, nz - pz);
      const bar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(barLen, 0.09, 0.1)), woodMat);
      bar.position.set((px + nx) / 2, summitY + 0.76, (pz + nz) / 2);
      bar.rotation.y = -Math.atan2(nz - pz, nx - px);
      mountainGroup.add(bar);
    }
  }

  // Summit Prayer Stone Stele Plaque facing overlooking Bảo Tháp & sea
  const summitStele = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.9, 1.3, 0.22)), rockDarkMat);
  summitStele.position.set(summitP3.x + 1.55, summitY + 0.65, summitP3.z - 0.9);
  summitStele.rotation.y = -0.65;
  mountainGroup.add(summitStele);

  const summitPlaque = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 0.92, 0.24)), goldMat);
  summitPlaque.position.set(summitP3.x + 1.55, summitY + 0.68, summitP3.z - 0.9);
  summitPlaque.rotation.y = -0.65;
  mountainGroup.add(summitPlaque);

  root.add(mountainGroup);

  // 27. Intricate Multi-Part Hòn Non Bộ & Tiểu Cảnh Sơn Thủy (Ao Sen Emerald Water & Koi)
  const nbCenter = world2DTo3D(HON_NON_BO_SPEC.cx, HON_NON_BO_SPEC.cy);
  const nbRx = HON_NON_BO_SPEC.rx * WORLD_TO_3D_SCALE; // 5.28m
  const nbRz = HON_NON_BO_SPEC.ry * WORLD_TO_3D_SCALE; // 3.68m
  const honNonBoGroup = new THREE.Group();
  honNonBoGroup.position.set(nbCenter.x, 0, nbCenter.z);

  const nbStoneRimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xa19789, roughness: 0.74 }));
  const nbBasinTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x7b746a, roughness: 0.8 }));
  const nbBasinFloorMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a3e44, roughness: 0.95 }));
  const nbRockMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x69736b, roughness: 0.9, flatShading: true }));
  const nbRockDarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x48514c, roughness: 0.92, flatShading: true }));
  const nbRockHighlightMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x7e877b, roughness: 0.86, flatShading: true }));
  const nbMossMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x52884b, roughness: 0.88 }));
  const nbFernMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3f753c, roughness: 0.82 }));
  // Exact Ao Sen translucent emerald-jade water material (depthWrite false so underwater Koi render crisply)
  const nbWaterMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x3b848a,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );

  // Hollow Carved Stone Basin Curb & Stepped Plinth (open center so Ao Sen water & Koi show clearly!)
  const plinthShape = new THREE.Shape();
  plinthShape.absellipse(0, 0, nbRx + 0.44, nbRz + 0.44, 0, Math.PI * 2, false, 0);
  const plinthHole = new THREE.Path();
  plinthHole.absellipse(0, 0, nbRx + 0.14, nbRz + 0.14, 0, Math.PI * 2, true, 0);
  plinthShape.holes.push(plinthHole);
  const plinthGeo = trackGeo(
    new THREE.ExtrudeGeometry(plinthShape, {
      depth: 0.12,
      bevelEnabled: false,
      curveSegments: 48,
    })
  );
  plinthGeo.rotateX(-Math.PI / 2);
  const basinPlinth = new THREE.Mesh(plinthGeo, nbBasinTrimMat);
  basinPlinth.position.y = 0.01;
  basinPlinth.receiveShadow = true;
  honNonBoGroup.add(basinPlinth);

  const curbShape = new THREE.Shape();
  curbShape.absellipse(0, 0, nbRx + 0.28, nbRz + 0.28, 0, Math.PI * 2, false, 0);
  const curbHole = new THREE.Path();
  curbHole.absellipse(0, 0, nbRx - 0.1, nbRz - 0.1, 0, Math.PI * 2, true, 0);
  curbShape.holes.push(curbHole);
  const curbGeo = trackGeo(
    new THREE.ExtrudeGeometry(curbShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
      curveSegments: 48,
    })
  );
  curbGeo.rotateX(-Math.PI / 2);
  const basinOuter = new THREE.Mesh(curbGeo, nbStoneRimMat);
  basinOuter.position.y = 0.04;
  basinOuter.castShadow = !isSoftwareGl;
  basinOuter.receiveShadow = true;
  honNonBoGroup.add(basinOuter);

  // Dark Teal Basin Floor & Ao Sen Emerald Water Surface
  const basinInnerBedGeo = trackGeo(new THREE.CircleGeometry(1, 44));
  basinInnerBedGeo.rotateX(-Math.PI / 2);
  const basinInnerBed = new THREE.Mesh(basinInnerBedGeo, nbBasinFloorMat);
  basinInnerBed.scale.set(nbRx - 0.04, 1, nbRz - 0.04);
  basinInnerBed.position.y = 0.035;
  basinInnerBed.receiveShadow = true;
  honNonBoGroup.add(basinInnerBed);

  const basinWaterGeo = trackGeo(new THREE.CircleGeometry(1, 44));
  basinWaterGeo.rotateX(-Math.PI / 2);
  const basinWater = new THREE.Mesh(basinWaterGeo, nbWaterMat);
  basinWater.scale.set(nbRx - 0.06, 1, nbRz - 0.06);
  basinWater.position.y = 0.3;
  basinWater.renderOrder = 2;
  basinWater.receiveShadow = true;
  honNonBoGroup.add(basinWater);

  // Carved lotus-curb medallions & mossy shoreline rocks around the basin rim
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const rxPos = Math.cos(ang) * (nbRx + 0.12);
    const rzPos = Math.sin(ang) * (nbRz + 0.12);
    if (i % 2 === 0) {
      const curbCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 8)), nbStoneRimMat);
      curbCap.position.set(rxPos, 0.44, rzPos);
      honNonBoGroup.add(curbCap);
    } else {
      const shoreRock = new THREE.Mesh(
        trackGeo(new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.07, 0)),
        i % 3 === 0 ? nbRockDarkMat : nbRockMat
      );
      shoreRock.scale.set(1.25, 0.62, 1.0);
      shoreRock.position.set(rxPos * 0.94, 0.32, rzPos * 0.94);
      shoreRock.rotation.y = ang;
      honNonBoGroup.add(shoreRock);
    }
  }

  // Sculpted Multi-Tier Karst Rockery (Tam Sơn Massif) with Illuminated Grotto Cave
  const cragClusters = [
    // Central Grand Massif + Upper Waterfall Basin
    { x: -0.92, y: 0.92, z: -0.78, r: 0.92, sx: 1.05, sy: 1.38, sz: 0.92, mat: nbRockDarkMat },
    { x: 0.78, y: 0.96, z: -0.78, r: 0.94, sx: 1.08, sy: 1.44, sz: 0.94, mat: nbRockDarkMat },
    { x: -0.06, y: 1.98, z: -0.95, r: 1.04, sx: 1.24, sy: 1.72, sz: 0.96, mat: nbRockMat },
    { x: -0.02, y: 3.35, z: -1.02, r: 0.64, sx: 0.92, sy: 1.75, sz: 0.84, mat: nbRockHighlightMat },
    { x: -0.46, y: 2.75, z: -0.96, r: 0.48, sx: 0.88, sy: 1.35, sz: 0.82, mat: nbRockMat },
    { x: 0.46, y: 2.65, z: -0.92, r: 0.46, sx: 0.85, sy: 1.28, sz: 0.82, mat: nbRockDarkMat },
    // Grotto Arch Crown & Recess
    { x: -0.04, y: 1.48, z: -0.35, r: 0.62, sx: 1.65, sy: 0.48, sz: 0.78, mat: nbRockHighlightMat },
    { x: -0.04, y: 2.38, z: -0.45, r: 0.56, sx: 1.3, sy: 0.42, sz: 0.75, mat: nbRockMat },
    // Left Cliff Terrace (supports Chùa Cổ 3 Tầng Mini)
    { x: -1.92, y: 1.02, z: -0.42, r: 1.04, sx: 1.24, sy: 1.28, sz: 1.06, mat: nbRockMat },
    { x: -2.02, y: 1.92, z: -0.52, r: 0.74, sx: 1.18, sy: 0.64, sz: 1.04, mat: nbRockHighlightMat },
    { x: -2.85, y: 0.68, z: -0.15, r: 0.68, sx: 1.12, sy: 0.92, sz: 0.96, mat: nbRockDarkMat },
    // Right Cliff Terrace (supports Cây Tùng Bonsai & Đình Vọng Nguyệt)
    { x: 1.92, y: 1.0, z: -0.38, r: 0.98, sx: 1.2, sy: 1.28, sz: 1.02, mat: nbRockMat },
    { x: 2.02, y: 1.84, z: -0.44, r: 0.68, sx: 1.1, sy: 0.66, sz: 0.98, mat: nbRockHighlightMat },
    { x: 2.95, y: 0.74, z: 0.12, r: 0.72, sx: 1.15, sy: 0.98, sz: 1.02, mat: nbRockDarkMat },
    // Foothill Islets & Shore Outcrops
    { x: -2.52, y: 0.44, z: 0.48, r: 0.54, sx: 1.22, sy: 0.72, sz: 0.98, mat: nbRockDarkMat },
    { x: 1.48, y: 0.48, z: 0.76, r: 0.56, sx: 1.18, sy: 0.68, sz: 1.0, mat: nbRockDarkMat },
    { x: -0.98, y: 0.46, z: 0.36, r: 0.42, sx: 1.15, sy: 0.62, sz: 0.95, mat: nbRockMat },
    { x: 0.85, y: 0.44, z: 0.25, r: 0.4, sx: 1.1, sy: 0.58, sz: 0.92, mat: nbRockMat },
  ];
  cragClusters.forEach((cr, idx) => {
    const rock = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(cr.r, 0)), cr.mat);
    rock.position.set(cr.x, cr.y, cr.z);
    rock.scale.set(cr.sx, cr.sy, cr.sz);
    rock.rotation.set(idx * 0.37, idx * 0.81, idx * 0.22);
    rock.castShadow = !isSoftwareGl;
    rock.receiveShadow = true;
    honNonBoGroup.add(rock);
  });

  // Illuminated Stone Grotto Cave Shrine inside central massif
  const caveRecess = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.38, 0.44, 0.78, 12)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x1e1915, roughness: 0.98 }))
  );
  caveRecess.position.set(-0.04, 0.78, -0.58);
  honNonBoGroup.add(caveRecess);

  const caveMiniBuddha = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.14, 10, 8)),
    goldMat
  );
  caveMiniBuddha.scale.set(0.95, 1.35, 0.85);
  caveMiniBuddha.position.set(-0.04, 0.72, -0.48);
  honNonBoGroup.add(caveMiniBuddha);

  const caveGlow = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.11, 8, 6)),
    flameMat
  );
  caveGlow.position.set(-0.04, 0.62, -0.34);
  lanternFlames.push(caveGlow);
  honNonBoGroup.add(caveGlow);

  // Moss cushions & lush fern tufts clinging to crag ledges
  for (const ms of [
    { x: -1.92, y: 2.24, z: -0.46, r: 0.58 },
    { x: 1.96, y: 2.18, z: -0.4, r: 0.52 },
    { x: 2.95, y: 1.24, z: 0.12, r: 0.48 },
    { x: -0.48, y: 2.52, z: -0.48, r: 0.44 },
    { x: 0.84, y: 0.72, z: 0.24, r: 0.36 },
    { x: -0.98, y: 0.72, z: 0.34, r: 0.36 },
  ]) {
    const moss = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(ms.r, 8, 6)), nbMossMat);
    moss.scale.set(1.22, 0.3, 1.06);
    moss.position.set(ms.x, ms.y, ms.z);
    honNonBoGroup.add(moss);
  }
  for (const ft of [
    { x: -2.45, y: 0.78, z: 0.42 },
    { x: 1.48, y: 0.82, z: 0.76 },
    { x: -1.15, y: 1.48, z: -0.4 },
    { x: 1.05, y: 1.56, z: -0.42 },
  ]) {
    for (let f = 0; f < 4; f++) {
      const frond = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.08, 0.34, 5)), nbFernMat);
      frond.position.set(ft.x, ft.y, ft.z);
      frond.rotation.set(0.45, (f / 4) * Math.PI * 2, 0.38);
      honNonBoGroup.add(frond);
    }
  }

  // Two-Tier Animated Cascading Waterfall & Splash Ring
  const honNonBoWaterfall = new THREE.Group();
  const wfMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xdffbff,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    })
  );
  const wfRibbonUpper = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.32, 1.05, 1, 4)), wfMat);
  wfRibbonUpper.position.set(0.06, 2.26, -0.36);
  wfRibbonUpper.rotation.x = -0.24;
  honNonBoWaterfall.add(wfRibbonUpper);

  const wfSplash = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(0.18, 0.52, 22)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0xeefdff, transparent: true, opacity: 0.68, side: THREE.DoubleSide }))
  );
  wfSplash.rotation.x = -Math.PI / 2;
  wfSplash.position.set(0.08, 0.315, 0.32);
  honNonBoWaterfall.add(wfSplash);

  const wfRibbonLower = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.44, 1.38, 1, 6)), wfMat);
  wfRibbonLower.position.set(0.08, 1.04, 0.02);
  wfRibbonLower.rotation.x = -0.22;
  honNonBoWaterfall.add(wfRibbonLower);

  for (let d = 0; d < 8; d++) {
    const drop = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.075, 6, 6)), wfMat);
    drop.userData = { seed: d / 8 };
    drop.position.set(0.08 + ((d % 2) - 0.5) * 0.16, 2.5 - d * 0.28, -0.18 + d * 0.06);
    honNonBoWaterfall.add(drop);
  }
  honNonBoGroup.add(honNonBoWaterfall);

  // Miniature Ornament 1: Chùa Cổ 3 Tầng Mini (3-tier pagoda perched on left peak terrace)
  const miniPagoda = new THREE.Group();
  miniPagoda.position.set(-1.96, 2.28, -0.44);
  const miniWallMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf1dec2, roughness: 0.72 }));
  const mpBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.6, 0.34, 0.6)), miniWallMat);
  mpBase.position.y = 0.17;
  miniPagoda.add(mpBase);
  const mpRoof1 = createCurvedRoofGroup(1.0, 1.0, 0.28, tileRoofMat, goldMat, crimsonPillarMat, false);
  mpRoof1.position.y = 0.34;
  miniPagoda.add(mpRoof1);
  const mpTier2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.44, 0.24, 0.44)), miniWallMat);
  mpTier2.position.y = 0.66;
  miniPagoda.add(mpTier2);
  const mpRoof2 = createCurvedRoofGroup(0.76, 0.76, 0.24, tileRoofMat, goldMat, crimsonPillarMat, false);
  mpRoof2.position.y = 0.78;
  miniPagoda.add(mpRoof2);
  const mpTier3 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.3, 0.2, 0.3)), miniWallMat);
  mpTier3.position.y = 1.04;
  miniPagoda.add(mpTier3);
  const mpRoof3 = createCurvedRoofGroup(0.56, 0.56, 0.2, tileRoofMat, goldMat, crimsonPillarMat, false);
  mpRoof3.position.y = 1.14;
  miniPagoda.add(mpRoof3);
  const mpSpire = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.05, 0.24, 8)), goldMat);
  mpSpire.position.y = 1.46;
  miniPagoda.add(mpSpire);
  honNonBoGroup.add(miniPagoda);

  // Miniature Ornament 2: Đình Vọng Nguyệt (hexagonal gazebo perched on east rocky outcrop)
  const miniGazebo = new THREE.Group();
  miniGazebo.position.set(2.95, 1.28, 0.12);
  const gzFloor = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.44, 0.48, 0.1, 6)), nbStoneRimMat);
  miniGazebo.add(gzFloor);
  for (let p = 0; p < 6; p++) {
    const ang = (p / 6) * Math.PI * 2;
    const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.036, 0.46, 6)), crimsonPillarMat);
    col.position.set(Math.cos(ang) * 0.34, 0.28, Math.sin(ang) * 0.34);
    miniGazebo.add(col);
  }
  const gzRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.58, 0.34, 6)), tileRoofMat);
  gzRoof.position.y = 0.66;
  miniGazebo.add(gzRoof);
  const gzFinial = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.06, 8, 6)), goldMat);
  gzFinial.position.y = 0.86;
  miniGazebo.add(gzFinial);
  honNonBoGroup.add(miniGazebo);

  // Miniature Ornament 3: Cầu Đá Tiểu Cảnh (arched stone bridge across lower south pool channel)
  const miniBridge = new THREE.Group();
  miniBridge.position.set(0.08, 0.3, 2.02);
  for (let s = -4; s <= 4; s++) {
    const t = s / 4;
    const archY = 0.12 + (1 - t * t) * 0.26;
    const plank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.08, 0.58)), nbStoneRimMat);
    plank.position.set(s * 0.22, archY, 0);
    plank.rotation.z = -t * 0.24;
    miniBridge.add(plank);
    if (Math.abs(s) % 2 === 0) {
      for (const rz of [-0.24, 0.24]) {
        const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.22, 0.05)), crimsonPillarMat);
        post.position.set(s * 0.22, archY + 0.14, rz);
        miniBridge.add(post);
      }
    }
  }
  honNonBoGroup.add(miniBridge);

  // Miniature Ornament 4: Cây Tùng Bonsai (S-curved trunk + 5 layered foliage pads on right shoulder)
  const bonsai = new THREE.Group();
  bonsai.position.set(1.96, 2.18, -0.36);
  const bonsaiCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.24, 0.36, 0.12),
    new THREE.Vector3(-0.18, 0.72, -0.06),
    new THREE.Vector3(0.14, 1.06, 0.06),
    new THREE.Vector3(-0.04, 1.32, 0.02),
  ]);
  const bonsaiTrunk = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(bonsaiCurve, 14, 0.065, 7, false)), barkMat);
  bonsai.add(bonsaiTrunk);
  const bonsaiPadMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b7641, roughness: 0.76 }));
  for (const bp of [
    { x: 0.34, y: 0.44, z: 0.14, r: 0.36 },
    { x: -0.28, y: 0.78, z: -0.08, r: 0.4 },
    { x: 0.22, y: 1.08, z: 0.08, r: 0.34 },
    { x: -0.1, y: 1.34, z: 0.02, r: 0.32 },
    { x: 0.08, y: 1.5, z: -0.02, r: 0.24 },
  ]) {
    const pad = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(bp.r, 10, 8)), bonsaiPadMat);
    pad.scale.set(1.38, 0.46, 1.22);
    pad.position.set(bp.x, bp.y, bp.z);
    bonsai.add(pad);
  }
  honNonBoGroup.add(bonsai);

  // Miniature Ornament 5: Đôi Hạc Tiên (pair of white cranes perched on west rock ledge)
  const craneWhiteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfaf7ef, roughness: 0.55 }));
  for (const cr of [
    { x: -2.42, y: 0.76, z: 0.42, rot: 0.4 },
    { x: -2.72, y: 0.72, z: 0.58, rot: 1.05 },
  ]) {
    const crane = new THREE.Group();
    crane.position.set(cr.x, cr.y, cr.z);
    crane.rotation.y = cr.rot;
    const cLeg = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 5)), darkWoodMat);
    cLeg.position.y = 0.09;
    crane.add(cLeg);
    const cBody = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.08, 8, 6)), craneWhiteMat);
    cBody.scale.set(1.35, 0.75, 0.72);
    cBody.position.y = 0.2;
    crane.add(cBody);
    const cNeck = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.018, 0.024, 0.18, 6)), craneWhiteMat);
    cNeck.position.set(0.07, 0.3, 0);
    cNeck.rotation.z = -0.35;
    crane.add(cNeck);
    const cHead = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.032, 6, 6)), craneWhiteMat);
    cHead.position.set(0.11, 0.39, 0);
    crane.add(cHead);
    honNonBoGroup.add(crane);
  }

  // Miniature Ornament 6: 2 Đèn Đá Lùn (two glowing miniature stone lanterns)
  for (const mlPos of [
    { x: 1.48, y: 0.78, z: 0.78 },
    { x: -2.88, y: 1.12, z: -0.16 },
  ]) {
    const miniLantern = new THREE.Group();
    miniLantern.position.set(mlPos.x, mlPos.y, mlPos.z);
    const mlBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 6)), nbStoneRimMat);
    mlBase.position.y = 0.09;
    miniLantern.add(mlBase);
    const mlFlame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.18, 0.16)), flameMat);
    mlFlame.position.y = 0.27;
    lanternFlames.push(mlFlame);
    miniLantern.add(mlFlame);
    const mlCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.28, 0.2, 6)), nbStoneRimMat);
    mlCap.position.y = 0.45;
    miniLantern.add(mlCap);
    honNonBoGroup.add(miniLantern);
  }

  // Miniature Ornament 7: Tượng Tiểu Tăng Ngồi Thiền
  const miniMonk = new THREE.Group();
  miniMonk.position.set(0.84, 0.84, 0.24);
  const monkRobeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd98a45, roughness: 0.7 }));
  const monkSkinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf0c6a2, roughness: 0.6 }));
  const monkBody = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.16, 0.28, 10)), monkRobeMat);
  monkBody.position.y = 0.14;
  miniMonk.add(monkBody);
  const monkHead = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.09, 10, 8)), monkSkinMat);
  monkHead.position.y = 0.34;
  miniMonk.add(monkHead);
  honNonBoGroup.add(miniMonk);

  // Miniature Ornament 8: Con Đò Nhỏ (wooden sampan boat floating in west cove)
  const miniBoat = new THREE.Group();
  miniBoat.position.set(-2.65, 0.315, 1.55);
  miniBoat.rotation.y = 0.38;
  const mbHull = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.14, 0.3)), darkWoodMat);
  miniBoat.add(mbHull);
  const mbCanopy = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.38, 8, 1, false, 0, Math.PI)),
    canopyStrawMat
  );
  mbCanopy.rotation.z = Math.PI / 2;
  mbCanopy.rotation.x = Math.PI / 2;
  mbCanopy.position.set(-0.04, 0.09, 0);
  miniBoat.add(mbCanopy);
  honNonBoGroup.add(miniBoat);

  // Miniature Lotus Pads + 4 Ao Sen-Identical Koi swimming clearly in open emerald water
  for (const ls of [
    { x: -3.28, z: 0.75, flower: true },
    { x: 3.12, z: 1.25, flower: true },
    { x: -1.78, z: 2.38, flower: true },
    { x: 2.15, z: 2.08, flower: false },
  ]) {
    const lotus = createLotusFlower3D(ls.x, 0.315, ls.z, ls.flower);
    lotus.scale.setScalar(0.72);
    honNonBoGroup.add(lotus);
  }

  const honNonBoKoi: AnimatedKoi3D[] = [];
  const nbKoiConfigs = [
    { ox: -1.62, oz: 1.52, rx: 1.02, rz: 0.46, speed: 0.62, tex: textures.koiKohakuTex, scale: 1.22 },
    { ox: 1.78, oz: 1.48, rx: 0.96, rz: 0.44, speed: -0.56, tex: textures.koiYamabukiTex, scale: 1.14 },
    { ox: 0.06, oz: 2.52, rx: 1.28, rz: 0.34, speed: 0.5, tex: textures.koiShowaTex, scale: 1.08 },
    { ox: 2.45, oz: -0.95, rx: 0.75, rz: 0.55, speed: 0.48, tex: textures.koiKohakuTex, scale: 1.02 },
  ];
  nbKoiConfigs.forEach((kc, idx) => {
    const { group, tail, pectoralL, pectoralR } = createKoiModel(kc.tex, kc.scale);
    group.position.set(kc.ox, 0.18, kc.oz);
    honNonBoGroup.add(group);
    honNonBoKoi.push({
      group,
      tail,
      pectoralL,
      pectoralR,
      originX: kc.ox,
      originZ: kc.oz,
      rx: kc.rx,
      rz: kc.rz,
      speed: kc.speed,
      phase: idx * 1.65,
      depthY: 0.18,
    });
  });

  root.add(honNonBoGroup);

  // 28. Bia Ngũ Giới (Carved Granite Stele with Full Accented Vietnamese Five Precepts)
  const createPreceptsSteleTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d')!;

    // Deep polished granite base
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#252b30');
    grad.addColorStop(0.5, '#1b2025');
    grad.addColorStop(1, '#14181c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle stone grain speckles
    for (let i = 0; i < 600; i++) {
      const gx = (i * 197) % canvas.width;
      const gy = (i * 313) % canvas.height;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(gx, gy, 3, 2);
    }

    // Double gold engraved border
    ctx.strokeStyle = '#d9b15f';
    ctx.lineWidth = 8;
    ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
    ctx.strokeStyle = 'rgba(217,177,95,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(52, 52, canvas.width - 104, canvas.height - 104);

    // Lotus emblem at top center
    ctx.save();
    ctx.translate(canvas.width / 2, 118);
    ctx.fillStyle = '#e5bd67';
    for (let p = -2; p <= 2; p++) {
      ctx.save();
      ctx.rotate(p * 0.28);
      ctx.beginPath();
      ctx.ellipse(0, -18, 11, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Title & subtitle
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5d27b';
    ctx.font = 'bold 62px "Noto Serif", Georgia, serif';
    ctx.fillText('BIA NGŨ GIỚI', canvas.width / 2, 206);

    ctx.fillStyle = '#d9ccb6';
    ctx.font = 'italic 30px "Noto Serif", Georgia, serif';
    ctx.fillText('Năm Giới Cấm Căn Bản Của Người Học Phật', canvas.width / 2, 254);

    // Gold divider
    ctx.strokeStyle = 'rgba(229,189,103,0.65)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(160, 282);
    ctx.lineTo(canvas.width - 160, 282);
    ctx.stroke();

    // Helper for wrapping Vietnamese text cleanly
    const wrapLines = (text: string, maxW: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    ctx.textAlign = 'left';
    let curY = 352;
    FIVE_PRECEPTS_LIST.forEach((item, idx) => {
      ctx.fillStyle = '#f7d27a';
      ctx.font = 'bold 34px "Noto Serif", Georgia, serif';
      ctx.fillText(`${idx + 1}. ${item.title}`, 92, curY);
      curY += 44;

      ctx.fillStyle = '#efe7d6';
      ctx.font = '27px "Be Vietnam Pro", "Noto Sans", sans-serif';
      const lines = wrapLines(item.meaning, canvas.width - 200);
      lines.forEach((ln) => {
        ctx.fillText(ln, 114, curY);
        curY += 37;
      });
      curY += 28;
    });

    // Footer maxim
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d9b15f';
    ctx.font = 'italic 28px "Noto Serif", Georgia, serif';
    ctx.fillText('Giữ giới thanh tịnh · Thân tâm thường an lạc', canvas.width / 2, 1204);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  const steleTex = createPreceptsSteleTexture();
  disposableTexs.push(steleTex);
  const stelePos3 = world2DTo3D(PRECEPTS_STELE_SPEC.x, PRECEPTS_STELE_SPEC.y);
  const preceptsSteleGroup = new THREE.Group();
  preceptsSteleGroup.position.set(stelePos3.x, 0, stelePos3.z);
  preceptsSteleGroup.rotation.y = 0.22;

  const steleGraniteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x262b30, roughness: 0.55, metalness: 0.1 }));
  const steleFaceMat = trackMat(new THREE.MeshStandardMaterial({ map: steleTex, roughness: 0.42, metalness: 0.08 }));

  // Two-tier carved sandstone stepped plinth
  const stBase1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.15, 0.18, 1.18)), stoneMat);
  stBase1.position.y = 0.09;
  stBase1.receiveShadow = true;
  preceptsSteleGroup.add(stBase1);

  const stBase2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.82, 0.16, 0.88)), nbStoneRimMat);
  stBase2.position.y = 0.26;
  stBase2.castShadow = !isSoftwareGl;
  preceptsSteleGroup.add(stBase2);

  const stLotusPedestal = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.64, 0.16, 0.46)), nbStoneRimMat);
  stLotusPedestal.position.y = 0.42;
  preceptsSteleGroup.add(stLotusPedestal);

  // Dark polished granite stele body + crisp engraved Vietnamese front face
  const stBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 2.18, 0.24)), steleGraniteMat);
  stBody.position.y = 1.58;
  stBody.castShadow = !isSoftwareGl;
  stBody.receiveShadow = true;
  preceptsSteleGroup.add(stBody);

  const stFrontFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.42, 2.04)), steleFaceMat);
  stFrontFace.position.set(0, 1.58, 0.125);
  preceptsSteleGroup.add(stFrontFace);

  // Flanking carved stone side columns with gold collar bands
  for (const sx of [-0.82, 0.82]) {
    const col = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 2.24, 0.28)), nbStoneRimMat);
    col.position.set(sx, 1.6, 0);
    col.castShadow = !isSoftwareGl;
    preceptsSteleGroup.add(col);
    const band = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.19, 0.08, 0.31)), goldMat);
    band.position.set(sx, 2.66, 0);
    preceptsSteleGroup.add(band);
  }

  // Curved terracotta roof cap + golden lotus finial
  const stRoof = createCurvedRoofGroup(2.12, 0.84, 0.34, tileRoofMat, goldMat, crimsonPillarMat, false);
  stRoof.position.y = 2.7;
  preceptsSteleGroup.add(stRoof);
  const stFinial = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.08, 0.24, 8)), goldMat);
  stFinial.position.y = 3.12;
  preceptsSteleGroup.add(stFinial);

  // Small front stone offering stand with bronze incense bowl & pink lotus vase
  const stStand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.34, 0.34)), stoneMat);
  stStand.position.set(0, 0.35, 0.48);
  preceptsSteleGroup.add(stStand);
  const stCenser = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.08, 0.11, 12)), goldMat);
  stCenser.position.set(0, 0.56, 0.48);
  preceptsSteleGroup.add(stCenser);
  const stEmber = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.04, 8, 6)), flameMat);
  stEmber.position.set(0, 0.62, 0.48);
  lanternFlames.push(stEmber);
  preceptsSteleGroup.add(stEmber);

  registerClickable(preceptsSteleGroup, clickables, {
    kind: 'precepts_stele',
    label: PRECEPTS_STELE_SPEC.label,
  });
  root.add(preceptsSteleGroup);

  // Unused fallback check anchor reference
  void MOUNTAIN_SPEC;

  return {
    root,
    clickables,
    koiSchool,
    bambooGroups,
    bodhiCanopy,
    bellBody,
    woodfishBody,
    broomGroup,
    smokeParticles,
    altarSmokeParticles,
    waterMesh,
    shoreSurfGroup,
    seaBoats,
    lanternFlames,
    ambientMotes,
    leapKoiGroup,
    pondLanternsGroup,
    koiPelletGroup,
    treeRibbonsGroup,
    flyingWishRibbon,
    memorialAuraGroup,
    bougainvilleaPetals,
    bougainvilleaBirds,
    birdSeedsGroup,
    honNonBoWaterfall,
    honNonBoKoi,
    pathLanternPivots,
    pathLanternGlowMats,
    updateCourtIncenseSticks3D,
    updateMemorialBanner3D,
    updateGardenPlots3D,
    updatePondLanterns3D,
    updateTreeWishes3D,
    updateKitchenMeal3D,
    dispose: () => {
      buddhaStatueRes.dispose();
      quanAmStatueRes.dispose();
      courtyardStatuesRes.dispose();
      disposeGroupChildren(pondLanternsGroup);
      disposeGroupChildren(treeRibbonsGroup);
      disposeGroupChildren(kitchenMealsContainer);
      plantContainers.forEach((c) => disposeGroupChildren(c));
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      disposableTexs.forEach((t) => t.dispose());
    },
  };
}

export interface RemotePlayerRig3D {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  labelSprite: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  lastLabelText: string;
  dispose: () => void;
}

function createCharacterFaceTexture(skinTone: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = skinTone;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft rosy cheeks on +Z front face center (u = 0.5 -> x = 128)
  ctx.fillStyle = 'rgba(232, 128, 118, 0.25)';
  ctx.beginPath();
  ctx.ellipse(98, 72, 12, 7, 0, 0, Math.PI * 2);
  ctx.ellipse(158, 72, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Gentle curved eyebrows
  ctx.strokeStyle = '#382820';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(106, 54, 11, Math.PI * 1.18, Math.PI * 1.82);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(150, 54, 11, Math.PI * 1.18, Math.PI * 1.82);
  ctx.stroke();

  // Expressive serene eyes with tiny catchlights
  ctx.fillStyle = '#241914';
  ctx.beginPath();
  ctx.ellipse(106, 62, 5.5, 6.2, 0, 0, Math.PI * 2);
  ctx.ellipse(150, 62, 5.5, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFF7EE';
  ctx.beginPath();
  ctx.arc(104.5, 60, 1.8, 0, Math.PI * 2);
  ctx.arc(148.5, 60, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Subtle nose bridge & peaceful warm smile
  ctx.strokeStyle = 'rgba(130, 82, 62, 0.45)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(128, 72, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.strokeStyle = '#8F4C42';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(128, 78, 10, 0.22 * Math.PI, 0.78 * Math.PI);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRemotePlayerRig3D(characterId: CharacterId, displayName: string): RemotePlayerRig3D {
  const char = CHARACTERS.find((c) => c.id === characterId) || CHARACTERS[0];
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const tg = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const tm = <T extends THREE.Material>(m: T) => {
    mats.push(m);
    return m;
  };

  const robePrimaryMat = tm(new THREE.MeshStandardMaterial({ color: char.robePrimary, roughness: 0.68 }));
  const robeSecondaryMat = tm(new THREE.MeshStandardMaterial({ color: char.robeSecondary, roughness: 0.74 }));
  const accentMat = tm(new THREE.MeshStandardMaterial({ color: char.accentColor, roughness: 0.5 }));
  const skinMat = tm(new THREE.MeshStandardMaterial({ color: char.skinTone, roughness: 0.6 }));
  const faceTex = createCharacterFaceTexture(char.skinTone);
  texs.push(faceTex);
  const faceMat = tm(new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.56 }));
  const hairMat = tm(new THREE.MeshStandardMaterial({ color: 0x221b18, roughness: 0.78 }));
  const sandalMat = tm(new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.85 }));

  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0;
  group.add(bodyPivot);

  // Flowing two-tier Buddhist robe skirt + fitted upper tunic
  const lowerSkirt = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.24, 0.36, 0.58, 16)), robeSecondaryMat);
  lowerSkirt.position.y = 0.41;
  lowerSkirt.castShadow = true;
  bodyPivot.add(lowerSkirt);

  const upperTorso = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.21, 0.25, 0.54, 16)), robePrimaryMat);
  upperTorso.position.y = 0.94;
  upperTorso.castShadow = true;
  bodyPivot.add(upperTorso);

  // Waist sash belt with hanging front ribbon
  const waistSash = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.245, 0.248, 0.09, 16)), accentMat);
  waistSash.position.y = 0.7;
  bodyPivot.add(waistSash);
  const sashTab = new THREE.Mesh(tg(new THREE.BoxGeometry(0.09, 0.34, 0.03)), accentMat);
  sashTab.position.set(0.06, 0.54, 0.25);
  sashTab.rotation.x = -0.14;
  bodyPivot.add(sashTab);

  // Crossed V-neck robe lapels & lotus neck ring
  for (const side of [-1, 1]) {
    const lapel = new THREE.Mesh(tg(new THREE.BoxGeometry(0.065, 0.34, 0.04)), accentMat);
    lapel.position.set(side * 0.045, 1.07, 0.195);
    lapel.rotation.z = side * 0.44;
    lapel.rotation.x = -0.12;
    bodyPivot.add(lapel);
  }
  const collarRing = new THREE.Mesh(tg(new THREE.TorusGeometry(0.16, 0.035, 8, 16)), accentMat);
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.y = 1.2;
  bodyPivot.add(collarRing);

  // Sculpted wide-sleeved left & right articulated arms
  const makeArmPivot = (side: -1 | 1) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.25, 1.12, 0);

    const shoulderCap = new THREE.Mesh(tg(new THREE.SphereGeometry(0.085, 10, 8)), robePrimaryMat);
    armPivot.add(shoulderCap);

    const sleeve = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.065, 0.11, 0.38, 10)), robePrimaryMat);
    sleeve.position.set(side * 0.03, -0.2, 0.02);
    sleeve.rotation.z = side * 0.12;
    sleeve.castShadow = true;
    armPivot.add(sleeve);

    const cuff = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.105, 0.11, 0.045, 10)), accentMat);
    cuff.position.set(side * 0.045, -0.38, 0.025);
    cuff.rotation.z = side * 0.12;
    armPivot.add(cuff);

    const hand = new THREE.Mesh(tg(new THREE.SphereGeometry(0.052, 8, 8)), skinMat);
    hand.position.set(side * 0.05, -0.44, 0.035);
    armPivot.add(hand);

    bodyPivot.add(armPivot);
    return armPivot;
  };
  const leftArmPivot = makeArmPivot(-1);
  const rightArmPivot = makeArmPivot(1);

  // Neck + Textured Head + Distinct Hair Styles
  const neck = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.068, 0.075, 0.1, 10)), skinMat);
  neck.position.y = 1.24;
  bodyPivot.add(neck);

  const headMesh = new THREE.Mesh(tg(new THREE.SphereGeometry(0.205, 18, 14)), faceMat);
  headMesh.position.y = 1.44;
  headMesh.rotation.y = -Math.PI / 2; // Align texture u=0.5 front face cleanly toward +Z
  headMesh.castShadow = true;
  bodyPivot.add(headMesh);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(tg(new THREE.SphereGeometry(0.042, 8, 8)), skinMat);
    ear.scale.set(0.55, 1.15, 0.7);
    ear.position.set(side * 0.2, 1.43, -0.01);
    bodyPivot.add(ear);
  }

  if (char.hairStyle !== 'shaved') {
    const hairCap = new THREE.Mesh(
      tg(new THREE.SphereGeometry(0.214, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      hairMat
    );
    hairCap.position.set(0, 1.45, -0.015);
    hairCap.rotation.x = -0.18;
    bodyPivot.add(hairCap);

    if (char.hairStyle === 'bun') {
      const bun = new THREE.Mesh(tg(new THREE.SphereGeometry(0.078, 10, 8)), hairMat);
      bun.position.set(0, 1.67, -0.05);
      bodyPivot.add(bun);
      const pin = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 6)), accentMat);
      pin.rotation.z = Math.PI / 2;
      pin.position.set(0, 1.67, -0.05);
      bodyPivot.add(pin);
    } else if (char.hairStyle === 'long') {
      const backHair = new THREE.Mesh(tg(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 12)), hairMat);
      backHair.scale.set(1.1, 1, 0.55);
      backHair.position.set(0, 1.24, -0.13);
      bodyPivot.add(backHair);
    }
  }

  // Sculpted Monastic Shoes / Sandals
  const makeFoot = (xOff: number) => {
    const fGroup = new THREE.Group();
    fGroup.position.set(xOff, 0.045, 0);
    const sole = new THREE.Mesh(tg(new THREE.BoxGeometry(0.11, 0.045, 0.22)), sandalMat);
    fGroup.add(sole);
    const upper = new THREE.Mesh(tg(new THREE.SphereGeometry(0.058, 10, 8)), sandalMat);
    upper.scale.set(0.95, 0.65, 1.45);
    upper.position.set(0, 0.028, 0.03);
    fGroup.add(upper);
    group.add(fGroup);
    return fGroup;
  };
  const leftFoot = makeFoot(-0.11);
  const rightFoot = makeFoot(0.11);

  // Crisp Billboard Nameplate
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const lctx = labelCanvas.getContext('2d')!;
  lctx.fillStyle = 'rgba(20, 16, 14, 0.84)';
  lctx.fillRect(14, 12, 228, 40);
  lctx.strokeStyle = 'rgba(245, 223, 176, 0.45)';
  lctx.lineWidth = 2;
  lctx.strokeRect(14, 12, 228, 40);
  lctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  lctx.fillStyle = '#F5EFE6';
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.fillText(displayName, 128, 32);

  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  texs.push(labelTex);
  const spriteMat = tm(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false }));
  const labelSprite = new THREE.Sprite(spriteMat);
  labelSprite.scale.set(1.6, 0.4, 1);
  labelSprite.position.y = 1.98;
  group.add(labelSprite);

  return {
    group,
    bodyPivot,
    leftArmPivot,
    rightArmPivot,
    leftFoot,
    rightFoot,
    labelSprite,
    labelCanvas,
    lastLabelText: displayName,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}

export function createFirstPersonRitualRig(): {
  group: THREE.Group;
  incenseStick: THREE.Group;
  broom: THREE.Group;
  fishBasin: THREE.Group;
  mallet: THREE.Group;
  fortuneTube: THREE.Group;
  bellRopeHand: THREE.Group;
  wateringCan: THREE.Group;
  handLantern: THREE.Group;
  koiCup: THREE.Group;
  handWishRibbon: THREE.Group;
  prayerHands: THREE.Group;
  washBrush: THREE.Group;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const tg = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const tm = <T extends THREE.Material>(m: T) => {
    mats.push(m);
    return m;
  };

  // 1. Incense Stick held before eyes
  const incenseStick = new THREE.Group();
  const stickMesh = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0xb86942, roughness: 0.7 }))
  );
  stickMesh.position.set(0.14, -0.18, -0.45);
  stickMesh.rotation.x = -0.35;
  incenseStick.add(stickMesh);
  const ember = new THREE.Mesh(
    tg(new THREE.SphereGeometry(0.015, 8, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0xff823a, emissive: 0xff6b24, emissiveIntensity: 2 }))
  );
  ember.position.set(0.14, -0.02, -0.51);
  incenseStick.add(ember);
  incenseStick.visible = false;
  group.add(incenseStick);

  // 2. Bamboo Broom held during sweeping
  const broom = new THREE.Group();
  const handle = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.018, 0.02, 0.75, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0x9c7343, roughness: 0.7 }))
  );
  handle.position.set(0.22, -0.25, -0.52);
  handle.rotation.set(0.55, 0, 0.25);
  broom.add(handle);
  const bristle = new THREE.Mesh(
    tg(new THREE.ConeGeometry(0.11, 0.24, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0xd9b66c, roughness: 0.9 }))
  );
  bristle.position.set(0.14, -0.48, -0.68);
  bristle.rotation.x = 0.55;
  broom.add(bristle);
  broom.visible = false;
  group.add(broom);

  // 3. Wooden Fish-Release Basin tilted forward
  const fishBasin = new THREE.Group();
  const tub = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.18, 0.14, 0.12, 14)),
    tm(new THREE.MeshStandardMaterial({ color: 0x8c523b, roughness: 0.6 }))
  );
  tub.position.set(0, -0.26, -0.52);
  tub.rotation.x = 0.35;
  fishBasin.add(tub);
  const water = new THREE.Mesh(
    tg(new THREE.CircleGeometry(0.16, 14)),
    tm(new THREE.MeshStandardMaterial({ color: 0x4ea2a8, roughness: 0.2 }))
  );
  water.position.set(0, -0.21, -0.5);
  water.rotation.x = -Math.PI / 2 + 0.35;
  fishBasin.add(water);
  fishBasin.visible = false;
  group.add(fishBasin);

  // 4. Woodfish Mallet
  const mallet = new THREE.Group();
  const mShaft = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.012, 0.014, 0.4, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0xc99e5a, roughness: 0.5 }))
  );
  mShaft.position.set(0.2, -0.22, -0.46);
  mShaft.rotation.x = -0.8;
  mallet.add(mShaft);
  const mHead = new THREE.Mesh(
    tg(new THREE.SphereGeometry(0.036, 10, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0xe8b86a, roughness: 0.4 }))
  );
  mHead.position.set(0.2, -0.09, -0.6);
  mallet.add(mHead);
  mallet.visible = false;
  group.add(mallet);

  // 5. Bamboo Fortune Tube
  const fortuneTube = new THREE.Group();
  const fCyl = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 12)),
    tm(new THREE.MeshStandardMaterial({ color: 0xc99e5a, roughness: 0.55 }))
  );
  fCyl.position.set(0.16, -0.22, -0.48);
  fortuneTube.add(fCyl);
  fortuneTube.visible = false;
  group.add(fortuneTube);

  // 6. Bell Striker Beam
  const bellRopeHand = new THREE.Group();
  const striker = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.032, 0.032, 0.55, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0x7c4b32, roughness: 0.6 }))
  );
  striker.rotation.x = Math.PI / 2;
  striker.position.set(0.18, -0.22, -0.52);
  bellRopeHand.add(striker);
  bellRopeHand.visible = false;
  group.add(bellRopeHand);

  // 7. Garden Watering Can
  const wateringCan = new THREE.Group();
  const canBody = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.08, 0.09, 0.16, 12)),
    tm(new THREE.MeshStandardMaterial({ color: 0x6a9c78, roughness: 0.45 }))
  );
  canBody.position.set(0.16, -0.22, -0.48);
  wateringCan.add(canBody);
  const spout = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.015, 0.025, 0.16, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0x6a9c78, roughness: 0.45 }))
  );
  spout.position.set(0.12, -0.18, -0.58);
  spout.rotation.x = -0.8;
  wateringCan.add(spout);
  wateringCan.visible = false;
  group.add(wateringCan);

  // 8. Held Lotus Wish Lantern
  const handLantern = new THREE.Group();
  const lanternCup = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.11, 0.07, 0.1, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0xf3b44c, emissive: 0xa66212, emissiveIntensity: 0.8 }))
  );
  lanternCup.position.set(0, -0.22, -0.48);
  handLantern.add(lanternCup);
  handLantern.visible = false;
  group.add(handLantern);

  // 9. Koi Feed Bowl
  const koiCup = new THREE.Group();
  const bowl = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.09, 0.06, 0.08, 12)),
    tm(new THREE.MeshStandardMaterial({ color: 0x9e5c3e, roughness: 0.5 }))
  );
  bowl.position.set(0.14, -0.23, -0.46);
  koiCup.add(bowl);
  koiCup.visible = false;
  group.add(koiCup);

  // 10. Held Red Wish Ribbon for Cây Nguyện Ước
  const handWishRibbon = new THREE.Group();
  const hRibbon = new THREE.Mesh(
    tg(new THREE.PlaneGeometry(0.06, 0.34)),
    tm(
      new THREE.MeshStandardMaterial({
        color: 0xe03e36,
        emissive: 0x450d0a,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide,
      })
    )
  );
  hRibbon.position.set(0.12, -0.18, -0.46);
  hRibbon.rotation.z = -0.25;
  handWishRibbon.add(hRibbon);
  const hCharm = new THREE.Mesh(
    tg(new THREE.SphereGeometry(0.025, 8, 8)),
    tm(new THREE.MeshStandardMaterial({ color: 0xf4c65c, roughness: 0.35 }))
  );
  hCharm.position.set(0.09, -0.03, -0.46);
  handWishRibbon.add(hCharm);
  handWishRibbon.visible = false;
  group.add(handWishRibbon);

  // 11. Joined Prayer Hands (Chắp tay lạy Phật)
  const prayerHands = new THREE.Group();
  const handMat = tm(new THREE.MeshStandardMaterial({ color: 0xe6bf9e, roughness: 0.65 }));
  for (const side of [-1, 1]) {
    const palm = new THREE.Mesh(tg(new THREE.BoxGeometry(0.032, 0.14, 0.09)), handMat);
    palm.position.set(side * 0.018, -0.22, -0.44);
    palm.rotation.x = -0.35;
    palm.rotation.z = -side * 0.06;
    prayerHands.add(palm);
  }
  prayerHands.visible = false;
  group.add(prayerHands);

  // 12. Dish Washing Bowl & Sponge at Kitchen Sink
  const washBrush = new THREE.Group();
  const washPlate = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.13, 0.09, 0.055, 14)),
    tm(new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.3 }))
  );
  washPlate.position.set(-0.02, -0.24, -0.46);
  washPlate.rotation.x = 0.25;
  washBrush.add(washPlate);
  const sponge = new THREE.Mesh(
    tg(new THREE.BoxGeometry(0.08, 0.035, 0.06)),
    tm(new THREE.MeshStandardMaterial({ color: 0xe8c967, roughness: 0.85 }))
  );
  sponge.position.set(0.05, -0.2, -0.45);
  washBrush.add(sponge);
  washBrush.visible = false;
  group.add(washBrush);

  return {
    group,
    incenseStick,
    broom,
    fishBasin,
    mallet,
    fortuneTube,
    bellRopeHand,
    wateringCan,
    handLantern,
    koiCup,
    handWishRibbon,
    prayerHands,
    washBrush,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

export function getEyeHeightForPose(x2d: number, y2d: number, isMeditating: boolean): number {
  const groundY = getGroundElevation3D(x2d, y2d);
  return groundY + (isMeditating ? 0.96 : 1.56);
}
