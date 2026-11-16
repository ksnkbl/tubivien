# Security Specification — Chùa Tĩnh Tâm Online

## 1. Data Invariants

1. **Identity Integrity**: Every document created by a user (`users_public`, `rooms`, `players`, `messages`) must bind its `uid` / `userId` / `ownerId` strictly to `request.auth.uid` and require `request.auth.token.email_verified == true`.
2. **Anti-Privilege Escalation**: Regular users cannot self-assign `role: 'admin'` on `/users_public/{userId}` unless their verified email matches the bootstrapped admin email (`vinhtoanlam@gmail.com`) or they already exist in `/admins/{uid}`.
3. **PII Isolation**: Email addresses are strictly isolated in `/users_public/{userId}/private/{docId}` and readable only by the owner or Admin. Public profiles contain zero PII.
4. **2–3 Player Room Cap**: Every `/rooms/{roomId}` document enforces `maxPlayers in [2, 3]` and `memberIds.size() <= maxPlayers`. Joining a room requires adding only `request.auth.uid` to `memberIds` and atomically creating `/rooms/{roomId}/players/{uid}` verified via `getAfter`.
5. **Master Gate on Subcollections**: Reading or posting messages and updating player positions inside `/rooms/{roomId}/*` requires the user to be a current member of `/rooms/{roomId}` (`request.auth.uid in get(...).data.memberIds`).
6. **Admin-Only Music Control**: Only Admins can upload, modify, or delete tracks in `/tracks/{trackId}` (and cannot delete `'default-zen'`) or change global playback state in `/settings/music`.
7. **Temporal & Structural Integrity**: All `createdAt`/`updatedAt` timestamps must equal `request.time`, all strings enforce explicit `.size()` bounds, and all IDs match `^[a-zA-Z0-9_\-]+$`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)

1. **Privilege Escalation on Signup**: Non-admin user attempts to create `/users_public/{uid}` with `role: "admin"`.
2. **Shadow Field Injection**: User creates `/users_public/{uid}` with extra field `isVerifiedAdmin: true`.
3. **PII Cross-Read**: User A attempts `get` on `/users_public/{userB}/private/info`.
4. **Spoofed Owner on Room Create**: User A creates `/rooms/room-1` with `ownerId: "userB"`.
5. **Room Capacity Overflow**: User attempts to create `/rooms/room-1` with `maxPlayers: 10` or `memberIds` exceeding `maxPlayers`.
6. **Non-Member Message Injection**: User not in `room.memberIds` attempts to create `/rooms/room-1/messages/m1`.
7. **Orphan Player Write**: User attempts to create `/rooms/room-1/players/{uid}` without being in `getAfter(/rooms/room-1).data.memberIds`.
8. **Fake Timestamp Injection**: Client sends `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()`.
9. **Non-Admin Music Hijack**: Regular player attempts to update `/settings/music` to pause or switch track.
10. **Deleting Default Meditation Track**: Admin or player attempts to delete `/tracks/default-zen`.
11. **Oversized Audio Payload (>1MB DoS)**: Attacker sends a 1.5MB string in `audioUrl` on `/tracks/t1`.
12. **Resource ID Poisoning**: Attacker writes to `/rooms/{1500-char-invalid-id}` violating `isValidId()`.

## 3. Test Runner

See `firestore.rules.test.ts` for automated verification payloads against the Firebase Emulator Suite (`@firebase/rules-unit-testing`).
