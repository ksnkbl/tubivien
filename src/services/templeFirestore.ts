import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.ts';
import type {
  AtmosphereSetting,
  CharacterId,
  ChatMessage,
  Direction,
  FlowerSpecies,
  GardenPlotState,
  KitchenMealRecipientMode,
  KitchenMealState,
  LanternColor,
  MemorialRecord,
  MusicPlayMode,
  MusicState,
  MusicTrack,
  PlayerPose,
  PondLanternState,
  PublicUser,
  RitualAction,
  RoomPlayer,
  RoomState,
  RoomSummary,
  SubAdminRecord,
  TimeOfDayPreset,
  TreeWishState,
  UserRole,
  VegetarianDrinkId,
  VegetarianFoodId,
  WeatherPreset,
} from '../shared/types.ts';
import {
  CUSHION_POSITIONS,
  FLOWER_CATALOG,
  GARDEN_PLOT_POSITIONS,
  INTERACTABLES,
  PERGOLA_BENCH_SPECS,
  STUPA_DECK_CAPACITY,
  STUPA_DECK_SLOTS,
  VEGETARIAN_DRINK_MENU,
  VEGETARIAN_FOOD_MENU,
} from '../shared/types.ts';

function normalizeCushionsArray(raw?: unknown[]): string[] {
  const total = CUSHION_POSITIONS.length;
  const out = Array.from({ length: total }, () => '');
  if (Array.isArray(raw)) {
    for (let i = 0; i < Math.min(total, raw.length); i++) {
      const val = raw[i];
      out[i] = typeof val === 'string' ? val : '';
    }
  }
  return out;
}

function normalizeBenchesArray(raw?: unknown[]): string[] {
  const total = PERGOLA_BENCH_SPECS.length * 2;
  const out = Array.from({ length: total }, () => '');
  if (Array.isArray(raw)) {
    for (let i = 0; i < Math.min(total, raw.length); i++) {
      const val = raw[i];
      out[i] = typeof val === 'string' ? val : '';
    }
  }
  return out;
}

function normalizeStupaSlotsArray(raw?: unknown[]): string[] {
  const total = STUPA_DECK_CAPACITY;
  const out = Array.from({ length: total }, () => '');
  if (Array.isArray(raw)) {
    for (let i = 0; i < Math.min(total, raw.length); i++) {
      const val = raw[i];
      out[i] = typeof val === 'string' ? val : '';
    }
  }
  return out;
}

export const ADMIN_EMAIL = 'vinhtoanlam@gmail.com';

export const DEFAULT_ZEN_TRACK: MusicTrack = {
  id: 'default-zen',
  title: 'Thiền Tâm Nhã Khúc (Mặc định)',
  artist: 'Chuông Chùa & Sáo Trúc',
  sourceType: 'builtin',
  uploadedBy: 'Hệ thống',
  createdAt: 0,
};

export function isUserAdmin(firebaseUser: User | null): boolean {
  return Boolean(
    firebaseUser &&
      firebaseUser.email?.toLowerCase() === ADMIN_EMAIL &&
      firebaseUser.emailVerified
  );
}

export const isPrimaryAdmin = isUserAdmin;

export const DEFAULT_ATMOSPHERE: AtmosphereSetting = {
  time: 'auto',
  weather: 'auto',
  updatedBy: 'Hệ thống',
  updatedAt: 0,
};

const PROFILE_CACHE_PREFIX = 'chua_tinh_tam_profile_';
const SEEDED_FLAG_KEY = 'chua_tinh_tam_seeded_v1';

export function getCachedUserProfile(firebaseUser: User): PublicUser | null {
  try {
    const raw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${firebaseUser.uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { displayName?: string; characterId?: CharacterId };
    if (!parsed.displayName || !parsed.characterId) return null;
    return {
      id: firebaseUser.uid,
      username: firebaseUser.email?.split('@')[0] || firebaseUser.uid.slice(0, 10),
      displayName: parsed.displayName.slice(0, 28),
      role: isUserAdmin(firebaseUser) ? 'admin' : 'player',
      characterId: parsed.characterId,
    };
  } catch {
    return null;
  }
}

export function saveCachedUserProfile(profile: PublicUser): PublicUser {
  try {
    localStorage.setItem(
      `${PROFILE_CACHE_PREFIX}${profile.id}`,
      JSON.stringify({
        displayName: profile.displayName.slice(0, 28),
        characterId: profile.characterId,
      })
    );
  } catch {
    // ignore storage quota issues
  }
  return profile;
}

export async function fetchUserProfile(uid: string): Promise<PublicUser | null> {
  const path = `users_public/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users_public', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as {
      uid: string;
      displayName: string;
      characterId: CharacterId;
      role: UserRole;
    };
    const profile: PublicUser = {
      id: data.uid,
      username: data.uid.slice(0, 10),
      displayName: data.displayName,
      role: data.role,
      characterId: data.characterId,
    };
    saveCachedUserProfile(profile);
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createUserProfile(
  firebaseUser: User,
  displayName: string,
  characterId: CharacterId
): Promise<PublicUser> {
  const uid = firebaseUser.uid;
  const role: UserRole = isUserAdmin(firebaseUser) ? 'admin' : 'player';
  const cleanName = (displayName.trim() || firebaseUser.displayName || 'Hành Giả').slice(0, 28);

  const publicRef = doc(db, 'users_public', uid);
  const privateRef = doc(db, 'users_public', uid, 'private', 'info');

  try {
    const [publicSnap, privateSnap] = await Promise.all([getDoc(publicRef), getDoc(privateRef)]);
    const batch = writeBatch(db);
    if (publicSnap.exists()) {
      batch.update(publicRef, {
        displayName: cleanName,
        characterId,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(publicRef, {
        uid,
        displayName: cleanName,
        characterId,
        role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    if (!privateSnap.exists()) {
      batch.set(privateRef, {
        uid,
        email: firebaseUser.email || 'unknown@example.com',
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_public/${uid}`);
  }

  return saveCachedUserProfile({
    id: uid,
    username: firebaseUser.email?.split('@')[0] || uid.slice(0, 10),
    displayName: cleanName,
    role,
    characterId,
  });
}

export function updateLocalProfileCacheOnly(
  updates: { displayName?: string; characterId?: CharacterId },
  currentUser: PublicUser
): PublicUser {
  const nextName = (updates.displayName?.trim() || currentUser.displayName).slice(0, 28);
  const nextChar = updates.characterId || currentUser.characterId;
  return saveCachedUserProfile({
    ...currentUser,
    displayName: nextName,
    characterId: nextChar,
  });
}

export function normalizeTempleRoomName(roomId: string, name: string): string {
  if (roomId === 'chua-tinh-tam' && /tĩnh tâm/i.test(name)) {
    return 'Từ Bi Viện';
  }
  return name;
}

export function resolveEffectivePlaylist(
  tracks: MusicTrack[],
  musicState: MusicState
): MusicTrack[] {
  if (musicState.playMode !== 'playlist') return tracks;
  const ids = musicState.playlistTrackIds;
  if (!ids || ids.length === 0) return tracks;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const resolved: MusicTrack[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const match = byId.get(id);
    if (match) {
      seen.add(id);
      resolved.push(match);
    }
  }
  return resolved.length > 0 ? resolved : tracks;
}

