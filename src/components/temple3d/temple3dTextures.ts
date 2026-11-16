import * as THREE from 'three';

export interface TempleTextureBundle {
  grassTex: THREE.CanvasTexture;
  courtyardTileTex: THREE.CanvasTexture;
  sandRakeTex: THREE.CanvasTexture;
  barkTex: THREE.CanvasTexture;
  bambooTex: THREE.CanvasTexture;
  woodPlankTex: THREE.CanvasTexture;
  terracottaTex: THREE.CanvasTexture;
  stoneTex: THREE.CanvasTexture;
  koiKohakuTex: THREE.CanvasTexture;
  koiYamabukiTex: THREE.CanvasTexture;
  koiShowaTex: THREE.CanvasTexture;
  moteGlowTex: THREE.CanvasTexture;
  dispose: () => void;
}

function configureTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
  srgb = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

export function createTempleTextures(maxAnisotropy: number): TempleTextureBundle {
  // 1. Sunlit Mossy Meadow Grass
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 256;
  grassCanvas.height = 256;
  const gctx = grassCanvas.getContext('2d')!;
  gctx.fillStyle = '#5B7446';
  gctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    gctx.fillStyle = i % 3 === 0 ? 'rgba(130, 165, 86, 0.25)' : i % 3 === 1 ? 'rgba(66, 92, 48, 0.26)' : 'rgba(155, 182, 102, 0.16)';
    gctx.fillRect(x, y, 2 + (i % 3), 5 + (i % 4));
  }
  const grassTex = configureTexture(grassCanvas, 26, 20, maxAnisotropy);

  // 2. Sandstone / Granite Courtyard Pavers
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = 256;
  tileCanvas.height = 256;
  const tctx = tileCanvas.getContext('2d')!;
  tctx.fillStyle = '#8C7E6E';
  tctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const shade = ((row * 3 + col * 5) % 4) * 5;
      tctx.fillStyle = `rgb(${142 + shade}, ${128 + shade}, ${113 + shade})`;
      tctx.fillRect(col * 64 + 2, row * 64 + 2, 60, 60);
      tctx.fillStyle = 'rgba(255,255,255,0.06)';
      tctx.fillRect(col * 64 + 2, row * 64 + 2, 60, 3);
    }
  }
  for (let i = 0; i < 650; i++) {
    tctx.fillStyle = i % 2 === 0 ? 'rgba(55,45,35,0.08)' : 'rgba(255,245,230,0.07)';
    tctx.fillRect((i * 59) % 256, (i * 97) % 256, 2, 2);
  }
  const courtyardTileTex = configureTexture(tileCanvas, 10, 8, maxAnisotropy);

  // 3. Raked White Zen Sand
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = 256;
  sandCanvas.height = 256;
  const sctx = sandCanvas.getContext('2d')!;
  sctx.fillStyle = '#E6DEC9';
  sctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    const grad = sctx.createLinearGradient(0, y, 0, y + 16);
    grad.addColorStop(0, '#D4C9B2');
    grad.addColorStop(0.5, '#F0E9D8');
    grad.addColorStop(1, '#CFC4AC');
    sctx.fillStyle = grad;
    sctx.fillRect(0, y, 256, 16);
  }
  for (let i = 0; i < 900; i++) {
    sctx.fillStyle = i % 2 === 0 ? 'rgba(130,118,98,0.12)' : 'rgba(255,255,255,0.22)';
    sctx.fillRect((i * 41) % 256, (i * 83) % 256, 1.5, 1.5);
  }
  const sandRakeTex = configureTexture(sandCanvas, 5, 5, maxAnisotropy);

  // 4. Furrowed Bodhi Bark Texture
  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = 256;
  barkCanvas.height = 256;
  const bctx = barkCanvas.getContext('2d')!;
  bctx.fillStyle = '#6B4C38';
  bctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) {
    const x = (i * 23) % 256;
    const y = (i * 47) % 256;
    bctx.fillStyle = i % 2 === 0 ? 'rgba(42, 27, 19, 0.42)' : 'rgba(135, 102, 74, 0.25)';
    bctx.fillRect(x, y, 3 + (i % 4), 26 + (i % 38));
  }
  const barkTex = configureTexture(barkCanvas, 2, 3, maxAnisotropy);

  // 5. Segmented Bamboo Stalk Texture
  const bamCanvas = document.createElement('canvas');
  bamCanvas.width = 128;
  bamCanvas.height = 256;
  const bamCtx = bamCanvas.getContext('2d')!;
  const bamGrad = bamCtx.createLinearGradient(0, 0, 128, 0);
  bamGrad.addColorStop(0, '#5A874D');
  bamGrad.addColorStop(0.5, '#78AA64');
  bamGrad.addColorStop(1, '#558049');
  bamCtx.fillStyle = bamGrad;
  bamCtx.fillRect(0, 0, 128, 256);
  for (let ny = 32; ny < 256; ny += 64) {
    bamCtx.fillStyle = '#3B5C33';
    bamCtx.fillRect(0, ny, 128, 4);
    bamCtx.fillStyle = 'rgba(218, 238, 175, 0.35)';
    bamCtx.fillRect(0, ny + 4, 128, 2);
  }
  const bambooTex = configureTexture(bamCanvas, 1, 2, maxAnisotropy);

  // 6. Warm Temple Timber Planks
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const wctx = woodCanvas.getContext('2d')!;
  wctx.fillStyle = '#87573D';
  wctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const shade = (row % 3) * 7 - 7;
    wctx.fillStyle = `rgb(${135 + shade}, ${88 + shade}, ${62 + shade})`;
    wctx.fillRect(0, row * 32, 256, 30);
    wctx.fillStyle = 'rgba(40, 22, 14, 0.38)';
    wctx.fillRect(0, row * 32 + 30, 256, 2);
  }
  const woodPlankTex = configureTexture(woodCanvas, 4, 4, maxAnisotropy);

  // 7. Traditional Yin-Yang Terracotta Roof Tiles
  const roofCanvas = document.createElement('canvas');
  roofCanvas.width = 256;
  roofCanvas.height = 256;
  const rctx = roofCanvas.getContext('2d')!;
  rctx.fillStyle = '#9D3D30';
  rctx.fillRect(0, 0, 256, 256);
  for (let col = 0; col < 8; col++) {
    const grad = rctx.createLinearGradient(col * 32, 0, col * 32 + 32, 0);
    grad.addColorStop(0, '#782B22');
    grad.addColorStop(0.5, '#BA4B3B');
    grad.addColorStop(1, '#782B22');
    rctx.fillStyle = grad;
    rctx.fillRect(col * 32, 0, 32, 256);
  }
  for (let row = 0; row < 8; row++) {
    rctx.fillStyle = 'rgba(42, 16, 12, 0.34)';
    rctx.fillRect(0, row * 32 + 28, 256, 4);
  }
  const terracottaTex = configureTexture(roofCanvas, 6, 4, maxAnisotropy);

  // 8. Carved Temple Stone
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 256;
  stoneCanvas.height = 256;
  const stctx = stoneCanvas.getContext('2d')!;
  stctx.fillStyle = '#8E8479';
  stctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    stctx.fillStyle = i % 2 === 0 ? 'rgba(45,40,36,0.14)' : 'rgba(235,228,218,0.12)';
    stctx.fillRect((i * 71) % 256, (i * 113) % 256, 3, 3);
  }
  const stoneTex = configureTexture(stoneCanvas, 2, 2, maxAnisotropy);

  // 9. Koi Fish Patterns (Kohaku, Yamabuki, Showa)
  const makeKoiTex = (base: string, spot1: string, spot2?: string) => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const kctx = c.getContext('2d')!;
    kctx.fillStyle = base;
    kctx.fillRect(0, 0, 128, 128);
    kctx.fillStyle = spot1;
    kctx.beginPath();
    kctx.ellipse(42, 64, 24, 34, 0.25, 0, Math.PI * 2);
    kctx.ellipse(92, 58, 18, 28, -0.3, 0, Math.PI * 2);
    kctx.fill();
    if (spot2) {
      kctx.fillStyle = spot2;
      kctx.beginPath();
      kctx.ellipse(66, 72, 14, 20, 0.1, 0, Math.PI * 2);
      kctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, maxAnisotropy);
    tex.needsUpdate = true;
    return tex;
  };
  const koiKohakuTex = makeKoiTex('#FAF3E8', '#E55A32');
  const koiYamabukiTex = makeKoiTex('#F5C14C', '#DF742A');
  const koiShowaTex = makeKoiTex('#E8673C', '#FAF2E6', '#252120');

  // 10. Soft Sunlit Dust Mote Glow Sprite
  const moteCanvas = document.createElement('canvas');
  moteCanvas.width = 64;
  moteCanvas.height = 64;
  const mctx = moteCanvas.getContext('2d')!;
  const mgrad = mctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  mgrad.addColorStop(0, 'rgba(255, 244, 210, 1)');
  mgrad.addColorStop(0.4, 'rgba(245, 205, 125, 0.5)');
  mgrad.addColorStop(1, 'rgba(245, 205, 125, 0)');
  mctx.fillStyle = mgrad;
  mctx.fillRect(0, 0, 64, 64);
  const moteGlowTex = new THREE.CanvasTexture(moteCanvas);
  moteGlowTex.colorSpace = THREE.SRGBColorSpace;

  return {
    grassTex,
    courtyardTileTex,
    sandRakeTex,
    barkTex,
    bambooTex,
    woodPlankTex,
    terracottaTex,
    stoneTex,
    koiKohakuTex,
    koiYamabukiTex,
    koiShowaTex,
    moteGlowTex,
    dispose: () => {
      grassTex.dispose();
      courtyardTileTex.dispose();
      sandRakeTex.dispose();
      barkTex.dispose();
      bambooTex.dispose();
      woodPlankTex.dispose();
      terracottaTex.dispose();
      stoneTex.dispose();
      koiKohakuTex.dispose();
      koiYamabukiTex.dispose();
      koiShowaTex.dispose();
      moteGlowTex.dispose();
    },
  };
}
