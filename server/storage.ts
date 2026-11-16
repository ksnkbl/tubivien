import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CharacterId, MusicState, MusicTrack, PublicUser, UserRole } from '../src/shared/types.ts';

export interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  characterId: CharacterId;
  createdAt: number;
}

interface DatabaseSchema {
  users: StoredUser[];
  tracks: MusicTrack[];
  musicState: MusicState;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const SECRET_PATH = path.join(DATA_DIR, 'secret.key');

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function getOrCreateSecret(): string {
  ensureDirectories();
  if (fs.existsSync(SECRET_PATH)) {
    return fs.readFileSync(SECRET_PATH, 'utf8').trim();
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_PATH, secret, 'utf8');
  return secret;
}

const TOKEN_SECRET = getOrCreateSecret();

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (hashBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, storedBuf);
}

export function signToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string;
      exp: number;
    };
    if (!decoded.sub || Date.now() > decoded.exp) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

export const DEFAULT_ZEN_TRACK: MusicTrack = {
  id: 'default-zen',
  title: 'Thiền Tâm Nhã Khúc (Mặc định)',
  artist: 'Chuông Chùa & Sáo Trúc',
  sourceType: 'builtin',
  uploadedBy: 'Hệ thống',
  createdAt: Date.now(),
};

function createInitialDatabase(): DatabaseSchema {
  const { hash, salt } = hashPassword('admin123');
  const adminUser: StoredUser = {
    id: 'user-admin-root',
    username: 'admin',
    displayName: 'Trụ Trì (Admin)',
    passwordHash: hash,
    salt,
    role: 'admin',
    characterId: 'tieu-su',
    createdAt: Date.now(),
  };

  return {
    users: [adminUser],
    tracks: [DEFAULT_ZEN_TRACK],
    musicState: {
      activeTrackId: DEFAULT_ZEN_TRACK.id,
      isPlaying: true,
      updatedAt: Date.now(),
      updatedBy: 'Hệ thống',
    },
  };
}

let dbCache: DatabaseSchema | null = null;

function loadDb(): DatabaseSchema {
  if (dbCache) return dbCache;
  ensureDirectories();
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    dbCache = initial;
    return dbCache;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!parsed.tracks?.some((t) => t.id === DEFAULT_ZEN_TRACK.id)) {
      parsed.tracks = [DEFAULT_ZEN_TRACK, ...(parsed.tracks || [])];
    }
    if (!parsed.users?.some((u) => u.role === 'admin')) {
      const initial = createInitialDatabase();
      parsed.users = [initial.users[0], ...(parsed.users || [])];
    }
    if (!parsed.musicState) {
      parsed.musicState = {
        activeTrackId: DEFAULT_ZEN_TRACK.id,
        isPlaying: true,
        updatedAt: Date.now(),
        updatedBy: 'Hệ thống',
      };
    }
    dbCache = parsed;
    return dbCache;
  } catch {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    dbCache = initial;
    return dbCache;
  }
}

function saveDb(db: DatabaseSchema) {
  ensureDirectories();
  dbCache = db;
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    characterId: user.characterId,
  };
}

export function findUserByUsername(username: string): StoredUser | undefined {
  const db = loadDb();
  const normalized = username.trim().toLowerCase();
  return db.users.find((u) => u.username.toLowerCase() === normalized);
}

export function findUserById(userId: string): StoredUser | undefined {
  const db = loadDb();
  return db.users.find((u) => u.id === userId);
}

export function createPlayerUser(params: {
  username: string;
  displayName: string;
  password: string;
  characterId: CharacterId;
}): PublicUser {
  const db = loadDb();
  const { hash, salt } = hashPassword(params.password);
  const newUser: StoredUser = {
    id: `user-${crypto.randomUUID()}`,
    username: params.username.trim(),
    displayName: params.displayName.trim(),
    passwordHash: hash,
    salt,
    role: 'player',
    characterId: params.characterId,
    createdAt: Date.now(),
  };
  db.users.push(newUser);
  saveDb(db);
  return toPublicUser(newUser);
}

export function updateUserProfile(
  userId: string,
  updates: { characterId?: CharacterId; displayName?: string }
): PublicUser | null {
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (updates.characterId) {
    user.characterId = updates.characterId;
  }
  if (updates.displayName && updates.displayName.trim().length > 0) {
    user.displayName = updates.displayName.trim().slice(0, 28);
  }
  saveDb(db);
  return toPublicUser(user);
}

export function getAllTracks(): MusicTrack[] {
  const db = loadDb();
  return db.tracks;
}

export function getTrackById(trackId: string): MusicTrack | undefined {
  const db = loadDb();
  return db.tracks.find((t) => t.id === trackId);
}

export function addUploadedTrack(track: MusicTrack): MusicTrack[] {
  const db = loadDb();
  db.tracks.push(track);
  saveDb(db);
  return db.tracks;
}

export function deleteTrackById(trackId: string): { deleted: boolean; tracks: MusicTrack[]; musicState: MusicState } {
  const db = loadDb();
  if (trackId === DEFAULT_ZEN_TRACK.id) {
    return { deleted: false, tracks: db.tracks, musicState: db.musicState };
  }
  const target = db.tracks.find((t) => t.id === trackId);
  if (!target) {
    return { deleted: false, tracks: db.tracks, musicState: db.musicState };
  }
  if (target.fileName) {
    const filePath = path.join(UPLOADS_DIR, target.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  db.tracks = db.tracks.filter((t) => t.id !== trackId);
  if (db.musicState.activeTrackId === trackId) {
    db.musicState = {
      activeTrackId: DEFAULT_ZEN_TRACK.id,
      isPlaying: true,
      updatedAt: Date.now(),
      updatedBy: 'Hệ thống',
    };
  }
  saveDb(db);
  return { deleted: true, tracks: db.tracks, musicState: db.musicState };
}

export function getMusicState(): MusicState {
  const db = loadDb();
  return db.musicState;
}

export function updateMusicState(next: Partial<MusicState>): MusicState {
  const db = loadDb();
  db.musicState = {
    ...db.musicState,
    ...next,
    updatedAt: Date.now(),
  };
  saveDb(db);
  return db.musicState;
}
