// Verification spec for Firestore Security Rules ("Dirty Dozen" test suite).
// Run against Firebase Firestore Emulator with @firebase/rules-unit-testing when emulator is active.

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'create' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation on Signup',
    collectionPath: 'users_public/playerA',
    operation: 'create',
    payload: {
      uid: 'playerA',
      displayName: 'Hacker',
      characterId: 'tieu-su',
      role: 'admin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow Field Injection',
    collectionPath: 'users_public/playerA',
    operation: 'create',
    payload: {
      uid: 'playerA',
      displayName: 'Shadow',
      characterId: 'ao-lam',
      role: 'player',
      isSuperUser: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'PII Cross-Read',
    collectionPath: 'users_public/playerB/private/info',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Spoofed Owner on Room Create',
    collectionPath: 'rooms/room-spoof',
    operation: 'create',
    payload: {
      name: 'Phòng Giả',
      maxPlayers: 3,
      memberIds: ['playerA'],
      incenseCount: 0,
      cushions: ['', '', ''],
      ownerId: 'playerB',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Room Capacity Overflow',
    collectionPath: 'rooms/room-huge',
    operation: 'create',
    payload: {
      name: 'Chùa Quá Tải',
      maxPlayers: 99,
      memberIds: ['playerA'],
      incenseCount: 0,
      cushions: ['', '', '', '', '', '', '', '', '', ''],
      ownerId: 'playerA',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Non-Member Message Injection',
    collectionPath: 'rooms/chua-tinh-tam/messages/msg-intruder',
    operation: 'create',
    payload: {
      userId: 'outsider',
      displayName: 'Outsider',
      characterId: 'ao-lam',
      text: 'Spam',
      kind: 'chat',
      action: 'none',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphan Player Write',
    collectionPath: 'rooms/chua-tinh-tam/players/outsider',
    operation: 'create',
    payload: {
      userId: 'outsider',
      displayName: 'Outsider',
      role: 'player',
      characterId: 'ao-lam',
      x: 480,
      y: 470,
      direction: 'up',
      pose: 'idle',
      cushionIndex: -1,
      lastActiveAt: Date.now(),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Fake Timestamp Injection',
    collectionPath: 'rooms/room-time',
    operation: 'create',
    payload: {
      name: 'Phòng Thời Gian Giả',
      maxPlayers: 3,
      memberIds: ['playerA'],
      incenseCount: 0,
      cushions: ['', '', ''],
      ownerId: 'playerA',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Non-Admin Music Hijack',
    collectionPath: 'settings/music',
    operation: 'update',
    payload: {
      activeTrackId: 'track-hijack',
      isPlaying: false,
      updatedBy: 'playerA',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Deleting Default Meditation Track',
    collectionPath: 'tracks/default-zen',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Oversized Audio Payload',
    collectionPath: 'tracks/track-oversize',
    operation: 'create',
    payload: {
      title: 'Too Big',
      artist: 'Admin',
      sourceType: 'upload',
      audioUrl: 'x'.repeat(950000),
      uploadedBy: 'Admin',
      ownerId: 'adminUid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Resource ID Poisoning',
    collectionPath: `rooms/${'bad_id_'.repeat(30)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
];
