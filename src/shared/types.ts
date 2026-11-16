export type CharacterId = 'tieu-su' | 'ao-lam' | 'cu-si' | 'sen-hong' | 'hanh-huong';

export type UserRole = 'admin' | 'player';

export type Direction = 'left' | 'right' | 'up' | 'down';

export type PlayerPose = 'idle' | 'walk' | 'meditate' | 'pray' | 'sit';

export interface CharacterOption {
  id: CharacterId;
  name: string;
  title: string;
  description: string;
  robePrimary: string;
  robeSecondary: string;
  accentColor: string;
  skinTone: string;
  hairStyle: 'shaved' | 'bun' | 'long' | 'short';
}

export const CHARACTERS: CharacterOption[] = [
  {
    id: 'tieu-su',
    name: 'Tiểu Sư Tĩnh Tâm',
    title: 'Sa Di',
    description: 'Áo nâu sòng mộc mạc, bước chân an nhiên nơi thiền viện.',
    robePrimary: '#8C5835',
    robeSecondary: '#D99B52',
    accentColor: '#E5B869',
    skinTone: '#F4D2B5',
    hairStyle: 'shaved',
  },
  {
    id: 'ao-lam',
    name: 'Phật Tử Áo Lam',
    title: 'Đạo Hữu',
    description: 'Trang phục áo lam truyền thống, thanh tịnh và trang nghiêm.',
    robePrimary: '#4D657A',
    robeSecondary: '#36495A',
    accentColor: '#9DB4C8',
    skinTone: '#F6D7BC',
    hairStyle: 'bun',
  },
  {
    id: 'cu-si',
    name: 'Cư Sĩ Áo Tràng',
    title: 'Hành Giả',
    description: 'Áo tràng nâu trầm ấm, chuyên tâm thiền định và tụng kinh.',
    robePrimary: '#524139',
    robeSecondary: '#392B25',
    accentColor: '#C79B5E',
    skinTone: '#ECC6A5',
    hairStyle: 'short',
  },
  {
    id: 'sen-hong',
    name: 'Thiếu Nữ Sen Hồng',
    title: 'Khách Viếng Chùa',
    description: 'Áo dài cánh sen dịu dàng, mang hương hoa dâng lễ Phật.',
    robePrimary: '#B86B77',
    robeSecondary: '#8E4B56',
    accentColor: '#F3D2D7',
    skinTone: '#F8DCC4',
    hairStyle: 'long',
  },
  {
    id: 'hanh-huong',
    name: 'Lữ Khách Hành Hương',
    title: 'Người Tầm Đạo',
    description: 'Y phục vải đũi xanh rêu, tìm về chốn bình yên giữa non ngàn.',
    robePrimary: '#5A6E58',
    robeSecondary: '#3F4F3E',
    accentColor: '#C5D1B8',
    skinTone: '#F0CCB0',
    hairStyle: 'bun',
  },
];

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  characterId: CharacterId;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  sourceType: 'builtin' | 'upload';
  audioUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedBy: string;
  ownerId?: string;
  createdAt: number;
}

export type MusicPlayMode = 'single' | 'playlist';

export interface MusicState {
  activeTrackId: string;
  isPlaying: boolean;
  playMode?: MusicPlayMode;
  playlistTrackIds?: string[];
  updatedAt: number;
  updatedBy: string;
}

export type RitualAction =
  | 'incense'
  | 'bow'
  | 'bell'
  | 'woodfish'
  | 'fortune'
  | 'sweep'
  | 'fish'
  | 'flower'
  | 'lantern'
  | 'feed_koi'
  | 'feed_birds'
  | 'wish'
  | 'kitchen_menu'
  | 'kitchen_table'
  | 'kitchen_sink'
  | 'memorial'
  | 'stupa';

export interface SubAdminRecord {
  uid: string;
  displayName: string;
  characterId: CharacterId;
  appointedBy: string;
  createdAt: number;
}

export type TimeOfDayPreset = 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
export type WeatherPreset = 'auto' | 'clear' | 'breeze' | 'mist' | 'rain';

