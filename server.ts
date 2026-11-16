import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  addUploadedTrack,
  createPlayerUser,
  DEFAULT_ZEN_TRACK,
  deleteTrackById,
  findUserById,
  findUserByUsername,
  getAllTracks,
  getMusicState,
  getTrackById,
  signToken,
  toPublicUser,
  updateMusicState,
  updateUserProfile,
  UPLOADS_DIR,
  verifyPassword,
  verifyToken,
} from './server/storage.ts';
import {
  broadcastToAllRooms,
  createRoom,
  handleChat,
  handleTempleAction,
  joinRoom,
  leaveRoom,
  listRooms,
  movePlayer,
  sitOnCushion,
  standUpFromCushion,
  updatePlayerProfileInRooms,
} from './server/rooms.ts';
import { CHARACTERS, type CharacterId, type Direction, type MusicTrack, type PlayerPose, type PublicUser } from './src/shared/types.ts';

const PORT = 3000;
const VALID_CHARACTER_IDS = new Set<CharacterId>(CHARACTERS.map((c) => c.id));

const app = express();
app.use(express.json({ limit: '2mb' }));

// Configure Multer for admin audio uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    cb(null, `track-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB cap to stay lightweight
  fileFilter: (_req, file, cb) => {
    const allowedExt = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm', '.flac']);
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('audio/') || allowedExt.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ hỗ trợ tệp âm thanh (.mp3, .wav, .ogg, .m4a, .webm).'));
    }
  },
});

function getAuthUser(req: express.Request): PublicUser | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  const userId = verifyToken(token);
  if (!userId) return null;
  const stored = findUserById(userId);
  return stored ? toPublicUser(stored) : null;
}

function requireAuth(req: express.Request, res: express.Response): PublicUser | null {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
    return null;
  }
  return user;
}

function requireAdmin(req: express.Request, res: express.Response): PublicUser | null {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Chỉ quản trị viên mới có quyền điều khiển âm nhạc.' });
    return null;
  }
  return user;
}

// --- Auth Routes ---
app.post('/api/auth/register', (req, res) => {
  const { username, password, displayName, characterId } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    characterId?: CharacterId;
  };

  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,24}$/.test(username.trim())) {
    res.status(400).json({ error: 'Tên đăng nhập dài 3–24 ký tự (chữ, số, _, ., -).' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    res.status(400).json({ error: 'Mật khẩu cần ít nhất 4 ký tự.' });
    return;
  }
  if (findUserByUsername(username)) {
    res.status(409).json({ error: 'Tên đăng nhập này đã tồn tại.' });
    return;
  }

  const chosenChar: CharacterId =
    characterId && VALID_CHARACTER_IDS.has(characterId) ? characterId : 'ao-lam';
  const cleanDisplayName =
    displayName && typeof displayName === 'string' && displayName.trim().length > 0
      ? displayName.trim().slice(0, 28)
      : username.trim();

  const user = createPlayerUser({
    username: username.trim(),
    displayName: cleanDisplayName,
    password,
    characterId: chosenChar,
  });

  const token = signToken(user.id);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
    return;
  }
  const stored = findUserByUsername(username);
  if (!stored || !verifyPassword(password, stored.passwordHash, stored.salt)) {
    res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    return;
  }
  const user = toPublicUser(stored);
  const token = signToken(user.id);
  res.json({ token, user });
});

app.get('/api/auth/me', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json({ user });
});

app.patch('/api/auth/character', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { characterId, displayName } = req.body as { characterId?: CharacterId; displayName?: string };
  if (characterId && !VALID_CHARACTER_IDS.has(characterId)) {
    res.status(400).json({ error: 'Nhân vật không hợp lệ.' });
    return;
  }
  const updated = updateUserProfile(user.id, {
    characterId,
    displayName: typeof displayName === 'string' ? displayName : undefined,
  });
  if (!updated) {
    res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    return;
  }
  updatePlayerProfileInRooms(updated.id, updated.characterId, updated.displayName);
  res.json({ user: updated });
});

// --- Rooms Routes ---
app.get('/api/rooms', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json({ rooms: listRooms() });
});

app.post('/api/rooms', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { name, maxPlayers } = req.body as { name?: string; maxPlayers?: number };
  const cap: 2 | 3 = maxPlayers === 2 ? 2 : 3;
  const created = createRoom(typeof name === 'string' ? name : 'Am Nhỏ Tĩnh Lặng', cap);
  res.status(201).json({ room: created });
});

