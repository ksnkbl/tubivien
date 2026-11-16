import * as THREE from 'three';
import buddhaAltarPortraitUrl from '../../assets/images/buddha_statue_majestic_1794566773955.jpg';
import quanAmAltarPortraitUrl from '../../assets/images/quan_am_statue_majestic_1794566774640.jpg';
import laHanTichTruongUrl from '../../assets/images/la_han_tich_truong_cutout.png';
import laHanThienDinhUrl from '../../assets/images/la_han_thien_dinh_cutout.png';
import laHanMinhChauUrl from '../../assets/images/la_han_minh_chau_cutout.png';
import thanHoPhapTraiUrl from '../../assets/images/than_ho_phap_trai_cutout.png';
import thanHoPhapPhaiUrl from '../../assets/images/than_ho_phap_phai_cutout.png';
import {
  COURTYARD_ARHAT_SPECS,
  SANCTUARY_GUARDIAN_SPECS,
  world2DTo3D,
  type CourtyardArhatArtVariant,
  type SanctuaryGuardianArtVariant,
} from '../../shared/templeNavigation.ts';

export interface SculptedStatueResult {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Creates the exact arched shrine silhouette used in the 2D Chánh Điện sanctuary.
 * Width = w, total height = h, vertical sides rise to archStartRatio * h then curve to apex.
 */
function createArchedNicheShape(w: number, h: number, archStartRatio = 0.68): THREE.Shape {
  const hw = w / 2;
  const archY = h * archStartRatio;
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(-hw, archY);
  s.quadraticCurveTo(0, 2 * h - archY, hw, archY);
  s.lineTo(hw, 0);
  s.closePath();
  return s;
}

/**
 * Outer frame path with inner arched cutout so the golden shrine molding wraps cleanly.
 */
function createArchedFrameShape(
  innerW: number,
  innerH: number,
  border: number,
  archStartRatio = 0.68
): THREE.Shape {
  const outerW = innerW + border * 2;
  const outerH = innerH + border * 1.35;
  const ohw = outerW / 2;
  const oArchY = outerH * archStartRatio;

  const outer = new THREE.Shape();
  outer.moveTo(-ohw, -border * 0.45);
  outer.lineTo(-ohw, oArchY);
  outer.quadraticCurveTo(0, 2 * outerH - oArchY, ohw, oArchY);
  outer.lineTo(ohw, -border * 0.45);
  outer.closePath();

  const ihw = innerW / 2;
  const iArchY = innerH * archStartRatio;
  const hole = new THREE.Path();
  hole.moveTo(-ihw, 0);
  hole.lineTo(ihw, 0);
  hole.lineTo(ihw, iArchY);
  hole.quadraticCurveTo(0, 2 * innerH - iArchY, -ihw, iArchY);
  hole.closePath();

  outer.holes.push(hole);
  return outer;
}

/**
 * Normalizes ShapeGeometry UVs from raw shape space [-w/2..w/2, 0..h] into [0..1, 0..1]
 * so the 2D portrait texture fills the arched niche seamlessly without stretching.
 */
function normalizeArchedPanelUVs(geo: THREE.BufferGeometry, w: number, h: number) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv.setXY(i, (x + w / 2) / w, y / h);
  }
  uv.needsUpdate = true;
}