export interface AtmosphereSetting {
  time: TimeOfDayPreset;
  weather: WeatherPreset;
  updatedBy: string;
  updatedAt: number;
}

export interface MemorialRecord {
  id: string;
  userId: string;
  displayName: string;
  deceasedName: string;
  wish: string;
  createdAt: number;
}

export type VegetarianFoodId = 'com-sen' | 'bun-hue-chay' | 'dau-hu-nam' | 'xoi-vo';
export type VegetarianDrinkId = 'nuoc-ep-tao' | 'tra-sen' | 'sua-hat-sen' | 'nuoc-mat-la-dua';

export interface VegetarianMenuItem<T extends string = string> {
  id: T;
  name: string;
  subtitle: string;
  color: string;
  accentColor: string;
  featured?: boolean;
}

export const VEGETARIAN_FOOD_MENU: VegetarianMenuItem<VegetarianFoodId>[] = [
  {
    id: 'com-sen',
    name: 'Cơm Hạt Sen',
    subtitle: 'Sen, nấm & đậu hũ',
    color: '#F5EFE0',
    accentColor: '#C99B4B',
  },
  {
    id: 'bun-hue-chay',
    name: 'Bún Chay',
    subtitle: 'Nước rau củ ngọt thanh',
    color: '#F0A44B',
    accentColor: '#6AA84F',
  },
  {
    id: 'dau-hu-nam',
    name: 'Đậu Hũ Nấm',
    subtitle: 'Kho nấm & cải xanh',
    color: '#D88D48',
    accentColor: '#5B964E',
  },
  {
    id: 'xoi-vo',
    name: 'Xôi Lá Dứa',
    subtitle: 'Nếp dẻo đậu xanh',
    color: '#E6CF68',
    accentColor: '#7DB560',
  },
];

export const VEGETARIAN_DRINK_MENU: VegetarianMenuItem<VegetarianDrinkId>[] = [
  {
    id: 'nuoc-ep-tao',
    name: 'Ép Táo Tươi',
    subtitle: 'Táo đỏ nguyên chất',
    color: '#F2B84B',
    accentColor: '#D94336',
    featured: true,
  },
  {
    id: 'tra-sen',
    name: 'Trà Sen',
    subtitle: 'Thơm dịu ấm lòng',
    color: '#C7A94E',
    accentColor: '#E57C98',
  },
  {
    id: 'sua-hat-sen',
    name: 'Sữa Hạt Sen',
    subtitle: 'Thanh béo bổ dưỡng',
    color: '#F4ECDA',
    accentColor: '#D7B98E',
  },
  {
    id: 'nuoc-mat-la-dua',
    name: 'Nước Lá Dứa',
    subtitle: 'Nha đam giải nhiệt',
    color: '#7EC47B',
    accentColor: '#DFF4DB',
  },
];

export type KitchenMealRecipientMode = 'self' | 'player' | 'all';

export interface KitchenMealState {
  id: string;
  foodId: VegetarianFoodId;
  drinkId: VegetarianDrinkId;
  orderedByUid: string;
  orderedByName: string;
  recipientMode: KitchenMealRecipientMode;
  targetUid: string;
  targetName: string;
  foodEaten: boolean;
  drinkDrunk: boolean;
  consumedByName: string;
  createdAt: number;
}

export type FlowerSpecies = 'none' | 'sen' | 'cuc' | 'mau-don' | 'nhai';

export interface FlowerCatalogItem {
  id: Exclude<FlowerSpecies, 'none'>;
  name: string;
  subtitle: string;
  petalColor: string;
  accentColor: string;
}

export const FLOWER_CATALOG: FlowerCatalogItem[] = [
  {
    id: 'sen',
    name: 'Hoa Sen Hồng',
    subtitle: 'Thanh khiết tỏa hương',
    petalColor: '#F29BB2',
    accentColor: '#FFE5EC',
  },
  {
    id: 'cuc',
    name: 'Hoa Cúc Vàng',
    subtitle: 'Ấm áp phúc lộc',
    petalColor: '#F0BC42',
    accentColor: '#FFF0B8',
  },
  {
    id: 'mau-don',
    name: 'Mẫu Đơn Đỏ',
    subtitle: 'Cát tường viên mãn',
    petalColor: '#D64D58',
    accentColor: '#FFD1D6',
  },
  {
    id: 'nhai',
    name: 'Hoa Nhài Trắng',
    subtitle: 'Thuần khiết dịu hương',
    petalColor: '#FAF5EA',
    accentColor: '#E5CE7B',
  },
];