// --- Music & Admin Music Console Routes ---
app.get('/api/music/tracks', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json({
    tracks: getAllTracks(),
    musicState: getMusicState(),
  });
});

app.get('/api/music/stream/:trackId', (req, res) => {
  const track = getTrackById(req.params.trackId);
  if (!track || track.sourceType !== 'upload' || !track.fileName) {
    res.status(404).json({ error: 'Không tìm thấy tệp nhạc.' });
    return;
  }
  const filePath = path.join(UPLOADS_DIR, track.fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Tệp nhạc không còn tồn tại trên máy chủ.' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = track.mimeType || 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.post('/api/music/upload', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  upload.single('audio')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Lỗi tải tệp âm thanh.' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Vui lòng chọn một tệp âm thanh.' });
      return;
    }
    const rawTitle = (req.body as { title?: string }).title;
    const rawArtist = (req.body as { artist?: string }).artist;
    const baseName = path.basename(file.originalname, path.extname(file.originalname));
    const title = (rawTitle && rawTitle.trim()) || baseName || 'Nhạc Thiền Tải Lên';
    const artist = (rawArtist && rawArtist.trim()) || admin.displayName;

    const newTrack: MusicTrack = {
      id: `track-${crypto.randomUUID()}`,
      title: title.slice(0, 80),
      artist: artist.slice(0, 60),
      sourceType: 'upload',
      fileName: file.filename,
      mimeType: file.mimetype || 'audio/mpeg',
      sizeBytes: file.size,
      uploadedBy: admin.displayName,
      createdAt: Date.now(),
    };

    const tracks = addUploadedTrack(newTrack);
    broadcastToAllRooms({
      type: 'music:tracks',
      tracks,
    });
    res.status(201).json({ track: newTrack, tracks });
  });
});

app.delete('/api/music/tracks/:trackId', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const { trackId } = req.params;
  if (trackId === DEFAULT_ZEN_TRACK.id) {
    res.status(400).json({ error: 'Không thể xóa bài nhạc thiền mặc định.' });
    return;
  }
  const result = deleteTrackById(trackId);
  if (!result.deleted) {
    res.status(404).json({ error: 'Không tìm thấy bài nhạc cần xóa.' });
    return;
  }
  broadcastToAllRooms({
    type: 'music:tracks',
    tracks: result.tracks,
  });
  broadcastToAllRooms({
    type: 'music:state',
    musicState: result.musicState,
  });
  res.json(result);
});

app.post('/api/music/control', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { action, trackId } = req.body as {
    action?: 'play' | 'pause' | 'toggle' | 'select' | 'next' | 'prev';
    trackId?: string;
  };
  const tracks = getAllTracks();
  const current = getMusicState();
  const currentIdx = Math.max(
    0,
    tracks.findIndex((t) => t.id === current.activeTrackId)
  );

  let nextState = { ...current };

  if (action === 'select' && trackId) {
    const exists = tracks.some((t) => t.id === trackId);
    if (!exists) {
      res.status(404).json({ error: 'Bài nhạc không tồn tại.' });
      return;
    }
    nextState = updateMusicState({
      activeTrackId: trackId,
      isPlaying: true,
      updatedBy: admin.displayName,
    });
  } else if (action === 'play') {
    nextState = updateMusicState({ isPlaying: true, updatedBy: admin.displayName });
  } else if (action === 'pause') {
    nextState = updateMusicState({ isPlaying: false, updatedBy: admin.displayName });
  } else if (action === 'toggle') {
    nextState = updateMusicState({ isPlaying: !current.isPlaying, updatedBy: admin.displayName });
  } else if (action === 'next' && tracks.length > 0) {
    const nextIdx = (currentIdx + 1) % tracks.length;
    nextState = updateMusicState({
      activeTrackId: tracks[nextIdx].id,
      isPlaying: true,
      updatedBy: admin.displayName,
    });
  } else if (action === 'prev' && tracks.length > 0) {
    const prevIdx = (currentIdx - 1 + tracks.length) % tracks.length;
    nextState = updateMusicState({
      activeTrackId: tracks[prevIdx].id,
      isPlaying: true,
      updatedBy: admin.displayName,
    });
  } else {
    res.status(400).json({ error: 'Lệnh điều khiển nhạc không hợp lệ.' });
    return;
  }

  broadcastToAllRooms({
    type: 'music:state',
    musicState: nextState,
  });

  res.json({ musicState: nextState });
});

async function startServer() {
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chùa Tĩnh Tâm Online listening on http://localhost:${PORT}`);
  });
}

startServer();
