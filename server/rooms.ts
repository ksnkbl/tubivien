import type { WebSocket } from 'ws';
import type {
  CharacterId,
  ChatMessage,
  Direction,
  PlayerPose,
  PublicUser,
  RitualAction,
  RoomPlayer,
  RoomState,
  RoomSummary,
} from '../src/shared/types.ts';
import {
  CUSHION_POSITIONS,
  TOTAL_BENCH_SLOTS,
  WORLD_HEIGHT,
  WORLD_MIN_X,
  WORLD_WIDTH,
} from '../src/shared/types.ts';

interface InternalRoom {
  id: string;
  name: string;
  maxPlayers: 2 | 3;
  players: Map<string, RoomPlayer>;
  sockets: Map<string, WebSocket>;
  incenseCount: number;
  cushions: (string | null)[];
  benches: (string | null)[];
  stupaSlots: (string | null)[];
  isDefault: boolean;
}

const rooms = new Map<string, InternalRoom>();

// Seed the primary small temple room (max 3 players)
rooms.set('chua-tinh-tam', {
  id: 'chua-tinh-tam',
  name: 'Chùa Tĩnh Tâm (Chính)',
  maxPlayers: 3,
  players: new Map(),
  sockets: new Map(),
  incenseCount: 3,
  cushions: [null, null, null],
  benches: Array.from({ length: TOTAL_BENCH_SLOTS }, () => null),
  stupaSlots: [null, null, null],
  isDefault: true,
});

// Seed an intimate 2-player meditation courtyard
rooms.set('thien-vien-nho', {
  id: 'thien-vien-nho',
  name: 'Thiền Viện Song Hành',
  maxPlayers: 2,
  players: new Map(),
  sockets: new Map(),
  incenseCount: 1,
  cushions: [null, null, null],
  benches: Array.from({ length: TOTAL_BENCH_SLOTS }, () => null),
  stupaSlots: [null, null, null],
  isDefault: true,
});

export function listRooms(): RoomSummary[] {
  return Array.from(rooms.values()).map((room) => ({
    id: room.id,
    name: room.name,
    maxPlayers: room.maxPlayers,
    playerCount: room.players.size,
    incenseCount: room.incenseCount,
  }));
}

export function createRoom(name: string, maxPlayers: 2 | 3): RoomSummary {
  const cleanName = name.trim().slice(0, 32) || 'Am Nhỏ Tĩnh Lặng';
  const slugBase = cleanName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'chua';
  const id = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
  const room: InternalRoom = {
    id,
    name: cleanName,
    maxPlayers: maxPlayers === 2 ? 2 : 3,
    players: new Map(),
    sockets: new Map(),
    incenseCount: 0,
    cushions: [null, null, null],
    benches: Array.from({ length: TOTAL_BENCH_SLOTS }, () => null),
    stupaSlots: [null, null, null],
    isDefault: false,
  };
  rooms.set(id, room);
  return {
    id: room.id,
    name: room.name,
    maxPlayers: room.maxPlayers,
    playerCount: 0,
    incenseCount: 0,
  };
}

export function getRoomState(roomId: string): RoomState | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    id: room.id,
    name: room.name,
    maxPlayers: room.maxPlayers,
    players: Array.from(room.players.values()),
    incenseCount: room.incenseCount,
    cushions: [...room.cushions],
    benches: [...room.benches],
    stupaSlots: [...room.stupaSlots],
    gardenPlots: [],
    lanterns: [],
    wishes: [],
  };
}

export function broadcastToRoom(roomId: string, payload: unknown, excludeUserId?: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const raw = JSON.stringify(payload);
  for (const [uid, ws] of room.sockets.entries()) {
    if (excludeUserId && uid === excludeUserId) continue;
    if (ws.readyState === ws.OPEN) {
      ws.send(raw);
    }
  }
}

export function broadcastToAllRooms(payload: unknown) {
  const raw = JSON.stringify(payload);
  for (const room of rooms.values()) {
    for (const ws of room.sockets.values()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(raw);
      }
    }
  }
}

export function joinRoom(
  roomId: string,
  user: PublicUser,
  ws: WebSocket
): { ok: true; state: RoomState } | { ok: false; reason: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, reason: 'Không tìm thấy phòng chùa này.' };
  }

  // If user is already connected in this room (e.g. reconnect), replace old socket gracefully
  const existingSocket = room.sockets.get(user.id);
  if (existingSocket && existingSocket !== ws) {
    try {
      existingSocket.close(4001, 'Đã đăng nhập từ tab khác');
    } catch {
      // ignore
    }
    room.sockets.delete(user.id);
    room.players.delete(user.id);
    releaseUserCushion(room, user.id);
  }

  if (room.players.size >= room.maxPlayers) {
    return {
      ok: false,
      reason: `Ngôi chùa "${room.name}" đã đủ ${room.maxPlayers}/${room.maxPlayers} hành giả. Vui lòng chọn phòng khác hoặc tạo chùa mới.`,
    };
  }

  const spawnOffsets = [
    { x: 910, y: 1025 },
    { x: 960, y: 1050 },
    { x: 1010, y: 1025 },
  ];
  const slot = room.players.size % spawnOffsets.length;
  const spawn = spawnOffsets[slot];

  const player: RoomPlayer = {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    characterId: user.characterId,
    x: spawn.x,
    y: spawn.y,
    direction: 'up',
    pose: 'idle',
    cushionIndex: null,
    benchIndex: null,
    stupaSlot: null,
    incenseCount: 0,
    bellCount: 0,
    sweepCount: 0,
    fishCount: 0,
    flowerCount: 0,
    lanternCount: 0,
    koiFeedCount: 0,
    wishCount: 0,
    bowCount: 0,
    kitchenWashCount: 0,
    memorialCount: 0,
  };

  room.players.set(user.id, player);
  room.sockets.set(user.id, ws);

  const state = getRoomState(roomId)!;

  broadcastToRoom(
    roomId,
    {
      type: 'player:joined',
      player,
    },
    user.id
  );

  const sysMsg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    displayName: user.displayName,
    characterId: user.characterId,
    text: `${user.displayName} vừa bước vào sân chùa.`,
    timestamp: Date.now(),
    kind: 'system',
  };
  broadcastToRoom(roomId, { type: 'chat:message', message: sysMsg });

  return { ok: true, state };
}