export function createSculptedAltarStatue(
  altarKind: 'buddha' | 'quanAm',
  isSoftwareGl: boolean,
  maxAnisotropy = 4
): SculptedStatueResult {
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
  const tt = <T extends THREE.Texture>(t: T) => {
    texs.push(t);
    return t;
  };

  // 1. Carved Ironwood & Gold Shrine Dais matching 2D sanctuary (#5B3A29 & #E8B86A)
  const daisMat = tm(
    new THREE.MeshStandardMaterial({ color: 0x523424, roughness: 0.68, metalness: 0.08, fog: false })
  );
  const backingDarkMat = tm(
    new THREE.MeshStandardMaterial({ color: 0x2b1f18, roughness: 0.78, metalness: 0.05, fog: false })
  );
  const goldTrimMat = tm(
    new THREE.MeshStandardMaterial({ color: 0xe8b86a, roughness: 0.24, metalness: 0.88, fog: false })
  );
  const crimsonLacquerMat = tm(
    new THREE.MeshStandardMaterial({ color: 0x964739, roughness: 0.42, metalness: 0.14, fog: false })
  );

  const daisBase = new THREE.Mesh(tg(new THREE.BoxGeometry(3.85, 0.44, 1.55)), daisMat);
  daisBase.position.y = 0.22;
  daisBase.castShadow = !isSoftwareGl;
  daisBase.receiveShadow = true;
  group.add(daisBase);

  const daisMid = new THREE.Mesh(tg(new THREE.BoxGeometry(3.35, 0.52, 1.25)), daisMat);
  daisMid.position.y = 0.7;
  daisMid.castShadow = !isSoftwareGl;
  daisMid.receiveShadow = true;
  group.add(daisMid);

  const daisGoldBorder = new THREE.Mesh(tg(new THREE.BoxGeometry(3.46, 0.11, 1.32)), goldTrimMat);
  daisGoldBorder.position.y = 1.01;
  group.add(daisGoldBorder);

  const lotusStep = new THREE.Mesh(tg(new THREE.BoxGeometry(2.96, 0.14, 0.96)), daisMat);
  lotusStep.position.set(0, 1.13, 0.04);
  group.add(lotusStep);

  const lotusStepGold = new THREE.Mesh(tg(new THREE.BoxGeometry(3.02, 0.045, 1.0)), goldTrimMat);
  lotusStepGold.position.set(0, 1.2, 0.04);
  group.add(lotusStepGold);

  // 2. Arched Sanctuary Frame & Portrait Panel (exact 6:7 crop ratio of 2D Chánh Điện)
  const panelW = 2.64;
  const panelH = 3.08;
  const panelBaseY = 1.22;

  // Solid arched wooden shrine body behind the portrait
  const backingGeo = tg(
    new THREE.ExtrudeGeometry(createArchedNicheShape(panelW + 0.16, panelH + 0.08, 0.68), {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 2,
    })
  );
  const backingMesh = new THREE.Mesh(backingGeo, backingDarkMat);
  backingMesh.position.set(0, panelBaseY - 0.02, -0.14);
  backingMesh.castShadow = !isSoftwareGl;
  backingMesh.receiveShadow = true;
  group.add(backingMesh);

  // Carved golden arched border molding matching 2D frame stroke (#E8B86A)
  const frameGeo = tg(
    new THREE.ExtrudeGeometry(createArchedFrameShape(panelW, panelH, 0.13, 0.68), {
      depth: 0.26,
      bevelEnabled: true,
      bevelThickness: 0.024,
      bevelSize: 0.02,
      bevelSegments: 2,
    })
  );
  const frameMesh = new THREE.Mesh(frameGeo, goldTrimMat);
  frameMesh.position.set(0, panelBaseY, -0.11);
  frameMesh.castShadow = !isSoftwareGl;
  group.add(frameMesh);

  // Flanking lacquered side pilasters with golden rings
  for (const side of [-1, 1]) {
    const pilaster = new THREE.Mesh(
      tg(new THREE.CylinderGeometry(0.085, 0.095, 2.32, 12)),
      crimsonLacquerMat
    );
    pilaster.position.set(side * (panelW / 2 + 0.19), panelBaseY + 1.14, 0.06);
    group.add(pilaster);

    const cap = new THREE.Mesh(tg(new THREE.SphereGeometry(0.105, 10, 8)), goldTrimMat);
    cap.position.set(side * (panelW / 2 + 0.19), panelBaseY + 2.34, 0.06);
    group.add(cap);
  }

  // Ornamental golden lotus crest at arch apex
  const apexCrest = new THREE.Mesh(tg(new THREE.OctahedronGeometry(0.14, 1)), goldTrimMat);
  apexCrest.scale.set(1.1, 1.35, 0.6);
  apexCrest.position.set(0, panelBaseY + panelH + 0.28, 0.04);
  group.add(apexCrest);

  // Load the exact 2D statue artwork with identical UV crop and crisp un-fogged rendering
  const imgUrl = altarKind === 'quanAm' ? quanAmAltarPortraitUrl : buddhaAltarPortraitUrl;
  const portraitTex = tt(new THREE.TextureLoader().load(imgUrl));
  portraitTex.colorSpace = THREE.SRGBColorSpace;
  portraitTex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  portraitTex.wrapS = THREE.ClampToEdgeWrapping;
  portraitTex.wrapT = THREE.ClampToEdgeWrapping;
  portraitTex.offset.set(0.14, 0.1);
  portraitTex.repeat.set(0.72, 0.84);

  const portraitGeo = tg(new THREE.ShapeGeometry(createArchedNicheShape(panelW, panelH, 0.68), 32));
  normalizeArchedPanelUVs(portraitGeo, panelW, panelH);

  // Use unlit MeshBasicMaterial with fog: false & toneMapped: false so scene fog never veils the statue
  const portraitMat = tm(
    new THREE.MeshBasicMaterial({
      map: portraitTex,
      fog: false,
      toneMapped: false,
      color: 0xffffff,
    })
  );

  const portraitMesh = new THREE.Mesh(portraitGeo, portraitMat);
  portraitMesh.position.set(0, panelBaseY, 0.13);
  group.add(portraitMesh);

  // Soft warm sanctuary halo glow behind the arched shrine
  const haloRing = new THREE.Mesh(
    tg(new THREE.TorusGeometry(1.75, 0.04, 10, 48)),
    tm(
      new THREE.MeshStandardMaterial({
        color: 0xffdf8e,
        emissive: 0xeda035,
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.75,
        fog: false,
      })
    )
  );
  haloRing.position.set(0, panelBaseY + panelH * 0.56, -0.18);
  group.add(haloRing);

  const altarGlowLight = new THREE.PointLight(0xffe2aa, 1.25, 11, 1.4);
  altarGlowLight.position.set(0, 3.25, 1.85);
  group.add(altarGlowLight);

  return {
    group,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}

const COURTYARD_STATUE_SPECS: Record<
  CourtyardArhatArtVariant | SanctuaryGuardianArtVariant,
  { url: string; aspect: number }
> = {
  'tich-truong': { url: laHanTichTruongUrl, aspect: 373 / 1092 },
  'thien-dinh': { url: laHanThienDinhUrl, aspect: 396 / 1095 },
  'minh-chau': { url: laHanMinhChauUrl, aspect: 403 / 1084 },
  'guardian-left': { url: thanHoPhapTraiUrl, aspect: 482 / 1069 },
  'guardian-right': { url: thanHoPhapPhaiUrl, aspect: 420 / 1101 },
};

/**
 * Builds all 12 La Hán courtyard statues and 2 Chánh Điện Door Guardians in 3D using the exact
 * same frameless transparent PNG cutouts shown in 2D, un-fogged and free of any background/frame.
 */
export function createCourtyardStatues3D(
  _isSoftwareGl: boolean,
  maxAnisotropy = 4
): SculptedStatueResult {
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

  const shadowMat = tm(
    new THREE.MeshBasicMaterial({
      color: 0x16120e,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      fog: false,
    })
  );

  // Load 5 shared transparent cutout textures cleanly
  const loader = new THREE.TextureLoader();
  const variantMats: Partial<
    Record<CourtyardArhatArtVariant | SanctuaryGuardianArtVariant, THREE.MeshBasicMaterial>
  > = {};
  const variantMirroredMats: Partial<
    Record<CourtyardArhatArtVariant | SanctuaryGuardianArtVariant, THREE.MeshBasicMaterial>
  > = {};

  (
    Object.keys(COURTYARD_STATUE_SPECS) as Array<
      CourtyardArhatArtVariant | SanctuaryGuardianArtVariant
    >
  ).forEach((key) => {
    const tex = loader.load(COURTYARD_STATUE_SPECS[key].url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    texs.push(tex);

    variantMats[key] = tm(
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: false,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
        color: 0xffffff,
      })
    );

    const mTex = tex.clone();
    mTex.needsUpdate = true;
    mTex.wrapS = THREE.RepeatWrapping;
    mTex.wrapT = THREE.ClampToEdgeWrapping;
    mTex.offset.set(1, 0);
    mTex.repeat.set(-1, 1);
    texs.push(mTex);

    variantMirroredMats[key] = tm(
      new THREE.MeshBasicMaterial({
        map: mTex,
        transparent: false,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
        color: 0xffffff,
      })
    );
  });

  // Shared plane geometries sized precisely to each statue cutout's natural aspect ratio
  const arhatHeight = 2.18;
  const arhatGeos: Record<CourtyardArhatArtVariant, THREE.PlaneGeometry> = {
    'tich-truong': tg(new THREE.PlaneGeometry(arhatHeight * COURTYARD_STATUE_SPECS['tich-truong'].aspect, arhatHeight)),
    'thien-dinh': tg(new THREE.PlaneGeometry(arhatHeight * COURTYARD_STATUE_SPECS['thien-dinh'].aspect, arhatHeight)),
    'minh-chau': tg(new THREE.PlaneGeometry(arhatHeight * COURTYARD_STATUE_SPECS['minh-chau'].aspect, arhatHeight)),
  };
  const arhatShadowGeo = tg(new THREE.CircleGeometry(0.42, 16));

  for (const arhat of COURTYARD_ARHAT_SPECS) {
    const p3 = world2DTo3D(arhat.x, arhat.y);
    const ag = new THREE.Group();
    ag.position.set(p3.x, 0.04, p3.z);
    // Angle slightly inward & south toward approaching visitors along Sân Lư Hương
    ag.rotation.y = arhat.facing === 'right' ? Math.PI * 0.26 : -Math.PI * 0.26;

    const shadow = new THREE.Mesh(arhatShadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    ag.add(shadow);

    const mat =
      arhat.facing === 'left'
        ? variantMirroredMats[arhat.artVariant]!
        : variantMats[arhat.artVariant]!;

    const statueMesh = new THREE.Mesh(arhatGeos[arhat.artVariant], mat);
    statueMesh.position.y = arhatHeight / 2;
    ag.add(statueMesh);

    group.add(ag);
  }

  // 2 Chánh Điện Door Guardians (Thần Giữ Cửa) flanking the entrance steps
  const guardHeight = 2.7;
  const guardGeos: Record<SanctuaryGuardianArtVariant, THREE.PlaneGeometry> = {
    'guardian-left': tg(
      new THREE.PlaneGeometry(guardHeight * COURTYARD_STATUE_SPECS['guardian-left'].aspect, guardHeight)
    ),
    'guardian-right': tg(
      new THREE.PlaneGeometry(guardHeight * COURTYARD_STATUE_SPECS['guardian-right'].aspect, guardHeight)
    ),
  };
  const guardShadowGeo = tg(new THREE.CircleGeometry(0.56, 18));

  for (const guardian of SANCTUARY_GUARDIAN_SPECS) {
    const p3 = world2DTo3D(guardian.x, guardian.y);
    const gg = new THREE.Group();
    gg.position.set(p3.x, 0.04, p3.z);
    gg.rotation.y = guardian.side === 'left' ? 0.18 : -0.18;

    const shadow = new THREE.Mesh(guardShadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    gg.add(shadow);

    const statueMesh = new THREE.Mesh(
      guardGeos[guardian.artVariant],
      variantMats[guardian.artVariant]!
    );
    statueMesh.position.y = guardHeight / 2;
    gg.add(statueMesh);

    group.add(gg);
  }

  return {
    group,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}
