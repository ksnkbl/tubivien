import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth, testConnection } from './firebase.ts';
import {
  DEFAULT_ATMOSPHERE,
  DEFAULT_ZEN_TRACK,
  ensureInitialTempleData,
  fetchUserProfile,
  getCachedUserProfile,
  isPrimaryAdmin,
  subscribeMusic,
  subscribeSharedAtmosphere,
  subscribeSubAdminStatus,
} from './services/templeFirestore.ts';
import type { AtmosphereSetting, MusicState, MusicTrack, PublicUser } from './shared/types.ts';
import { AuthScreen } from './components/AuthScreen.tsx';
import { LobbyScreen } from './components/LobbyScreen.tsx';
import { TempleRoom } from './components/TempleRoom.tsx';

const FALLBACK_MUSIC_STATE: MusicState = {
  activeTrackId: DEFAULT_ZEN_TRACK.id,
  isPlaying: true,
  playMode: 'single',
  playlistTrackIds: [],
  updatedAt: 0,
  updatedBy: 'Hệ thống',
};

function getInvitedRoomIdFromUrl(): string | null {
  try {
    const param = new URLSearchParams(window.location.search).get('room')?.trim();
    if (param && /^[a-zA-Z0-9_-]{1,128}$/.test(param)) {
      return param;
    }
  } catch {
    // ignore URL errors
  }
  return null;
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<PublicUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(() => getInvitedRoomIdFromUrl());
  const [joinError, setJoinError] = useState<string | null>(null);

  const [tracks, setTracks] = useState<MusicTrack[]>([DEFAULT_ZEN_TRACK]);
  const [musicState, setMusicState] = useState<MusicState>(FALLBACK_MUSIC_STATE);
  const [atmosphereSetting, setAtmosphereSetting] = useState<AtmosphereSetting>(DEFAULT_ATMOSPHERE);
  const [isSubAdmin, setIsSubAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUserProfile(null);
        setActiveRoomId(null);
        setIsSubAdmin(false);
        setAuthReady(true);
        return;
      }

      try {
        void testConnection();
        await ensureInitialTempleData(fbUser);

        // 1. Check localStorage cache first so returning users avoid Firestore profile reads
        const cached = getCachedUserProfile(fbUser);
        if (cached) {
          setUserProfile(cached);
          setAuthReady(true);
          return;
        }

        // 2. Only read Firestore once if no local cache exists yet
        const existingProfile = await fetchUserProfile(fbUser.uid);
        setUserProfile(existingProfile);
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // Auto-enter invited room from QR deep link once logged in and profile is ready
  useEffect(() => {
    if (!firebaseUser || !userProfile || !pendingRoomId) return;
    setJoinError(null);
    setActiveRoomId(pendingRoomId);
    setPendingRoomId(null);
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {
      // ignore history errors
    }
  }, [firebaseUser, userProfile, pendingRoomId]);

  // Only attach Firestore music, atmosphere, and sub-admin listeners when authenticated and profile exists
  useEffect(() => {
    if (!firebaseUser || !userProfile) return;
    const unsubMusic = subscribeMusic(
      (nextTracks) => setTracks(nextTracks),
      (nextState) => setMusicState(nextState)
    );
    const unsubAtmo = subscribeSharedAtmosphere(setAtmosphereSetting);
    const unsubSub = subscribeSubAdminStatus(firebaseUser.uid, setIsSubAdmin);
    return () => {
      unsubMusic();
      unsubAtmo();
      unsubSub();
    };
  }, [firebaseUser, userProfile]);

  const handleLogout = async () => {
    setActiveRoomId(null);
    setJoinError(null);
    await signOut(auth);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#1A1614] text-[#C7BDB1] flex items-center justify-center text-sm">
        Đang kết nối thiền viện Firebase...
      </div>
    );
  }

  if (!firebaseUser || !userProfile) {
    return (
      <AuthScreen
        firebaseUser={firebaseUser}
        onProfileCreated={(profile) => {
          setUserProfile(profile);
          setJoinError(null);
        }}
      />
    );
  }

  const isPrimaryAdminUser = isPrimaryAdmin(firebaseUser);

  if (activeRoomId) {
    return (
      <TempleRoom
        user={userProfile}
        roomId={activeRoomId}
        tracks={tracks}
        musicState={musicState}
        atmosphereSetting={atmosphereSetting}
        isPrimaryAdmin={isPrimaryAdminUser}
        isSubAdmin={isSubAdmin}
        onUserUpdated={setUserProfile}
        onLeaveRoom={(errorMessage) => {
          setActiveRoomId(null);
          if (errorMessage) setJoinError(errorMessage);
        }}
      />
    );
  }

  return (
    <LobbyScreen
      user={userProfile}
      tracks={tracks}
      musicState={musicState}
      isPrimaryAdmin={isPrimaryAdminUser}
      isSubAdmin={isSubAdmin}
      joinError={joinError}
      onUserUpdated={setUserProfile}
      onEnterRoom={(roomId) => {
        setJoinError(null);
        setActiveRoomId(roomId);
      }}
      onLogout={() => void handleLogout()}
    />
  );
}
