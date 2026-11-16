import * as THREE from 'three';
import type { TempleAtmosphereSnapshot } from '../../shared/templeAtmosphere.ts';
import { getRoofSurfaceHeight3D, world3DTo2D } from '../../shared/templeNavigation.ts';

export interface Atmosphere3DHandle {
  group: THREE.Group;
  update: (
    atm: TempleAtmosphereSnapshot,
    camX: number,
    camZ: number,
    sec: number,
    dt: number,
    lowResource: boolean
  ) => void;
  dispose: () => void;
}

export function createAtmosphere3D(isSoftwareGl: boolean): Atmosphere3DHandle {
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

  // 1. Night Starfield Dome
  const starCount = isSoftwareGl ? 120 : 240;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = ((i * 137.508) % 360) * (Math.PI / 180);
    const phi = 0.14 + (((i * 29.3) % 100) / 100) * (Math.PI * 0.36); // upper sky hemisphere
    const r = 74;
    starPositions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    starPositions[i * 3 + 1] = Math.sin(phi) * r + 2;
    starPositions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
  }
  const starGeo = tg(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = tm(
    new THREE.PointsMaterial({
      color: 0xf4f7ff,
      size: 0.55,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    })
  );
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  // 2. Sun & Moon Celestial Orbs
  const sunMat = tm(
    new THREE.MeshBasicMaterial({
      color: 0xffe4a0,
      transparent: true,
      opacity: 0.92,
      fog: false,
      toneMapped: false,
    })
  );
  const sunOrb = new THREE.Mesh(tg(new THREE.SphereGeometry(2.6, 16, 14)), sunMat);
  group.add(sunOrb);

  const moonMat = tm(
    new THREE.MeshBasicMaterial({
      color: 0xeaf1ff,
      transparent: true,
      opacity: 0,
      fog: false,
      toneMapped: false,
    })
  );
  const moonOrb = new THREE.Mesh(tg(new THREE.SphereGeometry(2.1, 16, 14)), moonMat);
  group.add(moonOrb);

  // 3. 3D Temple Rain Volume (wraps smoothly in local space around camera)
  const rainCount = isSoftwareGl ? 160 : 340;
  const rainBoxW = 24;
  const rainBoxH = 12;
  const rainPos = new Float32Array(rainCount * 6);
  const rainSeeds = new Float32Array(rainCount * 4); // x, y, z, speed
  for (let i = 0; i < rainCount; i++) {
    const sx = (((i * 73.13) % 1000) / 1000 - 0.5) * rainBoxW;
    const sy = (((i * 191.7) % 1000) / 1000) * rainBoxH;
    const sz = (((i * 317.9) % 1000) / 1000 - 0.5) * rainBoxW;
    const spd = 11.5 + (i % 5) * 1.4;
    rainSeeds[i * 4] = sx;
    rainSeeds[i * 4 + 1] = sy;
    rainSeeds[i * 4 + 2] = sz;
    rainSeeds[i * 4 + 3] = spd;
  }
  const rainGeo = tg(new THREE.BufferGeometry());
  const rainAttr = new THREE.BufferAttribute(rainPos, 3);
  rainGeo.setAttribute('position', rainAttr);
  const rainMat = tm(
    new THREE.LineBasicMaterial({
      color: 0xcbe3f5,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    })
  );
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  group.add(rainLines);

  // 4. Night Fireflies (Đom đóm)
  const fireflyCount = isSoftwareGl ? 24 : 52;
  const fireflyPos = new Float32Array(fireflyCount * 3);
  const fireflyGeo = tg(new THREE.BufferGeometry());
  const fireflyAttr = new THREE.BufferAttribute(fireflyPos, 3);
  fireflyGeo.setAttribute('position', fireflyAttr);
  const fireflyMat = tm(
    new THREE.PointsMaterial({
      color: 0xe6ff96,
      size: 0.16,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  // 5. Wind-borne Lotus & Bodhi Petals
  const petalCount = isSoftwareGl ? 24 : 50;
  const petalPos = new Float32Array(petalCount * 3);
  const petalGeo = tg(new THREE.BufferGeometry());
  const petalAttr = new THREE.BufferAttribute(petalPos, 3);
  petalGeo.setAttribute('position', petalAttr);
  const petalMat = tm(
    new THREE.PointsMaterial({
      color: 0xf5b3c4,
      size: 0.15,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    })
  );
  const petals = new THREE.Points(petalGeo, petalMat);
  petals.frustumCulled = false;
  group.add(petals);

  let rainTime = 0;

  return {
    group,
    update: (atm, camX, camZ, sec, dt, lowResource) => {
      // Keep sky dome & weather volume centered around player XZ
      group.position.set(camX, 0, camZ);

      // Stars
      const starOpacity = Math.max(0, atm.nightFactor * 0.92 * (1 - atm.rainIntensity * 0.78));
      stars.visible = starOpacity > 0.03;
      if (stars.visible) {
        starMat.opacity = starOpacity;
        stars.rotation.y = sec * 0.004;
      }

      // Sun & Moon positions along sky dome
      const [sx, sy, sz] = atm.sunPosition;
      const sunLen = Math.hypot(sx, sy, sz) || 1;
      const ux = (sx / sunLen) * 68;
      const uy = (sy / sunLen) * 68;
      const uz = (sz / sunLen) * 68;

      const sunVisOpacity = Math.max(0, 1 - atm.nightFactor * 1.45) * (1 - atm.rainIntensity * 0.85);
      sunOrb.visible = sunVisOpacity > 0.04;
      if (sunOrb.visible) {
        sunOrb.position.set(ux, uy, uz);
        sunMat.color.setHex(atm.dawnDuskFactor > 0.45 ? 0xffae5c : 0xfff0be);
        sunMat.opacity = sunVisOpacity * 0.92;
      }

      const moonVisOpacity = Math.max(0, (atm.nightFactor - 0.25) / 0.75) * (1 - atm.rainIntensity * 0.85);
      moonOrb.visible = moonVisOpacity > 0.04;
      if (moonOrb.visible) {
        moonOrb.position.set(-ux * 0.85, Math.max(22, uy * 0.95), uz);
        moonMat.opacity = moonVisOpacity * 0.9;
      }

      // 3D Rain streaks
      rainLines.visible = atm.rainIntensity > 0.02;
      if (rainLines.visible) {
        rainTime += dt;
        rainMat.opacity = 0.42 * atm.rainIntensity;
        const activeCount = lowResource ? Math.floor(rainCount * 0.45) : rainCount;
        const slantX = -0.09;
        const dropLen = 0.58;
        for (let i = 0; i < rainCount; i++) {
          const idx = i * 6;
          if (i >= activeCount) {
            rainPos[idx] = rainPos[idx + 1] = rainPos[idx + 2] = 0;
            rainPos[idx + 3] = rainPos[idx + 4] = rainPos[idx + 5] = 0;
            continue;
          }
          const bx = rainSeeds[i * 4];
          const by = rainSeeds[i * 4 + 1];
          const bz = rainSeeds[i * 4 + 2];
          const spd = rainSeeds[i * 4 + 3];
          const y = ((by - rainTime * spd) % rainBoxH + rainBoxH) % rainBoxH;
          const x = ((bx - rainTime * 1.1) % rainBoxW + rainBoxW * 1.5) % rainBoxW - rainBoxW * 0.5;
          const drop2D = world3DTo2D(camX + x, camZ + bz);
          const roofH = getRoofSurfaceHeight3D(drop2D.x, drop2D.y);
          if (roofH > 0 && y < roofH + 0.2) {
            rainPos[idx] = rainPos[idx + 1] = rainPos[idx + 2] = 0;
            rainPos[idx + 3] = rainPos[idx + 4] = rainPos[idx + 5] = 0;
            continue;
          }
          rainPos[idx] = x;
          rainPos[idx + 1] = y;
          rainPos[idx + 2] = bz;
          rainPos[idx + 3] = x + slantX;
          rainPos[idx + 4] = y + dropLen;
          rainPos[idx + 5] = bz;
        }
        rainAttr.needsUpdate = true;
      }

      // 3D Fireflies
      fireflies.visible = atm.fireflyIntensity > 0.04;
      if (fireflies.visible) {
        fireflyMat.opacity = atm.fireflyIntensity * (0.65 + 0.35 * Math.sin(sec * 3.1));
        const activeCount = lowResource ? Math.floor(fireflyCount * 0.45) : fireflyCount;
        for (let i = 0; i < fireflyCount; i++) {
          const idx = i * 3;
          if (i >= activeCount) {
            fireflyPos[idx] = 0;
            fireflyPos[idx + 1] = -20;
            fireflyPos[idx + 2] = 0;
            continue;
          }
          const rx = (((i * 97.1) % 1000) / 1000 - 0.5) * 20;
          const rz = (((i * 211.3) % 1000) / 1000 - 0.5) * 20;
          fireflyPos[idx] = rx + Math.sin(sec * 0.7 + i) * 1.1;
          fireflyPos[idx + 1] = 0.65 + ((i * 0.37) % 2.4) + Math.sin(sec * 1.4 + i * 1.3) * 0.38;
          fireflyPos[idx + 2] = rz + Math.cos(sec * 0.65 + i * 0.8) * 1.1;
        }
        fireflyAttr.needsUpdate = true;
      }

      // 3D Breeze Petals
      petals.visible = atm.breezeIntensity > 0.04;
      if (petals.visible) {
        petalMat.opacity = 0.75 * atm.breezeIntensity;
        const activeCount = lowResource ? Math.floor(petalCount * 0.45) : petalCount;
        for (let i = 0; i < petalCount; i++) {
          const idx = i * 3;
          if (i >= activeCount) {
            petalPos[idx] = 0;
            petalPos[idx + 1] = -20;
            petalPos[idx + 2] = 0;
            continue;
          }
          const bx = (((i * 151.7) % 1000) / 1000 - 0.5) * 22;
          const by = (((i * 89.3) % 1000) / 1000) * 8.5;
          const bz = (((i * 263.9) % 1000) / 1000 - 0.5) * 22;
          petalPos[idx] = ((bx + sec * 1.6 + Math.sin(sec + i) * 0.6) % 22 + 33) % 22 - 11;
          petalPos[idx + 1] = ((by - sec * 0.85) % 8.5 + 8.5) % 8.5 + 0.2;
          petalPos[idx + 2] = ((bz + sec * 0.9 + Math.cos(sec * 0.8 + i) * 0.5) % 22 + 33) % 22 - 11;
        }
        petalAttr.needsUpdate = true;
      }
    },
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