function releaseUserCushion(room: InternalRoom, userId: string) {
  for (let i = 0; i < room.cushions.length; i++) {
    if (room.cushions[i] === userId) {
      room.cushions[i] = null;
    }
  }
}

export function leaveRoom(roomId: string, userId: string, ws?: WebSocket) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (ws && room.sockets.get(userId) !== ws) {
    return;
  }
  const player = room.players.get(userId);
  room.players.delete(userId);
  room.sockets.delete(userId);
  releaseUserCushion(room, userId);

  if (player) {
    broadcastToRoom(roomId, {
      type: 'player:left',
      userId,
      cushions: [...room.cushions],
    });
    const sysMsg: ChatMessage = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      displayName: player.displayName,
      characterId: player.characterId,
      text: `${player.displayName} đã rời khỏi chùa.`,
      timestamp: Date.now(),
      kind: 'system',
    };
    broadcastToRoom(roomId, { type: 'chat:message', message: sysMsg });
  }

  // Clean up empty custom rooms
  if (!room.isDefault && room.players.size === 0) {
    rooms.delete(roomId);
  }
}

export function movePlayer(
  roomId: string,
  userId: string,
  x: number,
  y: number,
  direction: Direction,
  pose: PlayerPose
) {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.get(userId);
  if (!player) return;

  const clampedX = Math.max(WORLD_MIN_X + 85, Math.min(WORLD_WIDTH - 85, x));
  const clampedY = Math.max(330, Math.min(WORLD_HEIGHT - 125, y));

  // If moving while sitting, stand up from cushion
  if (player.cushionIndex !== null && pose === 'walk') {
    releaseUserCushion(room, userId);
    player.cushionIndex = null;
  }

  player.x = clampedX;
  player.y = clampedY;
  player.direction = direction;
  player.pose = pose;

  broadcastToRoom(
    roomId,
    {
      type: 'player:moved',
      userId,
      x: player.x,
      y: player.y,
      direction: player.direction,
      pose: player.pose,
      cushionIndex: player.cushionIndex,
      cushions: [...room.cushions],
    },
    userId
  );
}

export function sitOnCushion(roomId: string, userId: string, cushionIndex: number) {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.get(userId);
  if (!player) return;
  const cushion = CUSHION_POSITIONS[cushionIndex];
  if (!cushion) return;

  const occupant = room.cushions[cushionIndex];
  if (occupant && occupant !== userId) {
    return;
  }

  releaseUserCushion(room, userId);
  room.cushions[cushionIndex] = userId;
  player.cushionIndex = cushionIndex;
  player.x = cushion.x;
  player.y = cushion.y;
  player.direction = 'up';
  player.pose = 'meditate';

  broadcastToRoom(roomId, {
    type: 'player:moved',
    userId,
    x: player.x,
    y: player.y,
    direction: player.direction,
    pose: player.pose,
    cushionIndex: player.cushionIndex,
    cushions: [...room.cushions],
  });
}

export function standUpFromCushion(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.get(userId);
  if (!player) return;
  releaseUserCushion(room, userId);
  player.cushionIndex = null;
  player.pose = 'idle';
  player.y = Math.min(WORLD_HEIGHT - 130, player.y + 46);

  broadcastToRoom(roomId, {
    type: 'player:moved',
    userId,
    x: player.x,
    y: player.y,
    direction: player.direction,
    pose: player.pose,
    cushionIndex: null,
    cushions: [...room.cushions],
  });
}

export function handleTempleAction(
  roomId: string,
  userId: string,
  action: RitualAction
) {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.get(userId);
  if (!player) return;

  if (action === 'incense') {
    room.incenseCount = Math.min(999, room.incenseCount + 1);
    player.pose = 'pray';
  }

  broadcastToRoom(roomId, {
    type: 'temple:action',
    action,
    userId,
    displayName: player.displayName,
    incenseCount: room.incenseCount,
    timestamp: Date.now(),
  });
}

export function handleChat(roomId: string, userId: string, rawText: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.get(userId);
  if (!player) return;
  const text = rawText.trim().slice(0, 140);
  if (!text) return;

  player.chatText = text;
  player.chatExpiresAt = Date.now() + 5500;

  const message: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    displayName: player.displayName,
    characterId: player.characterId,
    text,
    timestamp: Date.now(),
    kind: 'chat',
  };

  broadcastToRoom(roomId, {
    type: 'chat:message',
    message,
    chatExpiresAt: player.chatExpiresAt,
  });
}

export function updatePlayerProfileInRooms(userId: string, characterId: CharacterId, displayName: string) {
  for (const room of rooms.values()) {
    const player = room.players.get(userId);
    if (player) {
      player.characterId = characterId;
      player.displayName = displayName;
      broadcastToRoom(room.id, {
        type: 'player:updated',
        userId,
        characterId,
        displayName,
      });
    }
  }
}