export async function ensureInitialTempleData(firebaseUser: User): Promise<void> {
  // Ensure main temple room name & capacity in Firestore are migrated and remove old Thiền Viện Song Hành when admin signs in
  if (isUserAdmin(firebaseUser)) {
    try {
      const migratedFlag = 'temple_tubivien_migrated_v1';
      const capFlag = 'temple_cap10_migrated_v1';
      const removedSecondFlag = 'temple_removed_thienvien_v1';
      if (localStorage.getItem(migratedFlag) !== '1' || localStorage.getItem(capFlag) !== '1') {
        const mainRoomRef = doc(db, 'rooms', 'chua-tinh-tam');
        const mainSnap = await getDoc(mainRoomRef);
        if (mainSnap.exists()) {
          const d = mainSnap.data() as {
            name?: string;
            maxPlayers?: number;
            cushions?: unknown[];
          };
          const curName = String(d.name || '');
          const needsRename = /tĩnh tâm/i.test(curName);
          const needsCapUpgrade = (Number(d.maxPlayers) || 0) < 10 || !Array.isArray(d.cushions) || d.cushions.length < CUSHION_POSITIONS.length;
          if (needsRename || needsCapUpgrade) {
            await updateDoc(mainRoomRef, {
              ...(needsRename ? { name: 'Từ Bi Viện' } : {}),
              maxPlayers: 10,
              cushions: normalizeCushionsArray(d.cushions),
              updatedAt: serverTimestamp(),
            });
          }
          localStorage.setItem(migratedFlag, '1');
          localStorage.setItem(capFlag, '1');
        }
      }
      if (localStorage.getItem(removedSecondFlag) !== '1') {
        const secondRoomRef = doc(db, 'rooms', 'thien-vien-nho');
        const secondSnap = await getDoc(secondRoomRef);
        if (secondSnap.exists()) {
          await deleteDoc(secondRoomRef);
        }
        localStorage.setItem(removedSecondFlag, '1');
      }
    } catch {
      // non-fatal migration check
    }
  }

  try {
    if (localStorage.getItem(SEEDED_FLAG_KEY) === '1') {
      return;
    }
  } catch {
    // ignore
  }

  const uid = firebaseUser.uid;

  // 1. Seed default meditation track if missing
  try {
    const defaultTrackRef = doc(db, 'tracks', 'default-zen');
    const trackSnap = await getDoc(defaultTrackRef);
    if (!trackSnap.exists()) {
      await setDoc(defaultTrackRef, {
        title: DEFAULT_ZEN_TRACK.title,
        artist: DEFAULT_ZEN_TRACK.artist,
        sourceType: 'builtin',
        uploadedBy: 'Hệ thống',
        ownerId: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'tracks/default-zen');
  }

  // 2. Seed global music & atmosphere state if missing
  try {
    const musicSettingsRef = doc(db, 'settings', 'music');
    const settingsSnap = await getDoc(musicSettingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(musicSettingsRef, {
        activeTrackId: 'default-zen',
        isPlaying: true,
        playMode: 'single',
        playlistTrackIds: [],
        updatedBy: 'Hệ thống',
        updatedAt: serverTimestamp(),
      });
    }
    const atmoRef = doc(db, 'settings', 'atmosphere');
    const atmoSnap = await getDoc(atmoRef);
    if (!atmoSnap.exists()) {
      await setDoc(atmoRef, {
        time: 'auto',
        weather: 'auto',
        updatedBy: 'Hệ thống',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/music');
  }

  // 3. Seed only Từ Bi Viện (main temple) if missing
  try {
    const mainRoomRef = doc(db, 'rooms', 'chua-tinh-tam');
    const mainSnap = await getDoc(mainRoomRef);
    if (!mainSnap.exists()) {
      await setDoc(mainRoomRef, {
        name: 'Từ Bi Viện',
        maxPlayers: 10,
        memberIds: [],
        incenseCount: 2,
        cushions: normalizeCushionsArray(),
        benches: normalizeBenchesArray(),
        stupaSlots: normalizeStupaSlotsArray(),
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      localStorage.setItem(SEEDED_FLAG_KEY, '1');
    } catch {
      // ignore
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'rooms');
  }
}

export function subscribeRooms(
  onUpdate: (rooms: RoomSummary[]) => void
): Unsubscribe {
  const roomsQuery = query(
    collection(db, 'rooms'),
    where('maxPlayers', '>=', 2),
    where('maxPlayers', '<=', 10)
  );
  return onSnapshot(
    roomsQuery,
    (snapshot) => {
      const list: RoomSummary[] = snapshot.docs.map((d) => {
        const data = d.data() as {
          name: string;
          maxPlayers: number;
          memberIds?: string[];
          incenseCount?: number;
        };
        const capped = Math.min(10, Math.max(2, Math.round(Number(data.maxPlayers) || 10)));
        return {
          id: d.id,
          name: normalizeTempleRoomName(d.id, data.name),
          maxPlayers: capped,
          playerCount: data.memberIds?.length || 0,
          incenseCount: data.incenseCount || 0,
        };
      });
      onUpdate(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rooms');
    }
  );
}

export async function createTempleRoom(
  uid: string,
  rawName: string,
  maxPlayers: number
): Promise<string> {
  const cleanName = rawName.trim().slice(0, 36) || 'Am Nhỏ Tĩnh Lặng';
  const safeMaxPlayers = Math.min(10, Math.max(2, Math.round(maxPlayers || 10)));
  const slug =
    cleanName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'chua';
  const roomId = `${slug}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    await setDoc(doc(db, 'rooms', roomId), {
      name: cleanName,
      maxPlayers: safeMaxPlayers,
      memberIds: [],
      incenseCount: 0,
      cushions: normalizeCushionsArray(),
      benches: normalizeBenchesArray(),
      stupaSlots: normalizeStupaSlotsArray(),
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return roomId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}`);
  }
}

export async function deleteTempleRoom(roomId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rooms', roomId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rooms/${roomId}`);
  }
}

export async function joinTempleRoom(roomId: string, user: PublicUser): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', user.id);

  let roomData: {
    name: string;
    maxPlayers: number;
    memberIds: string[];
  };
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      throw new Error('Không tìm thấy phòng chùa này.');
    }
    roomData = snap.data() as {
      name: string;
      maxPlayers: number;
      memberIds: string[];
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Không tìm thấy phòng chùa này.') {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
  }

  const alreadyMember = roomData.memberIds.includes(user.id);
  if (!alreadyMember && roomData.memberIds.length >= roomData.maxPlayers) {
    throw new Error(
      `Ngôi chùa "${roomData.name}" đã đủ ${roomData.maxPlayers}/${roomData.maxPlayers} hành giả. Vui lòng chọn phòng khác hoặc mở chùa mới.`
    );
  }

  const spawnOffsets = [
    { x: 960, y: 1045 },
    { x: 905, y: 1020 },
    { x: 1015, y: 1020 },
    { x: 932, y: 995 },
    { x: 988, y: 995 },
    { x: 892, y: 1055 },
    { x: 1028, y: 1055 },
    { x: 960, y: 970 },
    { x: 900, y: 972 },
    { x: 1020, y: 972 },
  ];
  const slot = roomData.memberIds.length % spawnOffsets.length;
  const spawn = spawnOffsets[slot];

  const batch = writeBatch(db);
  if (!alreadyMember) {
    batch.update(roomRef, {
      memberIds: [...roomData.memberIds, user.id],
      updatedAt: serverTimestamp(),
    });
  }

  let playerExists = false;
  try {
    const playerSnap = await getDoc(playerRef);
    playerExists = playerSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}/players/${user.id}`);
  }

  if (playerExists) {
    batch.update(playerRef, {
      displayName: user.displayName,
      characterId: user.characterId,
      x: spawn.x,
      y: spawn.y,
      direction: 'up',
      pose: 'idle',
      cushionIndex: -1,
      benchIndex: -1,
      stupaSlot: -1,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(playerRef, {
      userId: user.id,
      displayName: user.displayName,
      role: user.role,
      characterId: user.characterId,
      x: spawn.x,
      y: spawn.y,
      direction: 'up',
      pose: 'idle',
      cushionIndex: -1,
      benchIndex: -1,
      stupaSlot: -1,
      incenseCount: 0,
      bowCount: 0,
      bellCount: 0,
      sweepCount: 0,
      fishCount: 0,
      flowerCount: 0,
      lanternCount: 0,
      koiFeedCount: 0,
      wishCount: 0,
      kitchenWashCount: 0,
      memorialCount: 0,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  }

  const welcomeId = `join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  batch.set(doc(db, 'rooms', roomId, 'messages', welcomeId), {
    userId: user.id,
    displayName: user.displayName,
    characterId: user.characterId,
    text: `${user.displayName} vừa bước vào sân chùa.`,
    kind: 'system',
    action: 'none',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }
}

export async function leaveTempleRoom(roomId: string, user: PublicUser): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', user.id);

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const data = snap.data() as {
      memberIds: string[];
      cushions: string[];
      benches?: string[];
      stupaSlots?: string[];
    };
    const nextMembers = (data.memberIds || []).filter((id) => id !== user.id);
    const nextCushions = normalizeCushionsArray(data.cushions).map((c) => (c === user.id ? '' : c));
    const nextBenches = normalizeBenchesArray(data.benches).map((b) => (b === user.id ? '' : b));
    const nextStupaSlots = normalizeStupaSlotsArray(data.stupaSlots).map((s) => (s === user.id ? '' : s));

    const batch = writeBatch(db);
    if (data.memberIds?.includes(user.id)) {
      batch.update(roomRef, {
        memberIds: nextMembers,
        cushions: nextCushions,
        benches: nextBenches,
        stupaSlots: nextStupaSlots,
        updatedAt: serverTimestamp(),
      });
    }
    batch.delete(playerRef);
    await batch.commit();
  } catch {
    // Best-effort cleanup on unmount/leave
    try {
      await deleteDoc(playerRef);
    } catch {
      // ignore
    }
  }
}

export function subscribeTempleRoom(
  roomId: string,
  callbacks: {
    onRoomMeta: (meta: {
      id: string;
      name: string;
      maxPlayers: number;
      incenseCount: number;
      cushions: (string | null)[];
      benches: (string | null)[];
      stupaSlots: (string | null)[];
    }) => void;
    onPlayers: (players: RoomPlayer[]) => void;
    onMessages: (messages: (ChatMessage & { action?: RitualAction | 'none' })[]) => void;
    onGardenPlots: (plots: GardenPlotState[]) => void;
    onLanterns: (lanterns: PondLanternState[]) => void;
    onWishes: (wishes: TreeWishState[]) => void;
    onMemorials?: (memorials: MemorialRecord[]) => void;
    onKitchenMeals?: (meals: KitchenMealState[]) => void;
  }
): Unsubscribe {
  const unsubRoom = onSnapshot(
    doc(db, 'rooms', roomId),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as {
        name: string;
        maxPlayers: number;
        incenseCount: number;
        cushions: string[];
        benches?: string[];
        stupaSlots?: string[];
      };
      callbacks.onRoomMeta({
        id: snap.id,
        name: normalizeTempleRoomName(snap.id, d.name),
        maxPlayers: Math.min(10, Math.max(2, Math.round(Number(d.maxPlayers) || 10))),
        incenseCount: d.incenseCount || 0,
        cushions: normalizeCushionsArray(d.cushions).map((c) => (c ? c : null)),
        benches: normalizeBenchesArray(d.benches).map((b) => (b ? b : null)),
        stupaSlots: normalizeStupaSlotsArray(d.stupaSlots).map((s) => (s ? s : null)),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
    }
  );

  const playersQuery = query(
    collection(db, 'rooms', roomId, 'players'),
    where('lastActiveAt', '>=', 0)
  );
  const unsubPlayers = onSnapshot(
    playersQuery,
    (snap) => {
      const list: RoomPlayer[] = snap.docs.map((d) => {
        const p = d.data() as {
          userId: string;
          displayName: string;
          role: UserRole;
          characterId: CharacterId;
          x: number;
          y: number;
          direction: Direction;
          pose: PlayerPose;
          cushionIndex: number;
          benchIndex?: number;
          stupaSlot?: number;
          chatText?: string;
          chatExpiresAt?: number;
          incenseCount?: number;
          bowCount?: number;
          bellCount?: number;
          sweepCount?: number;
          fishCount?: number;
          flowerCount?: number;
          lanternCount?: number;
          koiFeedCount?: number;
          wishCount?: number;
          kitchenWashCount?: number;
          memorialCount?: number;
        };
        return {
          userId: p.userId,
          displayName: p.displayName,
          username: p.userId.slice(0, 10),
          role: p.role,
          characterId: p.characterId,
          x: p.x,
          y: p.y,
          direction: p.direction,
          pose: p.pose,
          cushionIndex: p.cushionIndex >= 0 ? p.cushionIndex : null,
          benchIndex: typeof p.benchIndex === 'number' && p.benchIndex >= 0 ? p.benchIndex : null,
          stupaSlot: typeof p.stupaSlot === 'number' && p.stupaSlot >= 0 ? p.stupaSlot : null,
          chatText: p.chatText,
          chatExpiresAt: p.chatExpiresAt,
          incenseCount: typeof p.incenseCount === 'number' ? p.incenseCount : 0,
          bowCount: typeof p.bowCount === 'number' ? p.bowCount : 0,
          bellCount: typeof p.bellCount === 'number' ? p.bellCount : 0,
          sweepCount: typeof p.sweepCount === 'number' ? p.sweepCount : 0,
          fishCount: typeof p.fishCount === 'number' ? p.fishCount : 0,
          flowerCount: typeof p.flowerCount === 'number' ? p.flowerCount : 0,
          lanternCount: typeof p.lanternCount === 'number' ? p.lanternCount : 0,
          koiFeedCount: typeof p.koiFeedCount === 'number' ? p.koiFeedCount : 0,
          wishCount: typeof p.wishCount === 'number' ? p.wishCount : 0,
          kitchenWashCount: typeof p.kitchenWashCount === 'number' ? p.kitchenWashCount : 0,
          memorialCount: typeof p.memorialCount === 'number' ? p.memorialCount : 0,
        };
      });
      callbacks.onPlayers(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/players`);
    }
  );

  const messagesQuery = query(
    collection(db, 'rooms', roomId, 'messages'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'desc'),
    limit(35)
  );
  const unsubMessages = onSnapshot(
    messagesQuery,
    (snap) => {
      const list = snap.docs
        .map((d) => {
          const m = d.data() as {
            userId: string;
            displayName: string;
            characterId: CharacterId;
            text: string;
            kind: 'chat' | 'system' | 'ritual';
            action?: RitualAction | 'none';
            createdAt?: { toMillis?: () => number };
          };
          return {
            id: d.id,
            userId: m.userId,
            displayName: m.displayName,
            characterId: m.characterId,
            text: m.text,
            timestamp: m.createdAt?.toMillis ? m.createdAt.toMillis() : Date.now(),
            kind: (m.kind === 'ritual' ? 'system' : m.kind) as 'chat' | 'system',
            action: m.action || 'none',
          };
        })
        .reverse();
      callbacks.onMessages(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/messages`);
    }
  );

  const gardenQuery = query(
    collection(db, 'rooms', roomId, 'gardenPlots'),
    where('plotIndex', 'in', [0, 1, 2, 3, 4, 5])
  );
  const unsubGarden = onSnapshot(
    gardenQuery,
    (snap) => {
      const byIndex = new Map<number, GardenPlotState>();
      for (const d of snap.docs) {
        const g = d.data() as {
          plotIndex: number;
          species: FlowerSpecies;
          stage: 0 | 1 | 2 | 3;
          waterCount: number;
          plantedAt?: number;
          plantedBy: string;
          plantedByUid: string;
          lastWateredBy: string;
          updatedAt?: { toMillis?: () => number };
        };
        if (g.plotIndex >= 0 && g.plotIndex <= 5) {
          const fallbackPlantedAt =
            g.species && g.species !== 'none'
              ? g.updatedAt?.toMillis
                ? g.updatedAt.toMillis()
                : Date.now()
              : 0;
          byIndex.set(g.plotIndex, {
            id: d.id,
            plotIndex: g.plotIndex,
            species: g.species || 'none',
            stage: g.stage ?? 0,
            waterCount: g.waterCount ?? 0,
            plantedAt: typeof g.plantedAt === 'number' && g.plantedAt > 0 ? g.plantedAt : fallbackPlantedAt,
            plantedBy: g.plantedBy || '',
            plantedByUid: g.plantedByUid || '',
            lastWateredBy: g.lastWateredBy || '',
          });
        }
      }
      const fullList: GardenPlotState[] = GARDEN_PLOT_POSITIONS.map(
        (pos) =>
          byIndex.get(pos.index) ?? {
            id: pos.id,
            plotIndex: pos.index,
            species: 'none',
            stage: 0,
            waterCount: 0,
            plantedAt: 0,
            plantedBy: '',
            plantedByUid: '',
            lastWateredBy: '',
          }
      );
      callbacks.onGardenPlots(fullList);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/gardenPlots`);
    }
  );

  const lanternsQuery = query(
    collection(db, 'rooms', roomId, 'lanterns'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'desc'),
    limit(8)
  );
  const unsubLanterns = onSnapshot(
    lanternsQuery,
    (snap) => {
      const list: PondLanternState[] = snap.docs
        .map((d) => {
          const l = d.data() as {
            userId: string;
            displayName: string;
            wish: string;
            color: LanternColor;
            seed: number;
            createdAt?: { toMillis?: () => number };
          };
          return {
            id: d.id,
            userId: l.userId,
            displayName: l.displayName,
            wish: l.wish,
            color: l.color || 'gold',
            seed: typeof l.seed === 'number' ? l.seed : 0,
            createdAt: l.createdAt?.toMillis ? l.createdAt.toMillis() : Date.now(),
          };
        })
        .reverse();
      callbacks.onLanterns(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/lanterns`);
    }
  );

  const wishesQuery = query(
    collection(db, 'rooms', roomId, 'wishes'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'desc'),
    limit(16)
  );
  const unsubWishes = onSnapshot(
    wishesQuery,
    (snap) => {
      const list: TreeWishState[] = snap.docs
        .map((d) => {
          const w = d.data() as {
            userId: string;
            displayName: string;
            wish: string;
            seed: number;
            createdAt?: { toMillis?: () => number };
          };
          return {
            id: d.id,
            userId: w.userId,
            displayName: w.displayName,
            wish: w.wish,
            seed: typeof w.seed === 'number' ? w.seed : 0,
            createdAt: w.createdAt?.toMillis ? w.createdAt.toMillis() : Date.now(),
          };
        })
        .reverse();
      callbacks.onWishes(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/wishes`);
    }
  );

  const memorialsQuery = query(
    collection(db, 'rooms', roomId, 'memorials'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'desc'),
    limit(12)
  );
  const unsubMemorials = callbacks.onMemorials
    ? onSnapshot(
        memorialsQuery,
        (snap) => {
          const list: MemorialRecord[] = snap.docs
            .map((d) => {
              const m = d.data() as {
                userId: string;
                displayName: string;
                deceasedName: string;
                wish: string;
                createdAt?: { toMillis?: () => number };
              };
              return {
                id: d.id,
                userId: m.userId,
                displayName: m.displayName,
                deceasedName: m.deceasedName,
                wish: m.wish || '',
                createdAt: m.createdAt?.toMillis ? m.createdAt.toMillis() : Date.now(),
              };
            })
            .reverse();
          callbacks.onMemorials?.(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/memorials`);
        }
      )
    : () => {};

  const kitchenMealsQuery = query(
    collection(db, 'rooms', roomId, 'kitchenMeals'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'asc'),
    limit(12)
  );
  const unsubKitchenMeals = callbacks.onKitchenMeals
    ? onSnapshot(
        kitchenMealsQuery,
        (snap) => {
          const list: KitchenMealState[] = snap.docs.map((d) => {
            const k = d.data() as {
              foodId: VegetarianFoodId;
              drinkId: VegetarianDrinkId;
              orderedByUid: string;
              orderedByName: string;
              recipientMode: KitchenMealRecipientMode;
              targetUid: string;
              targetName: string;
              foodEaten: boolean;
              drinkDrunk: boolean;
              consumedByName?: string;
              createdAt?: { toMillis?: () => number };
            };
            return {
              id: d.id,
              foodId: k.foodId,
              drinkId: k.drinkId,
              orderedByUid: k.orderedByUid,
              orderedByName: k.orderedByName,
              recipientMode: k.recipientMode || 'self',
              targetUid: k.targetUid || '',
              targetName: k.targetName || k.orderedByName,
              foodEaten: Boolean(k.foodEaten),
              drinkDrunk: Boolean(k.drinkDrunk),
              consumedByName: k.consumedByName || '',
              createdAt: k.createdAt?.toMillis ? k.createdAt.toMillis() : Date.now(),
            };
          });
          callbacks.onKitchenMeals?.(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/kitchenMeals`);
        }
      )
    : () => {};

  return () => {
    unsubRoom();
    unsubPlayers();
    unsubMessages();
    unsubGarden();
    unsubLanterns();
    unsubWishes();
    unsubMemorials();
    unsubKitchenMeals();
  };
}

export async function syncPlayerPosition(
  roomId: string,
  uid: string,
  x: number,
  y: number,
  direction: Direction,
  pose: PlayerPose,
  currentCushionIndex: number | null,
  currentBenchIndex: number | null = null
): Promise<void> {
  const playerRef = doc(db, 'rooms', roomId, 'players', uid);
  try {
    if ((currentCushionIndex !== null || currentBenchIndex !== null) && pose === 'walk') {
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const roomData = roomSnap.data() as { cushions?: unknown[]; benches?: unknown[] };
        const cushions = normalizeCushionsArray(roomData.cushions).map((c) => (c === uid ? '' : c));
        const benches = normalizeBenchesArray(roomData.benches).map((b) => (b === uid ? '' : b));
        const batch = writeBatch(db);
        batch.update(roomRef, { cushions, benches, updatedAt: serverTimestamp() });
        batch.update(playerRef, {
          x,
          y,
          direction,
          pose,
          cushionIndex: -1,
          benchIndex: -1,
          lastActiveAt: Date.now(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        return;
      }
    }
    await updateDoc(playerRef, {
      x,
      y,
      direction,
      pose,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore transient movement throttle error if leaving room
  }
}

export async function sitOnTempleCushion(
  roomId: string,
  uid: string,
  cushionIndex: number,
  x: number,
  y: number
): Promise<void> {
  if (cushionIndex < 0 || cushionIndex >= CUSHION_POSITIONS.length) return;
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', uid);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const roomData = snap.data() as { cushions?: unknown[]; benches?: unknown[]; stupaSlots?: unknown[] };
    const cushions = normalizeCushionsArray(roomData.cushions);
    if (cushions[cushionIndex] && cushions[cushionIndex] !== uid) return;
    const nextCushions = cushions.map((c, idx) => (idx === cushionIndex ? uid : c === uid ? '' : c));
    const nextBenches = normalizeBenchesArray(roomData.benches).map((b) => (b === uid ? '' : b));
    const nextStupaSlots = normalizeStupaSlotsArray(roomData.stupaSlots).map((s) => (s === uid ? '' : s));

    const batch = writeBatch(db);
    batch.update(roomRef, {
      cushions: nextCushions,
      benches: nextBenches,
      stupaSlots: nextStupaSlots,
      updatedAt: serverTimestamp(),
    });
    batch.update(playerRef, {
      x,
      y,
      direction: 'up',
      pose: 'meditate',
      cushionIndex,
      benchIndex: -1,
      stupaSlot: -1,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }
}

export async function standFromTempleCushion(
  roomId: string,
  uid: string,
  newY: number
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', uid);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const roomData = snap.data() as { cushions?: unknown[]; benches?: unknown[] };
    const cushions = normalizeCushionsArray(roomData.cushions).map((c) => (c === uid ? '' : c));
    const benches = normalizeBenchesArray(roomData.benches).map((b) => (b === uid ? '' : b));
    const batch = writeBatch(db);
    batch.update(roomRef, { cushions, benches, updatedAt: serverTimestamp() });
    batch.update(playerRef, {
      y: newY,
      pose: 'idle',
      cushionIndex: -1,
      benchIndex: -1,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }
}

export async function sitOnPergolaBench(
  roomId: string,
  uid: string,
  benchIndex: number,
  _x: number,
  _y: number
): Promise<{ ok: boolean; reason?: string; slotIndex?: number; seatX?: number; seatY?: number }> {
  if (benchIndex < 0 || benchIndex >= PERGOLA_BENCH_SPECS.length) {
    return { ok: false, reason: 'Ghế đá không hợp lệ.' };
  }
  const bench = PERGOLA_BENCH_SPECS[benchIndex];
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', uid);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return { ok: false, reason: 'Không tìm thấy phòng chùa.' };
    const roomData = snap.data() as {
      memberIds?: unknown[];
      cushions?: unknown[];
      benches?: unknown[];
      stupaSlots?: unknown[];
    };
    const activeMembers = new Set(Array.isArray(roomData.memberIds) ? roomData.memberIds : []);
    const benches = normalizeBenchesArray(roomData.benches).map((holder) =>
      holder && activeMembers.has(holder) ? holder : ''
    );
    const slot0 = benchIndex * 2;
    const slot1 = benchIndex * 2 + 1;
    let assignedSlot = -1;
    if (benches[slot0] === uid) {
      assignedSlot = slot0;
    } else if (benches[slot1] === uid) {
      assignedSlot = slot1;
    } else if (!benches[slot0]) {
      assignedSlot = slot0;
    } else if (!benches[slot1]) {
      assignedSlot = slot1;
    }
    if (assignedSlot === -1) {
      return { ok: false, reason: 'Ghế đá này hiện đã đủ 2/2 hành giả đang ngồi nghỉ.' };
    }
    const seatOffset = assignedSlot % 2 === 0 ? -19 : 19;
    const seatX = bench.x + seatOffset;
    const seatY = bench.y;

    const nextBenches = benches.map((b, idx) => (idx === assignedSlot ? uid : b === uid ? '' : b));
    const nextCushions = normalizeCushionsArray(roomData.cushions).map((c) => (c === uid ? '' : c));
    const nextStupaSlots = normalizeStupaSlotsArray(roomData.stupaSlots).map((s) => (s === uid ? '' : s));

    const batch = writeBatch(db);
    batch.update(roomRef, {
      benches: nextBenches,
      cushions: nextCushions,
      stupaSlots: nextStupaSlots,
      updatedAt: serverTimestamp(),
    });
    batch.update(playerRef, {
      x: seatX,
      y: seatY,
      direction: 'down',
      pose: 'sit',
      cushionIndex: -1,
      benchIndex: assignedSlot,
      stupaSlot: -1,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, slotIndex: assignedSlot, seatX, seatY };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }
}

export async function standFromPergolaBench(
  roomId: string,
  uid: string,
  newY: number
): Promise<void> {
  await standFromTempleCushion(roomId, uid, newY);
}

export async function ascendTempleStupa(
  roomId: string,
  uid: string
): Promise<{ ok: boolean; slot: number | null; reason?: string }> {
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', uid);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      return { ok: false, slot: null, reason: 'Không tìm thấy thông tin chùa.' };
    }
    const data = snap.data() as {
      memberIds?: string[];
      cushions?: unknown[];
      benches?: unknown[];
      stupaSlots?: unknown[];
    };
    const activeMembers = new Set(Array.isArray(data.memberIds) ? data.memberIds : []);
    // Purge stale slots whose users are no longer active members in the room
    const cleanedSlots = normalizeStupaSlotsArray(data.stupaSlots).map((holder) =>
      holder && activeMembers.has(holder) ? holder : ''
    );

    let assignedSlot = cleanedSlots.findIndex((holder) => holder === uid);
    if (assignedSlot === -1) {
      assignedSlot = cleanedSlots.findIndex((holder) => !holder);
    }
    if (assignedSlot === -1) {
      return {
        ok: false,
        slot: null,
        reason: 'Đài Quan Sát Bảo Tháp tầng 9 hiện đã đủ 3/3 hành giả. Vui lòng đợi một hành giả xuống tháp.',
      };
    }

    const nextStupaSlots = cleanedSlots.map((holder, idx) =>
      idx === assignedSlot ? uid : holder === uid ? '' : holder
    );
    const nextCushions = normalizeCushionsArray(data.cushions).map((c) => (c === uid ? '' : c));
    const nextBenches = normalizeBenchesArray(data.benches).map((b) => (b === uid ? '' : b));
    const slotPos = STUPA_DECK_SLOTS[assignedSlot] ?? STUPA_DECK_SLOTS[0];

    const batch = writeBatch(db);
    batch.update(roomRef, {
      stupaSlots: nextStupaSlots,
      cushions: nextCushions,
      benches: nextBenches,
      updatedAt: serverTimestamp(),
    });
    batch.update(playerRef, {
      x: slotPos.x,
      y: slotPos.y,
      direction: 'down',
      pose: 'idle',
      cushionIndex: -1,
      benchIndex: -1,
      stupaSlot: assignedSlot,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, slot: assignedSlot };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }
}

export async function descendTempleStupa(
  roomId: string,
  uid: string,
  groundX = INTERACTABLES.stupa.x,
  groundY = INTERACTABLES.stupa.y
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', uid);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const data = snap.data() as { stupaSlots?: unknown[] };
    const nextStupaSlots = normalizeStupaSlotsArray(data.stupaSlots).map((s) =>
      s === uid ? '' : s
    );
    const batch = writeBatch(db);
    batch.update(roomRef, {
      stupaSlots: nextStupaSlots,
      updatedAt: serverTimestamp(),
    });
    batch.update(playerRef, {
      x: groundX,
      y: groundY,
      direction: 'down',
      pose: 'idle',
      stupaSlot: -1,
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch {
    // Best-effort cleanup if leaving room
  }
}

export async function triggerTempleRitual(
  roomId: string,
  user: PublicUser,
  action: RitualAction
): Promise<void> {
  const verbMap: Record<RitualAction, string> = {
    incense: 'vừa thành tâm thắp một nén nhang.',
    bow: 'vừa thành tâm đảnh lễ, lạy Phật trong Chánh Điện.',
    bell: 'vừa thỉnh tiếng Đại Hồng Chung.',
    woodfish: 'vừa gõ nhịp mõ tĩnh tâm.',
    fortune: 'vừa gieo một quẻ xăm bình an.',
    sweep: 'vừa quét lá bồ đề giữ sân chùa thanh tịnh.',
    fish: 'vừa thả cá phóng sinh nơi ao sen.',
    flower: 'vừa chăm sóc Vườn Hoa Liên Tâm.',
    lantern: 'vừa thả hoa đăng nguyện cầu bình an.',
    feed_koi: 'vừa rắc cám thơm cho đàn cá Koi nơi ao sen.',
    feed_birds: 'vừa rải thóc thơm cho đàn chim bồ câu và chim sẻ nơi Vườn Hoa Giấy.',
    wish: 'vừa ném dải băng đỏ gửi điều ước lên Cây Nguyện Ước.',
    kitchen_menu: 'vừa ghé Gian Bếp Chay chọn món thanh đạm.',
    kitchen_table: 'vừa thưởng thức bữa cơm chay và nước uống thanh lành.',
    kitchen_sink: 'vừa rửa bát, rửa ly sạch sẽ nơi Gian Bếp Chay (+1 Công đức).',
    memorial: 'vừa làm lễ cầu siêu nơi Công Viên Cầu Siêu.',
    stupa: 'vừa bước lên Bảo Tháp ngắm toàn cảnh thiền viện từ trên cao.',
  };

  const batch = writeBatch(db);
  if (action === 'incense') {
    batch.update(doc(db, 'rooms', roomId), {
      incenseCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
      incenseCount: increment(1),
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } else if (action === 'bow') {
    batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
      bowCount: increment(1),
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } else if (action === 'bell') {
    batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
      bellCount: increment(1),
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } else if (action === 'sweep') {
    batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
      sweepCount: increment(1),
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } else if (action === 'fish') {
    batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
      fishCount: increment(1),
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } else if (action === 'feed_koi') {
    batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
      koiFeedCount: increment(1),
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } else if (action === 'kitchen_sink') {
    batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
      kitchenWashCount: increment(1),
      lastActiveAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  }

  const msgId = `ritual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: `${user.displayName} ${verbMap[action]}`.slice(0, 140),
    kind: 'ritual',
    action,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/messages/${msgId}`);
  }
}

export async function plantTempleFlower(
  roomId: string,
  user: PublicUser,
  plotIndex: number,
  species: Exclude<FlowerSpecies, 'none'>
): Promise<void> {
  const plotId = `plot-${plotIndex}`;
  const plotRef = doc(db, 'rooms', roomId, 'gardenPlots', plotId);
  const flowerName = FLOWER_CATALOG.find((f) => f.id === species)?.name ?? 'Hoa';
  const msgId = `flower-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const batch = writeBatch(db);
  batch.set(plotRef, {
    plotIndex,
    species,
    stage: 1,
    waterCount: 1,
    plantedAt: Date.now(),
    plantedBy: user.displayName.slice(0, 28),
    plantedByUid: user.id,
    lastWateredBy: user.displayName.slice(0, 28),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: `${user.displayName} vừa gieo mầm ${flowerName} tại luống ${plotIndex + 1}.`.slice(0, 140),
    kind: 'ritual',
    action: 'flower',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/gardenPlots/${plotId}`);
  }
}

export async function waterTempleFlower(
  roomId: string,
  user: PublicUser,
  plot: GardenPlotState
): Promise<void> {
  if (plot.species === 'none' || plot.stage >= 3) return;
  const plotId = `plot-${plot.plotIndex}`;
  const plotRef = doc(db, 'rooms', roomId, 'gardenPlots', plotId);
  const nextStage = Math.min(3, plot.stage + 1) as 1 | 2 | 3;
  const nextWater = Math.min(3, plot.waterCount + 1);
  const flowerName = FLOWER_CATALOG.find((f) => f.id === plot.species)?.name ?? 'Hoa';
  const msgId = `water-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const batch = writeBatch(db);
  batch.update(plotRef, {
    stage: nextStage,
    waterCount: nextWater,
    lastWateredBy: user.displayName.slice(0, 28),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: (
      nextStage === 3
        ? `${user.displayName} vừa tưới nước giúp ${flowerName} (luống ${plot.plotIndex + 1}) nở rộ!`
        : `${user.displayName} vừa tưới nước chăm ${flowerName} ở luống ${plot.plotIndex + 1}.`
    ).slice(0, 140),
    kind: 'ritual',
    action: 'flower',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/gardenPlots/${plotId}`);
  }
}

export async function offerTempleFlower(
  roomId: string,
  user: PublicUser,
  plot: GardenPlotState
): Promise<void> {
  const plotId = `plot-${plot.plotIndex}`;
  const plotRef = doc(db, 'rooms', roomId, 'gardenPlots', plotId);
  const flowerName = FLOWER_CATALOG.find((f) => f.id === plot.species)?.name ?? 'Hoa tươi';
  const msgId = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const batch = writeBatch(db);
  batch.update(plotRef, {
    species: 'none',
    stage: 0,
    waterCount: 0,
    plantedAt: 0,
    plantedBy: '',
    plantedByUid: '',
    lastWateredBy: '',
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
    flowerCount: increment(1),
    lastActiveAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: `${user.displayName} vừa hái ${flowerName} nở rộ dâng lên Tam Bảo.`.slice(0, 140),
    kind: 'ritual',
    action: 'flower',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/gardenPlots/${plotId}`);
  }
}

export async function clearTempleFlowerPlot(
  roomId: string,
  plotIndex: number
): Promise<void> {
  const plotId = `plot-${plotIndex}`;
  const plotRef = doc(db, 'rooms', roomId, 'gardenPlots', plotId);
  try {
    await setDoc(plotRef, {
      plotIndex,
      species: 'none',
      stage: 0,
      waterCount: 0,
      plantedAt: 0,
      plantedBy: '',
      plantedByUid: '',
      lastWateredBy: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/gardenPlots/${plotId}`);
  }
}

export async function releasePondLantern(
  roomId: string,
  user: PublicUser,
  rawWish: string,
  color: LanternColor
): Promise<void> {
  const cleanWish = (rawWish.trim() || 'Cầu chúc bình an, tâm sáng trí thanh').slice(0, 60);
  const lanternId = `lantern-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const msgId = `ritual-lantern-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', roomId, 'lanterns', lanternId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    wish: cleanWish,
    color,
    seed: Math.floor(Math.random() * 99),
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
    lanternCount: increment(1),
    lastActiveAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: `${user.displayName} vừa thả hoa đăng: “${cleanWish}”`.slice(0, 140),
    kind: 'ritual',
    action: 'lantern',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/lanterns/${lanternId}`);
  }
}

export async function cleanupExcessPondLanterns(
  roomId: string,
  lanterns: PondLanternState[],
  ttlMs = 95_000
): Promise<void> {
  // Always keep 1-2 serene newest lanterns floating on Ao Sen
  if (lanterns.length <= 2) return;
  const now = Date.now();
  const sortedOldestFirst = [...lanterns].sort((a, b) => a.createdAt - b.createdAt);
  const candidates = sortedOldestFirst.slice(0, sortedOldestFirst.length - 2);
  const expired = candidates.filter((l) => now - l.createdAt >= ttlMs);
  if (expired.length === 0) return;

  for (const item of expired) {
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'lanterns', item.id));
    } catch {
      // best-effort cleanup if another member removed it concurrently
    }
  }
}

export async function performMemorialCeremony(
  roomId: string,
  user: PublicUser,
  rawDeceasedName: string,
  rawWish: string
): Promise<void> {
  const cleanName = rawDeceasedName.trim().slice(0, 36);
  if (!cleanName) return;
  const cleanWish = (rawWish.trim() || 'Nguyện hương linh siêu sinh tịnh độ, an lạc thanh thản.').slice(0, 80);
  const memorialId = `memorial-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const msgId = `ritual-memorial-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', roomId, 'memorials', memorialId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    deceasedName: cleanName,
    wish: cleanWish,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
    memorialCount: increment(1),
    lastActiveAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: `${user.displayName} vừa làm lễ cầu siêu cho hương linh “${cleanName}”.`.slice(0, 140),
    kind: 'ritual',
    action: 'memorial',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/memorials/${memorialId}`);
  }
}

export async function orderSharedKitchenMealsInFirestore(
  roomId: string,
  sender: PublicUser,
  foodId: VegetarianFoodId,
  drinkId: VegetarianDrinkId,
  recipientMode: KitchenMealRecipientMode,
  targetPlayer: { userId: string; displayName: string } | null,
  allPlayers: RoomPlayer[],
  existingMeals: KitchenMealState[]
): Promise<{ count: number; targetSummary: string }> {
  const foodName = VEGETARIAN_FOOD_MENU.find((f) => f.id === foodId)?.name ?? 'Món chay';
  const drinkName = VEGETARIAN_DRINK_MENU.find((d) => d.id === drinkId)?.name ?? 'Nước uống';
  const senderName = sender.displayName.slice(0, 28) || 'Hành Giả';

  const targets: Array<{ mode: KitchenMealRecipientMode; uid: string; name: string }> = [];
  if (recipientMode === 'all') {
    const others = allPlayers.filter((p) => p.userId !== sender.id);
    if (others.length > 0) {
      targets.push({ mode: 'all', uid: sender.id, name: senderName });
      for (const p of others.slice(0, 5)) {
        targets.push({
          mode: 'all',
          uid: p.userId,
          name: p.displayName.slice(0, 28) || 'Bạn đồng tu',
        });
      }
    } else {
      targets.push({ mode: 'all', uid: '', name: 'Mọi người' });
    }
  } else if (recipientMode === 'player' && targetPlayer) {
    targets.push({
      mode: 'player',
      uid: targetPlayer.userId,
      name: targetPlayer.displayName.slice(0, 28) || 'Bạn đồng tu',
    });
  } else {
    targets.push({ mode: 'self', uid: sender.id, name: senderName });
  }

  const MAX_TABLE_PORTIONS = 6;
  const batch = writeBatch(db);

  // Trim finished/oldest portions if table would exceed capacity
  const excess = Math.max(0, existingMeals.length + targets.length - MAX_TABLE_PORTIONS);
  if (excess > 0) {
    const sortedForEviction = [...existingMeals].sort((a, b) => {
      const aDone = a.foodEaten && a.drinkDrunk ? 0 : 1;
      const bDone = b.foodEaten && b.drinkDrunk ? 0 : 1;
      if (aDone !== bDone) return aDone - bDone;
      return a.createdAt - b.createdAt;
    });
    for (const stale of sortedForEviction.slice(0, excess)) {
      batch.delete(doc(db, 'rooms', roomId, 'kitchenMeals', stale.id));
    }
  }

  const nowTs = Date.now();
  targets.forEach((t, idx) => {
    const mealId = `meal-${nowTs}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    batch.set(doc(db, 'rooms', roomId, 'kitchenMeals', mealId), {
      foodId,
      drinkId,
      orderedByUid: sender.id,
      orderedByName: senderName,
      recipientMode: t.mode,
      targetUid: t.uid,
      targetName: t.name,
      foodEaten: false,
      drinkDrunk: false,
      consumedByName: '',
      createdAt: serverTimestamp(),
    });
  });

  const targetSummary =
    recipientMode === 'all'
      ? 'tất cả hành giả'
      : recipientMode === 'player' && targetPlayer
      ? targetPlayer.displayName
      : 'bản thân';

  const msgId = `kitchen-${nowTs}-${Math.random().toString(36).slice(2, 6)}`;
  const inviteText =
    recipientMode === 'self'
      ? `${senderName} vừa bày ${foodName} & ${drinkName} tại Gian Bếp Chay.`
      : `${senderName} vừa gọi ${foodName} & ${drinkName} mời ${targetSummary} cùng dùng tại Gian Bếp Chay.`;
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: sender.id,
    displayName: senderName,
    characterId: sender.characterId,
    text: inviteText.slice(0, 140),
    kind: 'ritual',
    action: 'kitchen_menu',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return { count: targets.length, targetSummary };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/kitchenMeals`);
  }
}

export async function consumeKitchenMealInFirestore(
  roomId: string,
  meal: KitchenMealState,
  consumeKind: 'food' | 'drink',
  consumerName: string
): Promise<void> {
  const ref = doc(db, 'rooms', roomId, 'kitchenMeals', meal.id);
  try {
    await updateDoc(ref, {
      foodEaten: consumeKind === 'food' ? true : meal.foodEaten,
      drinkDrunk: consumeKind === 'drink' ? true : meal.drinkDrunk,
      consumedByName: consumerName.slice(0, 28),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/kitchenMeals/${meal.id}`);
  }
}

export async function washKitchenDishesInFirestore(
  roomId: string,
  user: PublicUser,
  finishedMealIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  for (const id of finishedMealIds) {
    batch.delete(doc(db, 'rooms', roomId, 'kitchenMeals', id));
  }
  batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
    kitchenWashCount: increment(1),
    lastActiveAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  const msgId = `wash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: `${user.displayName} vừa rửa bát, rửa ly sạch sẽ nơi Gian Bếp Chay (+1 Công đức).`.slice(0, 140),
    kind: 'ritual',
    action: 'kitchen_sink',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/kitchenMeals`);
  }
}