export const FLOWER_GROWTH_STAGE2_MS = 6000;
export const FLOWER_GROWTH_BLOOM_MS = 13000;

export interface GardenPlotState {
  id: string;
  plotIndex: number;
  species: FlowerSpecies;
  stage: 0 | 1 | 2 | 3;
  waterCount: number;
  plantedAt?: number;
  plantedBy: string;
  plantedByUid: string;
  lastWateredBy: string;
}

export function getEffectiveFlowerStage(plot: GardenPlotState, nowMs = Date.now()): 0 | 1 | 2 | 3 {
  if (plot.species === 'none' || plot.stage === 0) return 0;
  if (plot.stage >= 3) return 3;
  const plantedAt = plot.plantedAt && plot.plantedAt > 0 ? plot.plantedAt : nowMs;
  const elapsed = Math.max(0, nowMs - plantedAt);
  if (elapsed >= FLOWER_GROWTH_BLOOM_MS) return 3;
  if (elapsed >= FLOWER_GROWTH_STAGE2_MS) return Math.max(plot.stage, 2) as 2;
  return Math.max(plot.stage, 1) as 1;
}

export function getFlowerRemainingSec(plot: GardenPlotState, nowMs = Date.now()): number {
  if (plot.species === 'none' || plot.stage === 0) return 0;
  const effective = getEffectiveFlowerStage(plot, nowMs);
  if (effective >= 3) return 0;
  const plantedAt = plot.plantedAt && plot.plantedAt > 0 ? plot.plantedAt : nowMs;
  const remainingMs = Math.max(0, FLOWER_GROWTH_BLOOM_MS - (nowMs - plantedAt));
  return Math.ceil(remainingMs / 1000);
}

export type LanternColor = 'gold' | 'lotus' | 'jade' | 'ivory';

export interface PondLanternState {
  id: string;
  userId: string;
  displayName: string;
  wish: string;
  color: LanternColor;
  seed: number;
  createdAt: number;
}

export interface TreeWishState {
  id: string;
  userId: string;
  displayName: string;
  wish: string;
  seed: number;
  createdAt: number;
}

export interface RoomPlayer {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  characterId: CharacterId;
  x: number;
  y: number;
  direction: Direction;
  pose: PlayerPose;
  cushionIndex: number | null;
  benchIndex: number | null;
  stupaSlot: number | null;
  chatText?: string;
  chatExpiresAt?: number;
  incenseCount: number;
  bowCount: number;
  bellCount: number;
  sweepCount: number;
  fishCount: number;
  flowerCount: number;
  lanternCount: number;
  koiFeedCount: number;
  wishCount: number;
  kitchenWashCount: number;
  memorialCount: number;
}

export interface RoomSummary {
  id: string;
  name: string;
  maxPlayers: number;
  playerCount: number;
  incenseCount: number;
}