export async function tossWishRibbon(
  roomId: string,
  user: PublicUser,
  rawWish: string
): Promise<void> {
  const cleanWish = (rawWish.trim() || 'Cầu gia đạo bình an, tâm thân thường lạc').slice(0, 60);
  const wishId = `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const msgId = `ritual-wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', roomId, 'wishes', wishId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    wish: cleanWish,
    seed: Math.floor(Math.random() * 99),
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
    wishCount: increment(1),
    lastActiveAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName.slice(0, 28),
    characterId: user.characterId,
    text: `${user.displayName} vừa ném dải băng đỏ lên Cây Nguyện Ước: “${cleanWish}”`.slice(0, 140),
    kind: 'ritual',
    action: 'wish',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/wishes/${wishId}`);
  }
}

export async function sendRoomChatMessage(
  roomId: string,
  user: PublicUser,
  rawText: string
): Promise<void> {
  const text = rawText.trim().slice(0, 140);
  if (!text) return;

  const msgId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    userId: user.id,
    displayName: user.displayName,
    characterId: user.characterId,
    text,
    kind: 'chat',
    action: 'none',
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', roomId, 'players', user.id), {
    chatText: text,
    chatExpiresAt: Date.now() + 5500,
    lastActiveAt: Date.now(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/messages/${msgId}`);
  }
}

export function subscribeMusic(
  onTracks: (tracks: MusicTrack[]) => void,
  onMusicState: (state: MusicState) => void
): Unsubscribe {
  const tracksQuery = query(
    collection(db, 'tracks'),
    where('sourceType', 'in', ['builtin', 'upload'])
  );
  const unsubTracks = onSnapshot(
    tracksQuery,
    (snap) => {
      const list: MusicTrack[] = snap.docs.map((d) => {
        const t = d.data() as {
          title: string;
          artist: string;
          sourceType: 'builtin' | 'upload';
          audioUrl?: string;
          sizeBytes?: number;
          uploadedBy: string;
          ownerId?: string;
          createdAt?: { toMillis?: () => number };
        };
        return {
          id: d.id,
          title: t.title,
          artist: t.artist,
          sourceType: t.sourceType,
          audioUrl: t.audioUrl,
          sizeBytes: t.sizeBytes,
          uploadedBy: t.uploadedBy,
          ownerId: t.ownerId,
          createdAt: t.createdAt?.toMillis ? t.createdAt.toMillis() : 0,
        };
      });
      list.sort((a, b) => {
        if (a.id === 'default-zen') return -1;
        if (b.id === 'default-zen') return 1;
        return a.createdAt - b.createdAt;
      });
      onTracks(list.length > 0 ? list : [DEFAULT_ZEN_TRACK]);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tracks');
    }
  );

  const unsubSettings = onSnapshot(
    doc(db, 'settings', 'music'),
    (snap) => {
      if (!snap.exists()) return;
      const s = snap.data() as {
        activeTrackId: string;
        isPlaying: boolean;
        playMode?: MusicPlayMode;
        playlistTrackIds?: unknown;
        updatedBy: string;
        updatedAt?: { toMillis?: () => number };
      };
      const rawIds = Array.isArray(s.playlistTrackIds)
        ? s.playlistTrackIds.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 128).slice(0, 50)
        : [];
      onMusicState({
        activeTrackId: s.activeTrackId || 'default-zen',
        isPlaying: Boolean(s.isPlaying),
        playMode: s.playMode === 'playlist' ? 'playlist' : 'single',
        playlistTrackIds: rawIds,
        updatedBy: s.updatedBy || 'Hệ thống',
        updatedAt: s.updatedAt?.toMillis ? s.updatedAt.toMillis() : Date.now(),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/music');
    }
  );

  return () => {
    unsubTracks();
    unsubSettings();
  };
}

export async function adminUploadTrackToFirestore(
  admin: PublicUser,
  params: { title: string; artist: string; audioUrl: string; sizeBytes: number }
): Promise<void> {
  const trackId = `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `tracks/${trackId}`;
  try {
    await setDoc(doc(db, 'tracks', trackId), {
      title: params.title.slice(0, 80),
      artist: params.artist.slice(0, 60),
      sourceType: 'upload',
      audioUrl: params.audioUrl,
      sizeBytes: params.sizeBytes,
      uploadedBy: admin.displayName.slice(0, 28),
      ownerId: admin.id,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminDeleteTrackFromFirestore(
  trackId: string,
  currentState: MusicState,
  adminName: string
): Promise<void> {
  if (trackId === 'default-zen') return;
  const path = `tracks/${trackId}`;
  try {
    await deleteDoc(doc(db, 'tracks', trackId));
    const filteredPlaylist = (currentState.playlistTrackIds ?? []).filter((id) => id !== trackId);
    const playlistChanged =
      filteredPlaylist.length !== (currentState.playlistTrackIds ?? []).length;

    if (currentState.activeTrackId === trackId || playlistChanged) {
      const nextTrackId =
        currentState.activeTrackId === trackId
          ? filteredPlaylist[0] || 'default-zen'
          : currentState.activeTrackId;
      await updateDoc(doc(db, 'settings', 'music'), {
        activeTrackId: nextTrackId,
        isPlaying: currentState.activeTrackId === trackId ? true : currentState.isPlaying,
        playMode: currentState.playMode === 'playlist' ? 'playlist' : 'single',
        playlistTrackIds: filteredPlaylist,
        updatedBy: adminName.slice(0, 28),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminControlMusicInFirestore(
  adminName: string,
  action: 'play' | 'pause' | 'toggle' | 'select' | 'next' | 'prev' | 'setPlaylist',
  tracks: MusicTrack[],
  current: MusicState,
  trackId?: string,
  options?: {
    playMode?: MusicPlayMode;
    playlistTrackIds?: string[];
    autoStart?: boolean;
  }
): Promise<void> {
  const validTrackIds = new Set(tracks.map((t) => t.id));
  const nextPlayMode: MusicPlayMode =
    options?.playMode ?? (current.playMode === 'playlist' ? 'playlist' : 'single');
  const rawPlaylist = options?.playlistTrackIds ?? current.playlistTrackIds ?? [];
  const nextPlaylistIds: string[] = [];
  const seen = new Set<string>();
  for (const id of rawPlaylist) {
    if (!seen.has(id) && validTrackIds.has(id) && nextPlaylistIds.length < 50) {
      seen.add(id);
      nextPlaylistIds.push(id);
    }
  }

  const effectiveTracks = resolveEffectivePlaylist(tracks, {
    ...current,
    playMode: nextPlayMode,
    playlistTrackIds: nextPlaylistIds,
  });
  const currentIdxInEffective = effectiveTracks.findIndex(
    (t) => t.id === current.activeTrackId
  );
  let nextTrackId = current.activeTrackId;
  let nextPlaying = current.isPlaying;

  if (action === 'select' && trackId) {
    nextTrackId = trackId;
    nextPlaying = true;
  } else if (action === 'play') {
    nextPlaying = true;
  } else if (action === 'pause') {
    nextPlaying = false;
  } else if (action === 'toggle') {
    nextPlaying = !current.isPlaying;
  } else if (action === 'next' && effectiveTracks.length > 0) {
    const safeIdx = currentIdxInEffective >= 0 ? currentIdxInEffective : -1;
    nextTrackId = effectiveTracks[(safeIdx + 1) % effectiveTracks.length].id;
    nextPlaying = true;
  } else if (action === 'prev' && effectiveTracks.length > 0) {
    const safeIdx = currentIdxInEffective >= 0 ? currentIdxInEffective : 0;
    nextTrackId =
      effectiveTracks[(safeIdx - 1 + effectiveTracks.length) % effectiveTracks.length].id;
    nextPlaying = true;
  } else if (action === 'setPlaylist') {
    if (
      nextPlayMode === 'playlist' &&
      nextPlaylistIds.length > 0 &&
      (options?.autoStart || !nextPlaylistIds.includes(current.activeTrackId))
    ) {
      nextTrackId = nextPlaylistIds[0];
      nextPlaying = true;
    }
  }

  try {
    await updateDoc(doc(db, 'settings', 'music'), {
      activeTrackId: nextTrackId,
      isPlaying: nextPlaying,
      playMode: nextPlayMode,
      playlistTrackIds: nextPlaylistIds,
      updatedBy: adminName.slice(0, 28),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'settings/music');
  }
}

// --- Shared Weather & Time Atmosphere (Primary Admin & Sub-Admin) ---
export function subscribeSharedAtmosphere(
  onUpdate: (setting: AtmosphereSetting) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'settings', 'atmosphere'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_ATMOSPHERE);
        return;
      }
      const d = snap.data() as {
        time?: TimeOfDayPreset;
        weather?: WeatherPreset;
        updatedBy?: string;
        updatedAt?: { toMillis?: () => number };
      };
      onUpdate({
        time: d.time && ['auto', 'dawn', 'day', 'sunset', 'night'].includes(d.time) ? d.time : 'auto',
        weather: d.weather && ['auto', 'clear', 'breeze', 'mist', 'rain'].includes(d.weather) ? d.weather : 'auto',
        updatedBy: d.updatedBy || 'Hệ thống',
        updatedAt: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/atmosphere');
    }
  );
}

export async function updateSharedAtmosphere(
  actorName: string,
  time: TimeOfDayPreset,
  weather: WeatherPreset
): Promise<void> {
  const ref = doc(db, 'settings', 'atmosphere');
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        time,
        weather,
        updatedBy: actorName.slice(0, 28),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        time,
        weather,
        updatedBy: actorName.slice(0, 28),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/atmosphere');
  }
}

// --- Sub-Admin Delegation (Primary Admin Only) ---
export function subscribeSubAdminStatus(
  uid: string,
  onChange: (isSubAdmin: boolean) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'subadmins', uid),
    (snap) => {
      onChange(snap.exists());
    },
    () => {
      onChange(false);
    }
  );
}

export function subscribeAllSubAdmins(
  onChange: (records: SubAdminRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'subadmins'),
    where('characterId', 'in', ['tieu-su', 'ao-lam', 'cu-si', 'sen-hong', 'hanh-huong'])
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: SubAdminRecord[] = snap.docs.map((d) => {
        const s = d.data() as {
          uid: string;
          displayName: string;
          characterId: CharacterId;
          appointedBy: string;
          createdAt?: { toMillis?: () => number };
        };
        return {
          uid: s.uid,
          displayName: s.displayName,
          characterId: s.characterId,
          appointedBy: s.appointedBy,
          createdAt: s.createdAt?.toMillis ? s.createdAt.toMillis() : Date.now(),
        };
      });
      onChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'subadmins');
    }
  );
}

export async function listRegisteredUsersForAdmin(): Promise<PublicUser[]> {
  try {
    const q = query(collection(db, 'users_public'), where('role', 'in', ['admin', 'player']));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const u = d.data() as {
        uid: string;
        displayName: string;
        characterId: CharacterId;
        role: UserRole;
      };
      return {
        id: u.uid,
        username: u.uid.slice(0, 10),
        displayName: u.displayName,
        characterId: u.characterId,
        role: u.role,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users_public');
  }
}

export async function appointSubAdmin(
  targetUser: { id: string; displayName: string; characterId: CharacterId },
  adminName: string
): Promise<void> {
  try {
    await setDoc(doc(db, 'subadmins', targetUser.id), {
      uid: targetUser.id,
      displayName: targetUser.displayName.slice(0, 28),
      characterId: targetUser.characterId,
      appointedBy: adminName.slice(0, 28),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `subadmins/${targetUser.id}`);
  }
}

export async function revokeSubAdmin(targetUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'subadmins', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `subadmins/${targetUid}`);
  }
}