export interface RoomState {
  id: string;
  name: string;
  maxPlayers: number;
  players: RoomPlayer[];
  incenseCount: number;
  cushions: (string | null)[];
  benches: (string | null)[];
  stupaSlots: (string | null)[];
  gardenPlots: GardenPlotState[];
  lanterns: PondLanternState[];
  wishes: TreeWishState[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  characterId: CharacterId;
  text: string;
  timestamp: number;
  kind: 'chat' | 'system';
  action?: RitualAction | 'none';
}

export interface FortuneSlip {
  number: string;
  title: string;
  verse: string;
  meaning: string;
}

export const FORTUNE_SLIPS: FortuneSlip[] = [
  {
    number: 'Quẻ 01 · Thượng Cát',
    title: 'Liên Hoa Khai Tĩnh',
    verse: 'Trong đầm sen nở ngát hương, tâm an vạn sự tự nhiên cát tường.',
    meaning: 'Giữ lòng thanh thản trước mọi biến động, cơ duyên tốt lành sẽ tự tìm đến.',
  },
  {
    number: 'Quẻ 02 · Bình An',
    title: 'Tùng Bách Nghênh Phong',
    verse: 'Gió qua rừng trúc không lưu dấu, tâm lặng như gương chiếu trăng thu.',
    meaning: 'Buông bỏ lo âu vụn vặt, tập trung vào hiện tại sẽ thấy sự nhẹ nhõm.',
  },
  {
    number: 'Quẻ 03 · Thuận Duyên',
    title: 'Minh Nguyệt Thanh Tuyền',
    verse: 'Suối trong soi bóng trăng rằm, người hiền gặp bạn đồng hành tri âm.',
    meaning: 'Hôm nay thuận lợi cho việc kết giao, sẻ chia và giúp đỡ những người xung quanh.',
  },
  {
    number: 'Quẻ 04 · Tinh Tấn',
    title: 'Thần Chung Mộ Cổ',
    verse: 'Chuông sớm mõ chiều thức tỉnh tâm, từng bước chậm rãi mà vững chãi.',
    meaning: 'Không cần vội vã, chỉ cần bền bỉ mỗi ngày một chút là đủ viên mãn.',
  },
  {
    number: 'Quẻ 05 · Cát Tường',
    title: 'Bồ Đề Tán Mát',
    verse: 'Dưới cội bồ đề ngồi lắng nghe, phiền não theo làn khói trầm bay đi.',
    meaning: 'Một lời nói ôn hòa hôm nay có thể hóa giải nhiều hiểu lầm cũ.',
  },
  {
    number: 'Quẻ 06 · Như Ý',
    title: 'Xuân Phong Hòa Khí',
    verse: 'Gió xuân thổi nhẹ bên hiên chùa, hoa nở đúng mùa chẳng đợi ai.',
    meaning: 'Mọi việc đang âm thầm chín muồi, hãy kiên nhẫn chờ thời điểm thích hợp.',
  },
  {
    number: 'Quẻ 07 · An Lạc',
    title: 'Trà Thiền Nhất Vị',
    verse: 'Chén trà ấm áp giữa chiều thu, biết đủ tự nhiên lòng thư thái.',
    meaning: 'Hạnh phúc không ở đâu xa, nằm ngay trong sự trân trọng những điều giản dị.',
  },
  {
    number: 'Quẻ 08 · Khai Trí',
    title: 'Vân Khai Kiến Nhật',
    verse: 'Mây mù rồi cũng tan đi hết, ánh sáng bình minh rọi khắp non sông.',
    meaning: 'Khó khăn hiện tại chỉ là tạm thời, sự sáng suốt sẽ dẫn lối cho bạn.',
  },
];

// Viewport & expanded multi-zone world coordinate dimensions
export const TEMPLE_WIDTH = 960;
export const TEMPLE_HEIGHT = 600;
export const WORLD_WIDTH = 1920;
export const WORLD_MIN_X = -440;
export const WORLD_TOTAL_WIDTH = WORLD_WIDTH - WORLD_MIN_X;
export const WORLD_HEIGHT = 1260;
export const WORLD_MIN_Y = -880;
export const WORLD_TOTAL_HEIGHT = WORLD_HEIGHT - WORLD_MIN_Y;

export const CUSHION_POSITIONS = [
  // Hàng trước (5 bồ đoàn)
  { index: 0, x: 760, y: 278, label: 'Bồ đoàn 1 · Hàng trước' },
  { index: 1, x: 860, y: 278, label: 'Bồ đoàn 2 · Hàng trước' },
  { index: 2, x: 960, y: 278, label: 'Bồ đoàn 3 · Hàng trước' },
  { index: 3, x: 1060, y: 278, label: 'Bồ đoàn 4 · Hàng trước' },
  { index: 4, x: 1160, y: 278, label: 'Bồ đoàn 5 · Hàng trước' },
  // Hàng sau (5 bồ đoàn)
  { index: 5, x: 760, y: 392, label: 'Bồ đoàn 6 · Hàng sau' },
  { index: 6, x: 860, y: 392, label: 'Bồ đoàn 7 · Hàng sau' },
  { index: 7, x: 960, y: 392, label: 'Bồ đoàn 8 · Hàng sau' },
  { index: 8, x: 1060, y: 392, label: 'Bồ đoàn 9 · Hàng sau' },
  { index: 9, x: 1160, y: 392, label: 'Bồ đoàn 10 · Hàng sau' },
];

export const GARDEN_PLOT_POSITIONS = [
  { index: 0, id: 'plot-0', x: 505, y: 965, label: 'Luống Hoa 1' },
  { index: 1, id: 'plot-1', x: 595, y: 965, label: 'Luống Hoa 2' },
  { index: 2, id: 'plot-2', x: 685, y: 965, label: 'Luống Hoa 3' },
  { index: 3, id: 'plot-3', x: 505, y: 1035, label: 'Luống Hoa 4' },
  { index: 4, id: 'plot-4', x: 595, y: 1035, label: 'Luống Hoa 5' },
  { index: 5, id: 'plot-5', x: 685, y: 1035, label: 'Luống Hoa 6' },
];

export const INTERACTABLES: Record<
  RitualAction,
  { x: number; y: number; radius: number; label: string }
> = {
  incense: { x: 960, y: 690, radius: 74, label: 'Lư Hương (Thắp nhang)' },
  bow: { x: 960, y: 162, radius: 66, label: 'Chánh Điện · Lễ Bái (Lạy Phật)' },
  bell: { x: 605, y: 505, radius: 70, label: 'Lầu Chuông · Đại Hồng Chung (Thỉnh chuông)' },
  woodfish: { x: 1315, y: 505, radius: 70, label: 'Gác Mõ · Mõ Gỗ (Gõ mõ)' },
  fortune: { x: 1185, y: 740, radius: 64, label: 'Bàn Xin Xăm (Xin quẻ bình an)' },
  sweep: { x: 335, y: 405, radius: 68, label: 'Vườn Bồ Đề · Chổi tre (Quét lá)' },
  fish: { x: 562, y: 822, radius: 72, label: 'Ao Sen · Bến Phóng Sinh (Thả cá)' },
  flower: { x: 595, y: 1000, radius: 110, label: 'Vườn Hoa Liên Tâm (Gieo hạt & dâng hoa)' },
  lantern: { x: 94, y: 735, radius: 64, label: 'Thủy Đình · Thả Hoa Đăng' },
  feed_koi: { x: 338, y: 562, radius: 66, label: 'Bờ Bắc Ao Sen · Cho Cá Koi Ăn' },
  feed_birds: { x: 1615, y: 808, radius: 64, label: 'Vườn Hoa Giấy · Rải Thức Ăn Cho Chim' },
  wish: { x: 1315, y: 965, radius: 74, label: 'Cây Nguyện Ước (Ném dải băng đỏ)' },
  kitchen_menu: { x: 1535, y: 325, radius: 66, label: 'Gian Bếp Chay · Chọn Thực Đơn' },
  kitchen_table: { x: 1613, y: 475, radius: 76, label: 'Bàn Ăn Chay · Dùng Món & Nước' },
  kitchen_sink: { x: 1695, y: 325, radius: 66, label: 'Bồn Rửa · Rửa Bát & Ly (+1 Công đức)' },
  memorial: { x: 330, y: -240, radius: 64, label: 'Đài Cầu Siêu (Làm lễ cầu siêu)' },
  stupa: { x: 960, y: -222, radius: 60, label: 'Bảo Tháp 9 Tầng · Đài Quan Sát (Tối đa 3 người)' },
};

export const STUPA_DECK_CAPACITY = 3;

export const STUPA_DECK_SLOTS = [
  { index: 0, x: 960, y: -272, label: 'Đài Quan Sát · Chính Nam' },
  { index: 1, x: 930, y: -292, label: 'Đài Quan Sát · Tây Nam' },
  { index: 2, x: 990, y: -292, label: 'Đài Quan Sát · Đông Nam' },
] as const;

export const PERGOLA_SPEC = {
  cx: 1615,
  cy: 740,
  minX: 1485,
  maxX: 1745,
  minY: 668,
  maxY: 812,
} as const;

export const BENCH_SEATS_PER_BENCH = 2;

export const PERGOLA_BENCH_SPECS = [
  { index: 0, id: 'bench-left', x: 1555, y: 745, label: 'Ghế Đá Trái · Dàn Hoa Giấy Hồng' },
  { index: 1, id: 'bench-right', x: 1675, y: 745, label: 'Ghế Đá Phải · Dàn Hoa Giấy Hồng' },
  { index: 2, id: 'bench-courtyard-west', x: 745, y: 815, label: 'Ghế Đá Tây · Sân Chánh Điện' },
  { index: 3, id: 'bench-courtyard-east', x: 1175, y: 815, label: 'Ghế Đá Đông · Sân Chánh Điện' },
  { index: 4, id: 'bench-hon-non-bo', x: 225, y: 158, label: 'Ghế Đá Vườn Bồ Đề · Ngắm Hòn Non Bộ' },
  { index: 5, id: 'bench-lotus-pond', x: 338, y: 924, label: 'Ghế Đá Bờ Nam Ao Sen' },
  { index: 6, id: 'bench-memorial-park', x: 330, y: -404, label: 'Ghế Đá Tĩnh Tâm · Công Viên Cầu Siêu' },
] as const;

export const TOTAL_BENCH_SLOTS = PERGOLA_BENCH_SPECS.length * BENCH_SEATS_PER_BENCH;

export function getBenchSeatPosition(slotIndex: number): {
  benchIndex: number;
  seatOffsetIndex: 0 | 1;
  x: number;
  y: number;
} | null {
  if (slotIndex < 0 || slotIndex >= TOTAL_BENCH_SLOTS) return null;
  const benchIndex = Math.floor(slotIndex / BENCH_SEATS_PER_BENCH);
  const bench = PERGOLA_BENCH_SPECS[benchIndex];
  if (!bench) return null;
  const seatOffsetIndex = (slotIndex % BENCH_SEATS_PER_BENCH === 0 ? 0 : 1) as 0 | 1;
  return {
    benchIndex,
    seatOffsetIndex,
    x: bench.x + (seatOffsetIndex === 0 ? -19 : 19),
    y: bench.y,
  };
}

export function getBenchOccupancy(
  benches: (string | null)[] | undefined,
  benchIndex: number
): { count: number; capacity: number } {
  const base = benchIndex * BENCH_SEATS_PER_BENCH;
  let count = 0;
  for (let i = 0; i < BENCH_SEATS_PER_BENCH; i++) {
    if (benches?.[base + i]) count++;
  }
  return { count, capacity: BENCH_SEATS_PER_BENCH };
}

export const HON_NON_BO_SPEC = {
  cx: -115,
  cy: 265,
  rx: 132,
  ry: 92,
} as const;

export const PRECEPTS_STELE_SPEC = {
  x: 76,
  y: 204,
  label: 'Bia Ngũ Giới · Năm Giới Của Phật',
} as const;

export const FIVE_PRECEPTS_LIST = [
  {
    number: 1,
    title: 'Không sát sinh',
    meaning: 'Nuôi dưỡng lòng từ bi, tôn trọng và bảo vệ mọi sự sống.',
  },
  {
    number: 2,
    title: 'Không trộm cắp',
    meaning: 'Sống ngay thẳng, liêm khiết, không lấy của không phải của mình.',
  },
  {
    number: 3,
    title: 'Không tà dâm',
    meaning: 'Giữ tâm ý trong sáng, sống chung thủy và đúng mực đạo đức.',
  },
  {
    number: 4,
    title: 'Không nói dối',
    meaning: 'Nói lời chân thật, ái ngữ hòa hợp, không thêu dệt hay chia rẽ.',
  },
  {
    number: 5,
    title: 'Không uống rượu bia & chất say',
    meaning: 'Giữ trí tuệ sáng suốt, tâm thân tỉnh táo và chánh niệm mỗi ngày.',
  },
] as const;
