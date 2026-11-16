import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Volume2,
  VolumeX,
  Send,
  SlidersHorizontal,
  Sparkles,
  LogOut,
  Users,
  Cpu,
  UserCog,
  QrCode,
  Award,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Eye,
  Compass,
  Flower2,
  Flame,
  TreeDeciduous,
  UtensilsCrossed,
  GlassWater,
  Droplets,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  CloudRain,
  Wind,
  CloudFog,
  ZoomIn,
  ZoomOut,
  Landmark,
  Heart,
} from 'lucide-react';
import {
  CHARACTERS,
  CUSHION_POSITIONS,
  FIVE_PRECEPTS_LIST,
  FLOWER_CATALOG,
  FORTUNE_SLIPS,
  GARDEN_PLOT_POSITIONS,
  INTERACTABLES,
  PERGOLA_BENCH_SPECS,
  STUPA_DECK_CAPACITY,
  STUPA_DECK_SLOTS,
  VEGETARIAN_DRINK_MENU,
  VEGETARIAN_FOOD_MENU,
  WORLD_HEIGHT,
  getEffectiveFlowerStage,
  getFlowerRemainingSec,
  type AtmosphereSetting,
  type CharacterId,
  type ChatMessage,
  type Direction,
  type FlowerSpecies,
  type FortuneSlip,
  type GardenPlotState,
  type KitchenMealRecipientMode,
  type KitchenMealState,
  type LanternColor,
  type MemorialRecord,
  type MusicState,
  type MusicTrack,
  type PlayerPose,
  type PondLanternState,
  type PublicUser,
  type RitualAction,
  type RoomPlayer,
  type RoomState,
  type TreeWishState,
  type VegetarianDrinkId,
  type VegetarianFoodId,
} from '../shared/types.ts';
import {
  adminControlMusicInFirestore,
  ascendTempleStupa,
  cleanupExcessPondLanterns,
  clearTempleFlowerPlot,
  consumeKitchenMealInFirestore,
  descendTempleStupa,
  joinTempleRoom,
  leaveTempleRoom,
  offerTempleFlower,
  orderSharedKitchenMealsInFirestore,
  performMemorialCeremony,
  plantTempleFlower,
  releasePondLantern,
  resolveEffectivePlaylist,
  sendRoomChatMessage,
  sitOnPergolaBench,
  sitOnTempleCushion,
  standFromPergolaBench,
  standFromTempleCushion,
  subscribeTempleRoom,
  syncPlayerPosition,
  tossWishRibbon,
  triggerTempleRitual,
  updateLocalProfileCacheOnly,
  updateSharedAtmosphere,
  washKitchenDishesInFirestore,
} from '../services/templeFirestore.ts';
import { zenAudio } from '../audio/zenAudioEngine.ts';
import { TempleCanvas, type RitualRequest, type VisualEffect } from './TempleCanvas.tsx';
import { TempleFirstPersonView } from './TempleFirstPersonView.tsx';
import { CharacterAvatar } from './CharacterAvatar.tsx';
import { AdminMusicPanel } from './AdminMusicPanel.tsx';
import { InviteQrModal } from './InviteQrModal.tsx';
import {
  TIME_PHASE_LABELS,
  WEATHER_LABELS,
  getTempleAtmosphere,
  type AtmospherePreference,
  type TimeOfDayOverride,
  type WeatherOverride,
} from '../shared/templeAtmosphere.ts';

interface TempleRoomProps {
  user: PublicUser;
  roomId: string;
  tracks: MusicTrack[];
  musicState: MusicState;
  atmosphereSetting: AtmosphereSetting;
  isPrimaryAdmin: boolean;
  isSubAdmin: boolean;
  onUserUpdated: (user: PublicUser) => void;
  onLeaveRoom: (errorMessage?: string) => void;
}

const clampZoom2D = (v: number) => Math.min(2.2, Math.max(0.45, Math.round(v * 100) / 100));
const clampFov3D = (v: number) => Math.min(90, Math.max(28, Math.round(v)));

export function TempleRoom({
  user,
  roomId,
  tracks,
  musicState,
  atmosphereSetting,
  isPrimaryAdmin,
  isSubAdmin,
  onUserUpdated,
  onLeaveRoom,
}: TempleRoomProps) {
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const seenRitualIdsRef = useRef<Set<string>>(new Set());
  const initialMessagesLoadedRef = useRef(false);
  const lastMoveSyncRef = useRef<number>(0);

  const [roomMeta, setRoomMeta] = useState<{
    id: string;
    name: string;
    maxPlayers: number;
    incenseCount: number;
    cushions: (string | null)[];
    benches: (string | null)[];
    stupaSlots: (string | null)[];
  } | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gardenPlots, setGardenPlots] = useState<GardenPlotState[]>(() =>
    GARDEN_PLOT_POSITIONS.map((pos) => ({
      id: pos.id,
      plotIndex: pos.index,
      species: 'none',
      stage: 0,
      waterCount: 0,
      plantedBy: '',
      plantedByUid: '',
      lastWateredBy: '',
      plantedAt: 0,
    }))
  );
  const [lanterns, setLanterns] = useState<PondLanternState[]>([]);
  const [wishes, setWishes] = useState<TreeWishState[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [effects, setEffects] = useState<VisualEffect[]>([]);
  const [lowResourceMode, setLowResourceMode] = useState(false);

  // Floating HUD UI states (default collapsed to keep temple world unobstructed)
  const [viewMode, setViewMode] = useState<'overview' | 'first-person'>('overview');
  const [isLoading3D, setIsLoading3D] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const targetProgressRef = useRef(0);
  const readyDelayTimerRef = useRef<number | undefined>(undefined);
  const livePositionRef = useRef<{ x: number; y: number; direction: Direction }>({
    x: 960,
    y: 1040,
    direction: 'up',
  });
  const [chatExpanded, setChatExpanded] = useState(false);
  const [ritualsExpanded, setRitualsExpanded] = useState(false);
  const [showAudioPopover, setShowAudioPopover] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMeritModal, setShowMeritModal] = useState(false);
  const [isCompactScreen, setIsCompactScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : true
  );

  // Audio controls (personal local volume/mute)
  const [volume, setVolume] = useState(zenAudio.getVolume());
  const [muted, setMuted] = useState(zenAudio.isMuted());
  const [audioStarted, setAudioStarted] = useState(zenAudio.isAudioUnlocked());

  // Floating merit toast notification (shows on merit gain, hides after a few seconds)
  const [meritToast, setMeritToast] = useState<{
    id: number;
    title: string;
    blessing: string;
    totalMerit: number;
    visible: boolean;
  } | null>(null);
  const meritTimersRef = useRef<{ fade?: number; clear?: number }>({});
  const [pendingRitual, setPendingRitual] = useState<RitualRequest | null>(null);

  // Modals
  const [showAdminMusic, setShowAdminMusic] = useState(false);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [drawnFortune, setDrawnFortune] = useState<FortuneSlip | null>(null);
  const [savingChar, setSavingChar] = useState(false);
  const [activeGardenPlotIndex, setActiveGardenPlotIndex] = useState<number | null>(null);
  const [busyGarden, setBusyGarden] = useState(false);
  const [showLanternModal, setShowLanternModal] = useState(false);
  const [lanternColor, setLanternColor] = useState<LanternColor>('gold');
  const [lanternWish, setLanternWish] = useState('');
  const [busyLantern, setBusyLantern] = useState(false);
  const [showWishModal, setShowWishModal] = useState(false);
  const [wishInput, setWishInput] = useState('');
  const [busyWish, setBusyWish] = useState(false);
  const [showMemorialModal, setShowMemorialModal] = useState(false);
  const [memorialName, setMemorialName] = useState('');
  const [memorialWish, setMemorialWish] = useState('');
  const [busyMemorial, setBusyMemorial] = useState(false);
  const [memorials, setMemorials] = useState<MemorialRecord[]>([]);
  const [latestMemorial, setLatestMemorial] = useState<{ deceasedName: string; createdAt: number } | null>(null);
  const [showPreceptsModal, setShowPreceptsModal] = useState(false);
  const [viewingStupa, setViewingStupa] = useState(false);
  const busyStupaRef = useRef(false);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [fov3D, setFov3D] = useState(62);
  const [gardenNowMs, setGardenNowMs] = useState(() => Date.now());
  const [kitchenMeals, setKitchenMeals] = useState<KitchenMealState[]>([]);
  const [showKitchenMenuModal, setShowKitchenMenuModal] = useState(false);
  const [selectedFoodId, setSelectedFoodId] = useState<VegetarianFoodId>('com-sen');
  const [selectedDrinkId, setSelectedDrinkId] = useState<VegetarianDrinkId>('nuoc-ep-tao');
  const [kitchenRecipientMode, setKitchenRecipientMode] = useState<KitchenMealRecipientMode>('self');
  const [kitchenTargetUid, setKitchenTargetUid] = useState<string>('');
  const [busyKitchenOrder, setBusyKitchenOrder] = useState(false);
  const [kitchenNotice, setKitchenNotice] = useState<string | null>(null);
  const kitchenNoticeTimerRef = useRef<number | undefined>(undefined);
  const [showAtmospherePopover, setShowAtmospherePopover] = useState(false);
  const [atmosphereNowMs, setAtmosphereNowMs] = useState(() => Date.now());

  const canControlMusic = isPrimaryAdmin || isSubAdmin;
  const canControlAtmosphere = isPrimaryAdmin || isSubAdmin;
  const atmospherePref: AtmospherePreference = {
    time: atmosphereSetting.time,
    weather: atmosphereSetting.weather,
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      setAtmosphereNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleExitStupa = useCallback(() => {
    setViewingStupa(false);
    livePositionRef.current = {
      x: INTERACTABLES.stupa.x,
      y: INTERACTABLES.stupa.y,
      direction: 'down',
    };
    void descendTempleStupa(roomId, user.id, INTERACTABLES.stupa.x, INTERACTABLES.stupa.y);
  }, [roomId, user.id]);

  useEffect(() => {
    if (!viewingStupa) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleExitStupa();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewingStupa, handleExitStupa]);

  useEffect(() => {
    if (activeGardenPlotIndex === null) return;
    setGardenNowMs(Date.now());
    const timer = window.setInterval(() => {
      setGardenNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, [activeGardenPlotIndex]);

  useEffect(() => {
    const onResize = () => setIsCompactScreen(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Local fallback track cursor when playing playlist and Admin isn't present to advance Firestore
  const [localPlaylistTrackId, setLocalPlaylistTrackId] = useState<string | null>(null);
  const lastEndAdvanceRef = useRef<number>(0);

  useEffect(() => {
    setLocalPlaylistTrackId(null);
  }, [musicState.activeTrackId, musicState.playMode, musicState.updatedAt]);

  const effectiveMusicState: MusicState =
    localPlaylistTrackId && musicState.playMode === 'playlist'
      ? { ...musicState, activeTrackId: localPlaylistTrackId }
      : musicState;

  // Keep audio synced whenever tracks or effectiveMusicState changes
  useEffect(() => {
    if (audioStarted) {
      zenAudio.syncMusicState(effectiveMusicState, tracks);
    }
  }, [effectiveMusicState, tracks, audioStarted]);

  useEffect(() => {
    zenAudio.setOnTrackEnded(() => {
      if (effectiveMusicState.playMode !== 'playlist' || !effectiveMusicState.isPlaying) return;
      const now = performance.now();
      if (now - lastEndAdvanceRef.current < 1500) return;
      lastEndAdvanceRef.current = now;

      const playlist = resolveEffectivePlaylist(tracks, effectiveMusicState);
      if (playlist.length <= 1) return;
      const curIdx = playlist.findIndex((t) => t.id === effectiveMusicState.activeTrackId);
      const nextTrack = playlist[(curIdx >= 0 ? curIdx + 1 : 0) % playlist.length];
      if (!nextTrack) return;

      if (canControlMusic) {
        void adminControlMusicInFirestore(user.displayName, 'next', tracks, musicState);
      } else {
        setLocalPlaylistTrackId(nextTrack.id);
      }
    });
    return () => {
      zenAudio.setOnTrackEnded(null);
    };
  }, [effectiveMusicState, musicState, tracks, canControlMusic, user.displayName]);

  useEffect(() => {
    return () => {
      zenAudio.stopAllMusic();
      if (readyDelayTimerRef.current) clearTimeout(readyDelayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isLoading3D) return;
    const id = window.setInterval(() => {
      targetProgressRef.current = Math.min(95, Math.max(targetProgressRef.current, 12) + 0.85);
      setTransitionProgress((prev) => {
        const next = prev + (targetProgressRef.current - prev) * 0.28;
        return next > 99.4 ? 100 : next;
      });
    }, 45);
    return () => window.clearInterval(id);
  }, [isLoading3D]);

  const handleToggleViewMode = useCallback(() => {
    setShowAudioPopover(false);
    setShowMobileMenu(false);
    setPendingRitual(null);
    if (viewMode === 'first-person') {
      if (readyDelayTimerRef.current) clearTimeout(readyDelayTimerRef.current);
      setIsLoading3D(false);
      setTransitionProgress(0);
      targetProgressRef.current = 0;
      setViewMode('overview');
      return;
    }
    if (!isLoading3D) {
      targetProgressRef.current = 12;
      setTransitionProgress(8);
      setIsLoading3D(true);
    }
  }, [viewMode, isLoading3D]);

  const handle3DLoadProgress = useCallback((pct: number) => {
    targetProgressRef.current = Math.max(targetProgressRef.current, pct);
  }, []);

  const handle3DReady = useCallback(() => {
    targetProgressRef.current = 100;
    setTransitionProgress(100);
    if (readyDelayTimerRef.current) clearTimeout(readyDelayTimerRef.current);
    readyDelayTimerRef.current = window.setTimeout(() => {
      setViewMode('first-person');
      setIsLoading3D(false);
    }, 180);
  }, []);

  const unlockAudio = useCallback(() => {
    zenAudio.unlock();
    setAudioStarted(true);
    zenAudio.syncMusicState(effectiveMusicState, tracks);
  }, [effectiveMusicState, tracks]);

  // Unlock browser audio on any first interaction inside the temple room so live admin music switches apply immediately
  useEffect(() => {
    if (audioStarted) return;
    const handleFirstGesture = () => {
      unlockAudio();
    };
    window.addEventListener('pointerdown', handleFirstGesture, { once: true, capture: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture, { capture: true });
      window.removeEventListener('keydown', handleFirstGesture, { capture: true });
    };
  }, [audioStarted, unlockAudio]);

  // Join room & attach Firestore onSnapshot listeners
  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        await joinTempleRoom(roomId, user);
        if (!active) {
          await leaveTempleRoom(roomId, user);
          return;
        }
        unsub = subscribeTempleRoom(roomId, {
          onRoomMeta: (meta) => setRoomMeta(meta),
          onPlayers: (list) => setPlayers(list),
          onGardenPlots: (plots) => setGardenPlots(plots),
          onLanterns: (list) => setLanterns(list),
          onWishes: (list) => setWishes(list),
          onKitchenMeals: (meals) => setKitchenMeals(meals),
          onMemorials: (list) => {
            setMemorials(list);
            const newest = list[list.length - 1];
            if (newest && Date.now() - newest.createdAt < 22_000) {
              setLatestMemorial({
                deceasedName: newest.deceasedName,
                createdAt: newest.createdAt,
              });
            }
          },
          onMessages: (list) => {
            if (!initialMessagesLoadedRef.current) {
              list.forEach((m) => seenRitualIdsRef.current.add(m.id));
              initialMessagesLoadedRef.current = true;
            } else {
              for (const m of list) {
                if (!seenRitualIdsRef.current.has(m.id)) {
                  seenRitualIdsRef.current.add(m.id);
                  if (m.action && m.action !== 'none') {
                    const ritualAction = m.action;
                    const targetPoint = INTERACTABLES[ritualAction];
                    setEffects((prev) => [
                      ...prev.slice(-8),
                      {
                        id: Date.now() + Math.random(),
                        kind: ritualAction,
                        x: targetPoint.x,
                        y: targetPoint.y,
                        createdAt: performance.now(),
                      },
                    ]);
                    if (zenAudio.isAudioUnlocked()) {
                      if (ritualAction === 'bell' || ritualAction === 'stupa') zenAudio.playBellSound();
                      if (ritualAction === 'woodfish') zenAudio.playWoodfishSound();
                      if (ritualAction === 'incense') zenAudio.playIncenseChime();
                      if (ritualAction === 'sweep') zenAudio.playSweepSound();
                      if (ritualAction === 'fish') zenAudio.playFishReleaseSound();
                      if (ritualAction === 'flower') zenAudio.playGardenWaterSound();
                      if (ritualAction === 'lantern') zenAudio.playLanternSound();
                      if (ritualAction === 'feed_koi') zenAudio.playKoiFeedSound();
                      if (ritualAction === 'feed_birds') zenAudio.playBirdFeedSound();
                      if (ritualAction === 'wish') zenAudio.playWishRibbonSound();
                      if (ritualAction === 'bow') zenAudio.playBowChimeSound();
                      if (ritualAction === 'kitchen_sink') zenAudio.playDishWashSound();
                      if (ritualAction === 'memorial') zenAudio.playMemorialChimeSound();
                    }
                  }
                }
              }
            }
            setMessages(list);
          },
        });
      } catch (err) {
        if (active) {
          onLeaveRoom(err instanceof Error ? err.message : 'Không thể vào phòng chùa này.');
        }
      }
    })();

    const onBeforeUnload = () => {
      void leaveTempleRoom(roomId, user);
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      active = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (unsub) unsub();
      void leaveTempleRoom(roomId, user);
    };
  }, [roomId, user.id]);

  // Auto-clean excess older Pond Wish Lanterns after ~95s, leaving 1-2 serene newest lanterns
  useEffect(() => {
    if (lanterns.length <= 2) return;
    void cleanupExcessPondLanterns(roomId, lanterns, 95_000);
    const timer = window.setInterval(() => {
      void cleanupExcessPondLanterns(roomId, lanterns, 95_000);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [roomId, lanterns]);

  useEffect(() => {
    if (chatExpanded) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatExpanded]);

  const room: RoomState | null = roomMeta
    ? {
        ...roomMeta,
        players,
        gardenPlots,
        lanterns,
        wishes,
      }
    : null;

  const me = players.find((p) => p.userId === user.id);

  useEffect(() => {
    if (
      viewingStupa &&
      ((me?.cushionIndex !== null && me?.cushionIndex !== undefined) ||
        (me?.benchIndex !== null && me?.benchIndex !== undefined))
    ) {
      setViewingStupa(false);
    }
  }, [viewingStupa, me?.cushionIndex, me?.benchIndex]);

  const sendMove = useCallback(
    (x: number, y: number, direction: Direction, pose: PlayerPose) => {
      const now = performance.now();
      if (pose !== 'idle' && pose !== 'pray' && now - lastMoveSyncRef.current < 220) return;
      lastMoveSyncRef.current = now;
      void syncPlayerPosition(
        roomId,
        user.id,
        x,
        y,
        direction,
        pose,
        me?.cushionIndex ?? null,
        me?.benchIndex ?? null
      );
    },
    [roomId, user.id, me?.cushionIndex, me?.benchIndex]
  );

  const handleSitCushion = useCallback(
    (cushionIndex: number) => {
      unlockAudio();
      const cushion = CUSHION_POSITIONS[cushionIndex];
      if (!cushion) return;
      void sitOnTempleCushion(roomId, user.id, cushionIndex, cushion.x, cushion.y);
    },
    [roomId, user.id, unlockAudio]
  );

  const handleStandUp = useCallback(() => {
    if (me?.benchIndex !== null && me?.benchIndex !== undefined) {
      const bench = PERGOLA_BENCH_SPECS[Math.floor(me.benchIndex / 2)];
      const baseY = bench?.y ?? me?.y ?? 745;
      const newY = Math.min(WORLD_HEIGHT - 130, baseY + 34);
      livePositionRef.current = {
        x: me?.x ?? bench?.x ?? 1555,
        y: newY,
        direction: 'down',
      };
      void standFromPergolaBench(roomId, user.id, newY);
      return;
    }
    const newY = Math.min(WORLD_HEIGHT - 130, (me?.y ?? 415) + 46);
    void standFromTempleCushion(roomId, user.id, newY);
  }, [roomId, user.id, me?.benchIndex, me?.x, me?.y]);

  useEffect(() => {
    return () => {
      if (meritTimersRef.current.fade) clearTimeout(meritTimersRef.current.fade);
      if (meritTimersRef.current.clear) clearTimeout(meritTimersRef.current.clear);
      if (kitchenNoticeTimerRef.current) clearTimeout(kitchenNoticeTimerRef.current);
    };
  }, []);

  const showKitchenNotice = useCallback((msg: string) => {
    if (kitchenNoticeTimerRef.current) clearTimeout(kitchenNoticeTimerRef.current);
    setKitchenNotice(msg);
    kitchenNoticeTimerRef.current = window.setTimeout(() => {
      setKitchenNotice(null);
    }, 4500);
  }, []);

  const handleSitBench = useCallback(
    (benchIndex: number) => {
      unlockAudio();
      const bench = PERGOLA_BENCH_SPECS[benchIndex];
      if (!bench) return;
      void sitOnPergolaBench(roomId, user.id, benchIndex, bench.x, bench.y).then((res) => {
        if (!res.ok && res.reason) {
          showKitchenNotice(res.reason);
          return;
        }
        if (res.ok && typeof res.seatX === 'number' && typeof res.seatY === 'number') {
          livePositionRef.current = { x: res.seatX, y: res.seatY, direction: 'down' };
        }
      });
    },
    [roomId, user.id, unlockAudio, showKitchenNotice]
  );

  const showMeritToast = useCallback(
    (title: string, blessing: string) => {
      const currentSelfMerit =
        (me?.incenseCount ?? 0) +
        (me?.bellCount ?? 0) +
        (me?.sweepCount ?? 0) +
        (me?.fishCount ?? 0) +
        (me?.flowerCount ?? 0) +
        (me?.lanternCount ?? 0) +
        (me?.koiFeedCount ?? 0) +
        (me?.wishCount ?? 0) +
        (me?.bowCount ?? 0) +
        (me?.kitchenWashCount ?? 0) +
        (me?.memorialCount ?? 0);
      if (meritTimersRef.current.fade) clearTimeout(meritTimersRef.current.fade);
      if (meritTimersRef.current.clear) clearTimeout(meritTimersRef.current.clear);

      const toastId = Date.now();
      setMeritToast({
        id: toastId,
        title,
        blessing,
        totalMerit: currentSelfMerit + 1,
        visible: true,
      });

      meritTimersRef.current.fade = window.setTimeout(() => {
        setMeritToast((prev) => (prev && prev.id === toastId ? { ...prev, visible: false } : prev));
      }, 3200);
      meritTimersRef.current.clear = window.setTimeout(() => {
        setMeritToast((prev) => (prev && prev.id === toastId ? null : prev));
      }, 3600);
    },
    [
      me?.incenseCount,
      me?.bellCount,
      me?.sweepCount,
      me?.fishCount,
      me?.flowerCount,
      me?.lanternCount,
      me?.koiFeedCount,
      me?.wishCount,
      me?.bowCount,
      me?.kitchenWashCount,
      me?.memorialCount,
    ]
  );

  const handleConsumeKitchenTarget = useCallback(
    (preferredTarget?: 'food' | 'drink', mealId?: string) => {
      unlockAudio();
      if (kitchenMeals.length === 0) {
        showKitchenNotice('Bàn ăn chưa có món. Hãy chọn món chay & thức uống tại Quầy Thực Đơn nhé!');
        setShowKitchenMenuModal(true);
        return;
      }

      const pickByPreference = (): KitchenMealState | undefined => {
        if (mealId) {
          const exact = kitchenMeals.find((m) => m.id === mealId);
          if (exact) return exact;
        }
        const matchesKind = (m: KitchenMealState) =>
          preferredTarget === 'food'
            ? !m.foodEaten
            : preferredTarget === 'drink'
            ? !m.drinkDrunk
            : !m.foodEaten || !m.drinkDrunk;
        return (
          kitchenMeals.find((m) => m.targetUid === user.id && matchesKind(m)) ??
          kitchenMeals.find((m) => m.recipientMode === 'all' && matchesKind(m)) ??
          kitchenMeals.find((m) => matchesKind(m)) ??
          kitchenMeals.find((m) => m.targetUid === user.id || m.orderedByUid === user.id) ??
          kitchenMeals[0]
        );
      };

      const targetMeal = pickByPreference();
      if (!targetMeal) return;

      let consumeKind: 'food' | 'drink' | null = null;
      if (preferredTarget === 'food') {
        if (targetMeal.foodEaten) {
          showKitchenNotice(
            targetMeal.drinkDrunk
              ? 'Phần này đã dùng xong! Hãy ra Bồn Rửa rửa bát & ly để nhận +1 Công đức.'
              : 'Đã dùng xong món chay, hãy nhấn vào ly nước trên bàn để uống nốt nhé!'
          );
          return;
        }
        consumeKind = 'food';
      } else if (preferredTarget === 'drink') {
        if (targetMeal.drinkDrunk) {
          showKitchenNotice(
            targetMeal.foodEaten
              ? 'Phần này đã dùng xong! Hãy ra Bồn Rửa rửa bát & ly để nhận +1 Công đức.'
              : 'Đã uống hết nước, hãy nhấn vào bát món chay trên bàn để ăn nốt nhé!'
          );
          return;
        }
        consumeKind = 'drink';
      } else {
        if (!targetMeal.foodEaten) consumeKind = 'food';
        else if (!targetMeal.drinkDrunk) consumeKind = 'drink';
        else {
          showKitchenNotice('Đã dùng xong bữa chay! Hãy đến Bồn Rửa rửa bát & ly để nhận +1 Công đức.');
          return;
        }
      }

      void consumeKitchenMealInFirestore(roomId, targetMeal, consumeKind, user.displayName);
      zenAudio.playEatSipSound(consumeKind === 'food' ? 'eat' : 'drink');
      setEffects((prev) => [
        ...prev.slice(-8),
        {
          id: Date.now() + Math.random(),
          kind: 'kitchen_table',
          x: INTERACTABLES.kitchen_table.x + (consumeKind === 'food' ? -24 : 24),
          y: INTERACTABLES.kitchen_table.y,
          createdAt: performance.now(),
        },
      ]);

      const foodName =
        VEGETARIAN_FOOD_MENU.find((f) => f.id === targetMeal.foodId)?.name ?? 'Món chay';
      const drinkName =
        VEGETARIAN_DRINK_MENU.find((d) => d.id === targetMeal.drinkId)?.name ?? 'Thức uống';
      const giftTag =
        targetMeal.orderedByUid && targetMeal.orderedByUid !== user.id
          ? ` (lời mời của ${targetMeal.orderedByName})`
          : '';

      const nowFoodDone = consumeKind === 'food' ? true : targetMeal.foodEaten;
      const nowDrinkDone = consumeKind === 'drink' ? true : targetMeal.drinkDrunk;

      if (nowFoodDone && nowDrinkDone) {
        showKitchenNotice(
          `Đã dùng xong phần ăn${giftTag}! Hãy đi đến Bồn Rửa để rửa bát, rửa ly nhận +1 Công đức.`
        );
      } else if (consumeKind === 'food') {
        showKitchenNotice(`Đang thưởng thức ${foodName}${giftTag}. Hãy nhấn vào ly ${drinkName} để uống thêm nhé!`);
      } else {
        showKitchenNotice(`Đang thưởng thức ${drinkName}${giftTag} thanh mát. Hãy dùng nốt ${foodName} trên bàn nhé!`);
      }
    },
    [kitchenMeals, roomId, user.id, user.displayName, showKitchenNotice, unlockAudio]
  );

  const handleTriggerInteractable = useCallback(
    (action: RitualAction) => {
      unlockAudio();

      if (action === 'flower') {
        const nowMs = Date.now();
        const bloomed = gardenPlots.find((p) => getEffectiveFlowerStage(p, nowMs) >= 3);
        const empty = gardenPlots.find((p) => p.species === 'none' || getEffectiveFlowerStage(p, nowMs) === 0);
        const growing = gardenPlots.find((p) => {
          const st = getEffectiveFlowerStage(p, nowMs);
          return st > 0 && st < 3;
        });
        setActiveGardenPlotIndex((bloomed ?? empty ?? growing ?? gardenPlots[0])?.plotIndex ?? 0);
        return;
      }

      if (action === 'lantern') {
        setShowLanternModal(true);
        return;
      }

      if (action === 'wish') {
        setShowWishModal(true);
        return;
      }

      if (action === 'memorial') {
        setShowMemorialModal(true);
        return;
      }

      if (action === 'stupa') {
        if (busyStupaRef.current) return;
        busyStupaRef.current = true;
        void (async () => {
          try {
            const res = await ascendTempleStupa(roomId, user.id);
            if (!res.ok || res.slot === null) {
              showKitchenNotice(
                res.reason ||
                  'Đài Quan Sát Bảo Tháp tầng 9 hiện đã đủ 3/3 hành giả. Vui lòng đợi một lát nhé!'
              );
              return;
            }
            const slotPos = STUPA_DECK_SLOTS[res.slot] ?? STUPA_DECK_SLOTS[0];
            livePositionRef.current = { x: slotPos.x, y: slotPos.y, direction: 'down' };
            setViewingStupa(true);
            void triggerTempleRitual(roomId, user, 'stupa');
            zenAudio.playBellSound();
          } finally {
            busyStupaRef.current = false;
          }
        })();
        return;
      }

      if (action === 'kitchen_menu') {
        setShowKitchenMenuModal(true);
        return;
      }

      if (action === 'kitchen_table') {
        handleConsumeKitchenTarget();
        return;
      }

      if (action === 'kitchen_sink') {
        if (kitchenMeals.length === 0) {
          showKitchenNotice('Hãy chọn món chay và thức uống tại Quầy Thực Đơn trước khi rửa bát nhé!');
          setShowKitchenMenuModal(true);
          return;
        }
        const finishedMeals = kitchenMeals.filter((m) => m.foodEaten && m.drinkDrunk);
        if (finishedMeals.length === 0) {
          showKitchenNotice('Hãy ăn hết món chay và uống hết nước trên bàn rồi mới đi rửa bát, rửa ly nhé!');
          return;
        }
        const myFinished = finishedMeals.filter(
          (m) => m.targetUid === user.id || m.orderedByUid === user.id || m.recipientMode === 'all'
        );
        const toWash = myFinished.length > 0 ? myFinished : [finishedMeals[0]];
        void washKitchenDishesInFirestore(
          roomId,
          user,
          toWash.map((m) => m.id)
        );
        showMeritToast('Rửa bát, rửa ly sạch sẽ', 'Ăn xong tự dọn rửa, trọn vẹn nếp thiền');
        showKitchenNotice(`Đã rửa sạch ${toWash.length} bộ bát đĩa & ly! Bạn nhận được +1 Công đức.`);
        return;
      }

      void triggerTempleRitual(roomId, user, action);

      const meritLabels: Partial<Record<RitualAction, { title: string; blessing: string }>> = {
        incense: { title: 'Thắp hương lễ Phật', blessing: 'Hương trầm thanh tịnh, tâm bình an lạc' },
        bell: { title: 'Thỉnh Đại Hồng Chung', blessing: 'Chuông ngân thức tỉnh, phiền não tiêu tan' },
        sweep: { title: 'Quét lá sân chùa', blessing: 'Sân thiền sạch lá, lòng nhẹ an nhiên' },
        fish: { title: 'Thả cá phóng sinh', blessing: 'Gieo mầm từ bi, phước lành viên mãn' },
        feed_koi: { title: 'Cho cá Koi ăn', blessing: 'Đàn cá tung tăng, tâm thiện an hòa' },
        feed_birds: { title: 'Rải thức ăn cho chim', blessing: 'Bồ câu, chim sẻ sà xuống an vui nơi Vườn Hoa Giấy' },
        bow: { title: 'Lạy Phật thành tâm', blessing: 'Một lạy cung kính, tâm niệm sáng trong' },
      };

      const meritInfo = meritLabels[action];
      if (meritInfo) {
        showMeritToast(meritInfo.title, meritInfo.blessing);
      }

      if (action === 'fortune') {
        const slip = FORTUNE_SLIPS[Math.floor(Math.random() * FORTUNE_SLIPS.length)];
        setDrawnFortune(slip);
      }
    },
    [roomId, user, gardenPlots, kitchenMeals, handleConsumeKitchenTarget, showKitchenNotice, showMeritToast, unlockAudio]
  );

  const handleRequestRitual = useCallback(
    (action: RitualAction) => {
      unlockAudio();
      setRitualsExpanded(false);
      setPendingRitual({ id: Date.now() + Math.random(), action });
    },
    [unlockAudio]
  );

  const handlePlantFlower = async (plotIndex: number, species: Exclude<FlowerSpecies, 'none'>) => {
    unlockAudio();
    setBusyGarden(true);
    try {
      await plantTempleFlower(roomId, user, plotIndex, species);
      const pos = GARDEN_PLOT_POSITIONS[plotIndex];
      if (pos) {
        setEffects((prev) => [
          ...prev.slice(-8),
          { id: Date.now() + Math.random(), kind: 'flower', x: pos.x, y: pos.y, createdAt: performance.now() },
        ]);
      }
      zenAudio.playGardenWaterSound();
    } finally {
      setBusyGarden(false);
    }
  };

  const handleOfferFlower = async (plot: GardenPlotState) => {
    unlockAudio();
    setBusyGarden(true);
    try {
      await offerTempleFlower(roomId, user, plot);
      const pos = GARDEN_PLOT_POSITIONS[plot.plotIndex];
      if (pos) {
        setEffects((prev) => [
          ...prev.slice(-8),
          { id: Date.now() + Math.random(), kind: 'flower', x: pos.x, y: pos.y, createdAt: performance.now() },
        ]);
      }
      zenAudio.playIncenseChime();
      showMeritToast('Dâng hoa tươi lên Phật', 'Hương hoa thanh khiết, phước huệ song tu');
    } finally {
      setBusyGarden(false);
    }
  };

  const handleClearFlowerPlot = async (plotIndex: number) => {
    setBusyGarden(true);
    try {
      await clearTempleFlowerPlot(roomId, plotIndex);
    } finally {
      setBusyGarden(false);
    }
  };

  const handleSubmitLantern = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    setBusyLantern(true);
    try {
      await releasePondLantern(roomId, user, lanternWish, lanternColor);
      setEffects((prev) => [
        ...prev.slice(-8),
        {
          id: Date.now() + Math.random(),
          kind: 'lantern',
          x: INTERACTABLES.lantern.x,
          y: INTERACTABLES.lantern.y,
          createdAt: performance.now(),
        },
      ]);
      zenAudio.playLanternSound();
      showMeritToast('Thả hoa đăng Ao Sen', 'Ánh đăng soi rọi, nguyện ước bình an');
      setLanternWish('');
      setShowLanternModal(false);
    } finally {
      setBusyLantern(false);
    }
  };

  const handleSubmitWish = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    setBusyWish(true);
    try {
      await tossWishRibbon(roomId, user, wishInput);
      setEffects((prev) => [
        ...prev.slice(-8),
        {
          id: Date.now() + Math.random(),
          kind: 'wish',
          x: INTERACTABLES.wish.x,
          y: INTERACTABLES.wish.y,
          createdAt: performance.now(),
        },
      ]);
      zenAudio.playWishRibbonSound();
      showMeritToast('Gửi ước lên Cây Nguyện Ước', 'Dải băng đỏ tung bay, tâm nguyện sớm viên thành');
      setWishInput('');
      setShowWishModal(false);
    } finally {
      setBusyWish(false);
    }
  };

  const handleSubmitMemorial = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = memorialName.trim().slice(0, 36);
    if (!cleanName) return;
    unlockAudio();
    setBusyMemorial(true);
    try {
      await performMemorialCeremony(roomId, user, cleanName, memorialWish);
      setEffects((prev) => [
        ...prev.slice(-8),
        {
          id: Date.now() + Math.random(),
          kind: 'memorial',
          x: INTERACTABLES.memorial.x,
          y: INTERACTABLES.memorial.y,
          createdAt: performance.now(),
        },
      ]);
      setLatestMemorial({
        deceasedName: cleanName,
        createdAt: Date.now(),
      });
      zenAudio.playMemorialChimeSound();
      showMeritToast(
        `Cầu siêu · ${cleanName}`,
        'Ánh sen lành tỏa sáng, hương linh an nhiên siêu thoát'
      );
      setMemorialName('');
      setMemorialWish('');
      setShowMemorialModal(false);
    } finally {
      setBusyMemorial(false);
    }
  };

  const handleSendChat = (e: FormEvent, presetText?: string) => {
    e.preventDefault();
    const text = (presetText ?? chatInput).trim();
    if (!text) return;
    void sendRoomChatMessage(roomId, user, text);
    if (!presetText) setChatInput('');
  };

  const handleQuickCharacterChange = async (characterId: CharacterId) => {
    setSavingChar(true);
    try {
      const updated = updateLocalProfileCacheOnly({ characterId }, user);
      onUserUpdated(updated);
      if (me) {
        await syncPlayerPosition(
          roomId,
          user.id,
          me.x,
          me.y,
          me.direction,
          me.pose,
          me.cushionIndex,
          me.benchIndex
        );
      }
      setShowCharacterModal(false);
    } finally {
      setSavingChar(false);
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    unlockAudio();
    setVolume(nextVol);
    zenAudio.setVolume(nextVol);
    if (nextVol > 0 && muted) {
      setMuted(false);
      zenAudio.setMuted(false);
    }
  };

  const toggleMute = () => {
    unlockAudio();
    const nextMuted = !muted;
    setMuted(nextMuted);
    zenAudio.setMuted(nextMuted);
  };

  const activePlaylist = resolveEffectivePlaylist(tracks, effectiveMusicState);
  const activeTrack =
    tracks.find((t) => t.id === effectiveMusicState.activeTrackId) || tracks[0];
  const activePlaylistPos =
    effectiveMusicState.playMode === 'playlist'
      ? activePlaylist.findIndex((t) => t.id === activeTrack?.id)
      : -1;
  const totalMeritCount = players.reduce(
    (sum, p) =>
      sum +
      p.incenseCount +
      p.bellCount +
      p.sweepCount +
      p.fishCount +
      p.flowerCount +
      p.lanternCount +
      p.koiFeedCount +
      p.wishCount +
      (p.bowCount ?? 0) +
      (p.kitchenWashCount ?? 0) +
      (p.memorialCount ?? 0),
    0
  );
  const stupaOccupantCount = (roomMeta?.stupaSlots ?? []).filter(Boolean).length;
  // Active visible incense sticks in Lư Hương decay back down to 1-2 sticks ~75s after offering
  const recentIncenseCount = messages.filter(
    (m) => m.action === 'incense' && atmosphereNowMs - m.timestamp >= -2500 && atmosphereNowMs - m.timestamp < 75_000
  ).length;
  const activeIncenseCount = Math.min(
    9,
    (roomMeta?.incenseCount && roomMeta.incenseCount >= 2 ? 2 : 1) + recentIncenseCount
  );
  const bottomHudInsetPx = isCompactScreen
    ? chatExpanded
      ? 235
      : ritualsExpanded
      ? 244
      : 66
    : 66;
  const isFirstPerson = viewMode === 'first-person';
  const hudGlassClass = isFirstPerson
    ? 'bg-[#1C1613]/72 hover:bg-[#1C1613]/88'
    : 'bg-[#1C1613]/42 hover:bg-[#1C1613]/65 backdrop-blur-sm';
  const popoverGlassClass = isFirstPerson
    ? 'bg-[#1E1815]/92'
    : 'bg-[#1E1815]/82 backdrop-blur-md';
  const atm = getTempleAtmosphere(atmosphereNowMs, atmospherePref);
  const renderTimeIcon = () => {
    if (atm.timePhase === 'dawn') return <Sunrise className="w-3.5 h-3.5 text-[#F6B885] shrink-0" />;
    if (atm.timePhase === 'sunset') return <Sunset className="w-3.5 h-3.5 text-[#F39C63] shrink-0" />;
    if (atm.timePhase === 'night') return <Moon className="w-3.5 h-3.5 text-[#BFD4FF] shrink-0" />;
    return <Sun className="w-3.5 h-3.5 text-[#F7D288] shrink-0" />;
  };
  const renderWeatherIcon = () => {
    if (atm.weather === 'rain') return <CloudRain className="w-3.5 h-3.5 text-[#9FD5F5] shrink-0" />;
    if (atm.weather === 'mist') return <CloudFog className="w-3.5 h-3.5 text-[#D2E3E8] shrink-0" />;
    if (atm.weather === 'breeze') return <Wind className="w-3.5 h-3.5 text-[#F4B8C8] shrink-0" />;
    return null;
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#4E6340] text-[#FBF7F0] select-none">
      {/* Full-Screen Interactive Temple Canvas / 3D First-Person Layer */}
      <div
        className="absolute inset-0 z-0"
        onClick={() => {
          if (!audioStarted) unlockAudio();
          if (showAudioPopover) setShowAudioPopover(false);
          if (showMobileMenu) setShowMobileMenu(false);
          if (showAtmospherePopover) setShowAtmospherePopover(false);
        }}
      >
        {!room ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-[#F5EFE6] px-4 text-center">
            Đang kết nối khuôn viên chùa qua Firebase...
          </div>
        ) : (
          <>
            {!isFirstPerson && (
              <TempleCanvas
                room={room}
                currentUserId={user.id}
                lowResourceMode={lowResourceMode}
                effects={effects}
                ritualRequest={pendingRitual}
                initialPosition={livePositionRef.current}
                livePositionRef={livePositionRef}
                paused={isLoading3D}
                topHudInsetPx={56}
                bottomHudInsetPx={bottomHudInsetPx}
                atmospherePref={atmospherePref}
                zoomScale={zoomScale}
                onZoomChange={(next) => setZoomScale(clampZoom2D(next))}
                viewingStupa={viewingStupa}
                activeIncenseCount={activeIncenseCount}
                latestMemorial={latestMemorial}
                kitchenMeals={kitchenMeals}
                onKitchenMealTap={handleConsumeKitchenTarget}
                onMoveLocal={sendMove}
                onSitCushion={handleSitCushion}
                onSitBench={handleSitBench}
                onTriggerInteractable={handleTriggerInteractable}
                onSelectGardenPlot={(plotIndex) => {
                  unlockAudio();
                  setActiveGardenPlotIndex(plotIndex);
                }}
                onInspectPrecepts={() => {
                  unlockAudio();
                  setShowPreceptsModal(true);
                }}
              />
            )}
            {(isFirstPerson || isLoading3D) && (
              <div
                className={
                  isFirstPerson
                    ? 'w-full h-full'
                    : 'absolute inset-0 z-[1] opacity-0 pointer-events-none'
                }
                aria-hidden={!isFirstPerson}
              >
                <TempleFirstPersonView
                  room={room}
                  currentUserId={user.id}
                  lowResourceMode={lowResourceMode}
                  effects={effects}
                  ritualRequest={pendingRitual}
                  initialPosition={livePositionRef.current}
                  livePositionRef={livePositionRef}
                  isViewActive={isFirstPerson}
                  bottomHudInsetPx={bottomHudInsetPx}
                  atmospherePref={atmospherePref}
                  fovDeg={fov3D}
                  onFovChange={(nextFov) => setFov3D(clampFov3D(nextFov))}
                  viewingStupa={viewingStupa}
                  onExitStupa={handleExitStupa}
                  activeIncenseCount={activeIncenseCount}
                  latestMemorial={latestMemorial}
                  kitchenMeals={kitchenMeals}
                  onKitchenMealClick={handleConsumeKitchenTarget}
                  onMoveLocal={sendMove}
                  onSitCushion={handleSitCushion}
                  onSitBench={handleSitBench}
                  onTriggerInteractable={handleTriggerInteractable}
                  onSelectGardenPlot={(plotIndex) => {
                    unlockAudio();
                    setActiveGardenPlotIndex(plotIndex);
                  }}
                  onInspectPrecepts={() => {
                    unlockAudio();
                    setShowPreceptsModal(true);
                  }}
                  onLoadProgress={handle3DLoadProgress}
                  onReady={handle3DReady}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Peaceful Ambient Particle System (Floating Lotus/Bodhi Petals & Soft Glowing Dust Motes) */}
      <PeacefulParticlesOverlay disabled={lowResourceMode || isFirstPerson} />

      {/* Floating Top HUD Bar (Translucent Glass) */}
      <header className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between gap-1.5 sm:gap-2 pointer-events-none pt-[env(safe-area-inset-top)]">
        {/* Left: Room Title & Automatic Day/Night & Weather Trigger */}
        <div className="pointer-events-auto relative flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              setShowMeritModal(true);
              setShowAudioPopover(false);
              setShowMobileMenu(false);
              setShowAtmospherePopover(false);
            }}
            className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 flex items-center gap-1.5 sm:gap-2 text-left shadow-md transition-colors cursor-pointer touch-manipulation min-w-0`}
          >
            <span className="font-display text-xs sm:text-sm font-semibold text-[#FBF7F0] drop-shadow-sm truncate max-w-[92px] sm:max-w-[200px]">
              {room?.name || 'Đang vào chùa...'}
            </span>
            <span className="text-[#F5DFB0]/50" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono-num text-[#F7D288] whitespace-nowrap shrink-0">
              <Users className="w-3.5 h-3.5" />
              {room ? `${room.players.length}/${room.maxPlayers}` : '0/10'}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono-num text-[#F5EFE6] whitespace-nowrap shrink-0">
              <Award className="w-3.5 h-3.5 text-[#E8B86A]" />
              {totalMeritCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAtmospherePopover((v) => !v);
              setShowAudioPopover(false);
              setShowMobileMenu(false);
            }}
            title={`Thời tiết & Ngày đêm: ${atm.timeLabel} · ${atm.weatherLabel}`}
            aria-label={`Thời tiết và ngày đêm: ${atm.timeLabel}, ${atm.weatherLabel}`}
            className={`min-h-[38px] px-2 sm:px-2.5 py-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#F5EFE6] shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation`}
          >
            {renderTimeIcon()}
            {renderWeatherIcon()}
            <span className="hidden md:inline">
              {atm.timeLabel} · {atm.weatherLabel}
            </span>
          </button>

          {showAtmospherePopover && (
            <div className={`absolute left-0 top-11 w-64 sm:w-72 rounded-xl ${popoverGlassClass} border border-[#F5DFB0]/25 p-3.5 shadow-2xl space-y-3 z-30`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#FBF7F0]">
                  Ngày Đêm & Thời Tiết
                </div>
                {canControlAtmosphere && (atmospherePref.time !== 'auto' || atmospherePref.weather !== 'auto') ? (
                  <button
                    type="button"
                    onClick={() => void updateSharedAtmosphere(user.displayName, 'auto', 'auto')}
                    className="px-2 py-0.5 rounded-md bg-[#E5B869]/20 hover:bg-[#E5B869]/35 border border-[#E8B86A]/45 text-[11px] font-medium text-[#F7D288] cursor-pointer"
                  >
                    Về tự động
                  </button>
                ) : (
                  <span className="text-[11px] text-[#A9E0A4] font-medium">
                    {atmospherePref.time === 'auto' && atmospherePref.weather === 'auto' ? 'Tự động' : 'Đồng bộ toàn chùa'}
                  </span>
                )}
              </div>

              {!canControlAtmosphere && (
                <div className="px-2.5 py-1.5 rounded-lg bg-[#1A1512]/80 border border-[#F5DFB0]/15 text-[11px] text-[#C7BDB1] leading-snug">
                  Chỉ Quản trị viên chính hoặc Phó quản trị mới có quyền điều chỉnh thời tiết & ngày/đêm toàn chùa.
                </div>
              )}

              <div className="space-y-1.5">
                <div className="text-[11px] text-[#C7BDB1]">Thời gian ({atm.timeLabel})</div>
                <div className="grid grid-cols-3 gap-1">
                  {(['auto', 'dawn', 'day', 'sunset', 'night'] as TimeOfDayOverride[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={!canControlAtmosphere}
                      onClick={() => {
                        if (!canControlAtmosphere) return;
                        void updateSharedAtmosphere(user.displayName, opt, atmospherePref.weather);
                      }}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                        canControlAtmosphere ? 'cursor-pointer' : 'cursor-default opacity-75'
                      } ${
                        atmospherePref.time === opt
                          ? 'bg-[#E5B869]/90 border-[#FBF0D4]/60 text-[#1A1614] font-semibold'
                          : 'bg-[#1A1512]/65 hover:bg-[#2B231D] border-[#F5DFB0]/15 text-[#F5EFE6]'
                      }`}
                    >
                      {opt === 'auto' ? 'Tự động' : TIME_PHASE_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] text-[#C7BDB1]">Thời tiết ({atm.weatherLabel})</div>
                <div className="grid grid-cols-3 gap-1">
                  {(['auto', 'clear', 'breeze', 'mist', 'rain'] as WeatherOverride[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={!canControlAtmosphere}
                      onClick={() => {
                        if (!canControlAtmosphere) return;
                        void updateSharedAtmosphere(user.displayName, atmospherePref.time, opt);
                      }}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                        canControlAtmosphere ? 'cursor-pointer' : 'cursor-default opacity-75'
                      } ${
                        atmospherePref.weather === opt
                          ? 'bg-[#E5B869]/90 border-[#FBF0D4]/60 text-[#1A1614] font-semibold'
                          : 'bg-[#1A1512]/65 hover:bg-[#2B231D] border-[#F5DFB0]/15 text-[#F5EFE6]'
                      }`}
                    >
                      {opt === 'auto' ? 'Tự động' : WEATHER_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>

              {atmosphereSetting.updatedBy && (
                <div className="text-[10px] text-[#9E9387] border-t border-[#F5DFB0]/10 pt-1.5">
                  Thiết lập bởi: <span className="text-[#E5DCD1]">{atmosphereSetting.updatedBy}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Floating Translucent Action Buttons + Popovers */}
        <div className="pointer-events-auto relative flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* View Mode Switcher: Toàn cảnh (2D) <-> Góc nhìn nhân vật (3D Thứ 1) */}
          <button
            type="button"
            disabled={isLoading3D}
            onClick={handleToggleViewMode}
            aria-label={
              isLoading3D
                ? `Đang chuyển sang góc nhìn 3D ${Math.round(transitionProgress)}%`
                : isFirstPerson
                ? 'Chuyển về góc nhìn toàn cảnh'
                : 'Chuyển sang góc nhìn nhân vật'
            }
            title={
              isLoading3D
                ? 'Đang dựng khung cảnh 3D...'
                : isFirstPerson
                ? 'Đang ở góc nhìn nhân vật (nhấn để xem toàn cảnh)'
                : 'Xem dưới góc nhìn trực tiếp của nhân vật'
            }
            className={`relative overflow-hidden min-h-[38px] px-2.5 sm:px-3 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 shadow-md transition-colors whitespace-nowrap shrink-0 touch-manipulation ${
              isLoading3D
                ? 'bg-[#211A15]/92 border-[#E8B86A]/85 text-[#FFF9EC] font-semibold cursor-wait'
                : isFirstPerson
                ? 'bg-[#E5B869]/90 hover:bg-[#E5B869] border-[#FBF0D4]/65 text-[#1A1614] font-semibold cursor-pointer'
                : `${hudGlassClass} border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 text-[#FBF7F0] cursor-pointer`
            }`}
          >
            {isLoading3D && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#B86E28]/70 via-[#E5A94E]/80 to-[#F7D288]/85 transition-[width] duration-100 ease-out pointer-events-none"
                  style={{ width: `${Math.min(100, Math.round(transitionProgress))}%` }}
                />
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 h-[3px] bg-[#FFE7A3] shadow-[0_0_8px_rgba(255,231,163,0.9)] transition-[width] duration-100 ease-out pointer-events-none"
                  style={{ width: `${Math.min(100, Math.round(transitionProgress))}%` }}
                />
              </>
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
              {isLoading3D ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#FFE7A3] animate-pulse shrink-0" />
                  <span className="sm:hidden font-mono-num">
                    3D · {Math.min(100, Math.round(transitionProgress))}%
                  </span>
                  <span className="hidden sm:inline font-mono-num">
                    Đang mở 3D · {Math.min(100, Math.round(transitionProgress))}%
                  </span>
                </>
              ) : isFirstPerson ? (
                <>
                  <Compass className="w-3.5 h-3.5 shrink-0 drop-shadow-none" />
                  <span className="drop-shadow-none">Toàn cảnh</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#E8B86A] shrink-0" />
                  <span className="sm:hidden">Góc nhìn</span>
                  <span className="hidden sm:inline">Góc nhìn nhân vật</span>
                </>
              )}
            </span>
          </button>

          {/* Audio Toggle / Volume Popover Trigger */}
          <button
            type="button"
            onClick={() => {
              if (!audioStarted) unlockAudio();
              setShowAudioPopover((v) => !v);
              setShowMobileMenu(false);
              setShowAtmospherePopover(false);
            }}
            aria-label="Âm thanh & Nhạc thiền"
            className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 shadow-md transition-colors cursor-pointer touch-manipulation ${
              !audioStarted
                ? 'bg-[#E5B869]/85 hover:bg-[#E5B869] border-[#FBF0D4]/60 text-[#1A1614] font-semibold'
                : `${hudGlassClass} border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 text-[#FBF7F0]`
            }`}
          >
            {muted || volume === 0 ? (
              <VolumeX className="w-4 h-4 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 shrink-0" />
            )}
            {!audioStarted && <span className="hidden sm:inline whitespace-nowrap">Bật Nhạc</span>}
          </button>

          {/* Desktop Quick Controls */}
          <button
            type="button"
            onClick={() => setShowCharacterModal(true)}
            className={`hidden md:inline-flex min-h-[38px] px-3 py-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 items-center gap-1.5 text-xs font-medium text-[#FBF7F0] shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
          >
            <UserCog className="w-4 h-4 text-[#E8B86A]" />
            Đổi Nhân Vật
          </button>

          <button
            type="button"
            onClick={() => setLowResourceMode((v) => !v)}
            className={`hidden md:inline-flex min-h-[38px] px-3 py-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 items-center gap-1.5 text-xs font-medium shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              lowResourceMode ? 'text-[#F7D288]' : 'text-[#FBF7F0]'
            }`}
          >
            <Cpu className="w-4 h-4" />
            {lowResourceMode ? 'Siêu nhẹ: Bật' : 'Siêu nhẹ'}
          </button>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            aria-label="Mã QR mời bạn"
            className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 inline-flex items-center gap-1.5 text-xs font-medium text-[#FBF7F0] shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation`}
          >
            <QrCode className="w-4 h-4 text-[#E8B86A]" />
            <span className="hidden sm:inline">Mã QR</span>
          </button>

          {canControlMusic && (
            <button
              type="button"
              onClick={() => setShowAdminMusic(true)}
              className={`hidden md:inline-flex min-h-[38px] px-3 py-1 rounded-xl ${hudGlassClass} border border-[#E8B86A]/50 items-center gap-1.5 text-xs font-medium text-[#F7D288] shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Nhạc Chùa
            </button>
          )}

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => {
              setShowMobileMenu((v) => !v);
              setShowAudioPopover(false);
              setShowAtmospherePopover(false);
            }}
            aria-label="Tùy chọn khác"
            className={`md:hidden min-h-[38px] min-w-[38px] px-2 py-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 inline-flex items-center justify-center text-[#FBF7F0] shadow-md transition-colors cursor-pointer touch-manipulation`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Leave Temple */}
          <button
            type="button"
            onClick={() => onLeaveRoom()}
            aria-label="Rời chùa"
            className={`min-h-[38px] px-2.5 sm:px-3.5 py-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 inline-flex items-center gap-1.5 text-xs font-medium text-[#FBF7F0] shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rời Chùa</span>
          </button>

          {/* Floating Audio Popover */}
          {showAudioPopover && (
            <div className={`absolute right-0 top-11 w-64 rounded-xl ${popoverGlassClass} border border-[#F5DFB0]/25 p-3.5 shadow-2xl space-y-3 z-30`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#F5EFE6] truncate">
                    {activeTrack?.title || 'Thiền Tâm Nhã Khúc'}
                  </div>
                  <div className="text-[11px] text-[#C7BDB1] truncate">
                    {effectiveMusicState.isPlaying ? 'Đang phát' : 'Admin tạm dừng'} ·{' '}
                    {effectiveMusicState.playMode === 'playlist' && activePlaylistPos >= 0
                      ? `Danh sách ${activePlaylistPos + 1}/${activePlaylist.length}`
                      : activeTrack?.sourceType === 'builtin'
                      ? 'Mặc định'
                      : 'Danh sách Admin'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="px-2.5 py-1 rounded-lg bg-[#2E2620]/80 hover:bg-[#3B312B] text-[11px] font-medium text-[#E8B86A] shrink-0 cursor-pointer"
                >
                  {muted || volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <VolumeX className="w-3.5 h-3.5 text-[#9E9387] shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  aria-label="Âm lượng cá nhân"
                  className="flex-1 accent-[#D99B52] cursor-pointer"
                />
                <Volume2 className="w-3.5 h-3.5 text-[#E8B86A] shrink-0" />
              </div>
            </div>
          )}

          {/* Floating Mobile Options Menu */}
          {showMobileMenu && (
            <div className={`md:hidden absolute right-0 top-11 w-52 rounded-xl ${popoverGlassClass} border border-[#F5DFB0]/25 p-1.5 shadow-2xl space-y-1 z-30`}>
              <button
                type="button"
                disabled={isLoading3D}
                onClick={handleToggleViewMode}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-[#2C241F]/80 text-left text-xs font-medium text-[#F7D288] flex items-center gap-2 cursor-pointer touch-manipulation disabled:opacity-70"
              >
                {isFirstPerson ? <Compass className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {isLoading3D
                  ? `Đang mở 3D (${Math.min(100, Math.round(transitionProgress))}%)`
                  : isFirstPerson
                  ? 'Về góc nhìn toàn cảnh'
                  : 'Xem góc nhìn nhân vật'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCharacterModal(true);
                  setShowMobileMenu(false);
                }}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-[#2C241F]/80 text-left text-xs font-medium text-[#F5EFE6] flex items-center gap-2 cursor-pointer touch-manipulation"
              >
                <UserCog className="w-4 h-4 text-[#E8B86A]" />
                Đổi Nhân Vật
              </button>
              <button
                type="button"
                onClick={() => {
                  setLowResourceMode((v) => !v);
                  setShowMobileMenu(false);
                }}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-[#2C241F]/80 text-left text-xs font-medium text-[#F5EFE6] flex items-center gap-2 cursor-pointer touch-manipulation"
              >
                <Cpu className={`w-4 h-4 ${lowResourceMode ? 'text-[#E8B86A]' : 'text-[#C7BDB1]'}`} />
                {lowResourceMode ? 'Chế độ siêu nhẹ: Đang bật' : 'Bật chế độ siêu nhẹ'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMeritModal(true);
                  setShowMobileMenu(false);
                }}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-[#2C241F]/80 text-left text-xs font-medium text-[#F5EFE6] flex items-center gap-2 cursor-pointer touch-manipulation"
              >
                <Award className="w-4 h-4 text-[#E8B86A]" />
                Công đức tích lũy ({totalMeritCount})
              </button>
              {canControlMusic && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminMusic(true);
                    setShowMobileMenu(false);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg hover:bg-[#2C241F]/80 text-left text-xs font-medium text-[#F7D288] flex items-center gap-2 cursor-pointer touch-manipulation"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Điều Khiển Nhạc
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Stupa 9th-Tier Observation Deck Banner ("Xuống Bảo Tháp") */}
      {viewingStupa && (
        <div className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md pt-[env(safe-area-inset-top)] pointer-events-auto">
          <div className={`px-3.5 py-2.5 rounded-xl ${isFirstPerson ? 'bg-[#1C1613]/90' : 'bg-[#1C1613]/78 backdrop-blur-md'} border border-[#E8B86A]/60 shadow-2xl flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-2 min-w-0">
              <Landmark className="w-4 h-4 text-[#F7D288] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#FBF7F0] truncate">
                  Đài Quan Sát · Bảo Tháp Tầng 9 ({Math.max(1, stupaOccupantCount)}/{STUPA_DECK_CAPACITY} người)
                </div>
                <div className="text-[10px] text-[#C7BDB1] truncate">
                  {isFirstPerson
                    ? 'Đi lại trên đài, kéo xoay 360° ngắm toàn cảnh chùa & biển'
                    : 'Toàn cảnh Từ Bi Viện từ Bảo Tháp 9 tầng'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleExitStupa}
              className="px-3 py-1.5 rounded-lg bg-[#E5B869] hover:bg-[#F0C87D] text-[#1A1614] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
            >
              Xuống Bảo Tháp
            </button>
          </div>
        </div>
      )}

      {/* Compact 2D / 3D Zoom Controls */}
      {!viewingStupa && (
        <div className="absolute top-14 right-2.5 z-20 pt-[env(safe-area-inset-top)] pointer-events-auto">
          <div className={`inline-flex items-center gap-0.5 p-1 rounded-xl ${hudGlassClass} border border-[#F5DFB0]/25 shadow-md`}>
            <button
              type="button"
              onClick={() => {
                if (isFirstPerson) {
                  setFov3D((f) => clampFov3D(f + 8));
                } else {
                  setZoomScale((z) => clampZoom2D(z - 0.2));
                }
              }}
              title="Thu nhỏ"
              aria-label="Thu nhỏ góc nhìn"
              className="w-7 h-7 rounded-lg hover:bg-white/10 inline-flex items-center justify-center text-[#F5EFE6] cursor-pointer touch-manipulation"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (isFirstPerson) setFov3D(62);
                else setZoomScale(1.0);
              }}
              title="Đặt lại thu phóng mặc định"
              className="px-1.5 h-7 rounded-lg hover:bg-white/10 text-[11px] font-mono-num text-[#F7D288] cursor-pointer touch-manipulation min-w-[42px]"
            >
              {isFirstPerson ? `${Math.round((62 / fov3D) * 100)}%` : `${Math.round(zoomScale * 100)}%`}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isFirstPerson) {
                  setFov3D((f) => clampFov3D(f - 8));
                } else {
                  setZoomScale((z) => clampZoom2D(z + 0.2));
                }
              }}
              title="Phóng to"
              aria-label="Phóng to góc nhìn"
              className="w-7 h-7 rounded-lg hover:bg-white/10 inline-flex items-center justify-center text-[#F5EFE6] cursor-pointer touch-manipulation"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Auto-Hiding Merit Notification Banner */}
      {meritToast && (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-sm transition-all duration-300 ease-out pt-[env(safe-area-inset-top)] ${
            meritToast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}
        >
          <div className={`px-3.5 py-2.5 rounded-xl ${isFirstPerson ? 'bg-[#1C1613]/88' : 'bg-[#1C1613]/75 backdrop-blur-md'} border border-[#E8B86A]/55 shadow-2xl flex items-center gap-2.5`}>
            <div className="w-8 h-8 rounded-lg bg-[#E5B869]/20 border border-[#E8B86A]/45 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4 text-[#F7D288]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#FBF7F0]">
                <span className="truncate">+1 Công đức · {meritToast.title}</span>
                <span className="font-mono-num text-[11px] text-[#F7D288] whitespace-nowrap shrink-0">
                  Tổng {meritToast.totalMerit}
                </span>
              </div>
              <p className="text-[11px] text-[#E5DCD1] truncate mt-0.5">{meritToast.blessing}</p>
            </div>
          </div>
        </div>
      )}

      {/* Status Notice Banner */}
      {kitchenNotice && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-29 w-[calc(100%-1.5rem)] max-w-md pt-[env(safe-area-inset-top)]"
          style={{ marginTop: meritToast ? 62 : 0 }}
        >
          <div className={`px-3.5 py-2 rounded-xl ${isFirstPerson ? 'bg-[#1C1613]/90' : 'bg-[#1C1613]/78 backdrop-blur-md'} border ${kitchenNotice.includes('Bảo Tháp') || kitchenNotice.includes('Đài Quan Sát') ? 'border-[#E8B86A]/55' : 'border-[#9CD89A]/45'} shadow-xl flex items-center gap-2`}>
            {kitchenNotice.includes('Bảo Tháp') || kitchenNotice.includes('Đài Quan Sát') ? (
              <Landmark className="w-4 h-4 text-[#F7D288] shrink-0" />
            ) : (
              <UtensilsCrossed className="w-4 h-4 text-[#A9E0A4] shrink-0" />
            )}
            <p className="text-xs text-[#F5EFE6] leading-snug">{kitchenNotice}</p>
          </div>
        </div>
      )}

      {/* Bottom Floating HUD: Collapsed by default into 1 slim translucent row */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex flex-wrap sm:flex-nowrap items-end justify-between gap-2 pointer-events-none pb-[env(safe-area-inset-bottom)]">
        {/* Floating Chat Box (Collapsed = slim translucent input + expand button; Expanded = history + presets) */}
        <section
          aria-label="Hộp thoại trò chuyện"
          className={`pointer-events-auto ${isFirstPerson ? 'bg-[#1C1613]/72' : 'bg-[#1C1613]/42 backdrop-blur-sm'} border border-[#F5DFB0]/25 rounded-xl shadow-lg overflow-hidden flex flex-col transition-all ${
            chatExpanded ? 'w-full sm:w-[350px]' : 'flex-1 min-w-0 sm:flex-none sm:w-[290px]'
          }`}
        >
          {chatExpanded && (
            <>
              <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-[#F5DFB0]/15 bg-[#1C1613]/25">
                <span className="text-xs font-semibold text-[#FBF7F0]">Lời Chúc & Trò Chuyện</span>
                <button
                  type="button"
                  onClick={() => setChatExpanded(false)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E5DCD1] hover:text-[#FBF7F0] py-0.5 px-1.5 rounded hover:bg-black/25 cursor-pointer touch-manipulation"
                >
                  Thu gọn <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="px-2.5 pt-2 space-y-1.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {['A Di Đà Phật', 'Chúc bình an', 'Ngồi thiền nhé'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={(e) => handleSendChat(e, preset)}
                      className="px-2.5 py-1 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5DFB0]/20 text-[11px] text-[#F5EFE6] whitespace-nowrap shrink-0 transition-colors cursor-pointer touch-manipulation"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="h-[104px] sm:h-[145px] overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {messages.length === 0 && (
                    <p className="text-[#E5DCD1]/80 italic py-1">
                      Không gian yên tĩnh. Hãy gửi lời chào an lành tới bạn đồng tu.
                    </p>
                  )}
                  {messages.map((msg) =>
                    msg.kind === 'system' ? (
                      <div key={msg.id} className="text-[#E5DCD1]/90 italic leading-snug drop-shadow-sm">
                        {msg.text}
                      </div>
                    ) : (
                      <div
                        key={msg.id}
                        className="bg-[#181310]/55 border border-[#F5DFB0]/15 rounded-lg px-2.5 py-1.5 leading-snug"
                      >
                        <span className="font-semibold text-[#F7D288]">{msg.displayName}: </span>
                        <span className="text-[#FBF7F0] break-words">{msg.text}</span>
                      </div>
                    )
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>
            </>
          )}

          <form onSubmit={(e) => handleSendChat(e)} className="p-1.5 flex items-center gap-1.5">
            {!chatExpanded && (
              <button
                type="button"
                onClick={() => setChatExpanded(true)}
                aria-label="Mở hộp thoại trò chuyện"
                className="min-h-[34px] px-2 py-1 rounded-lg bg-[#181310]/45 hover:bg-[#181310]/70 border border-[#F5DFB0]/20 text-[11px] font-medium text-[#FBF7F0] inline-flex items-center gap-1 shrink-0 cursor-pointer touch-manipulation"
              >
                <ChevronUp className="w-3.5 h-3.5 text-[#E8B86A]" />
                <span>Chat</span>
              </button>
            )}
            <input
              type="text"
              maxLength={140}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Nhắn lời an lành..."
              className="flex-1 min-w-0 px-2.5 py-1 bg-[#181310]/40 border border-[#F5DFB0]/20 rounded-lg text-base sm:text-xs text-[#FBF7F0] placeholder-[#E5DCD1]/65 focus:outline-none focus:border-[#E8B86A]"
            />
            <button
              type="submit"
              aria-label="Gửi tin nhắn"
              className="min-w-[34px] min-h-[34px] p-1.5 rounded-lg bg-[#E5B869]/85 hover:bg-[#E5B869] text-[#1A1614] shrink-0 inline-flex items-center justify-center transition-colors cursor-pointer touch-manipulation"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>

        {/* Floating Ritual Action Dock (Collapsed by default so game canvas stays clear) */}
        <div
          className={`pointer-events-auto flex flex-col items-end gap-1.5 ${
            ritualsExpanded && isCompactScreen ? 'w-full' : 'shrink-0'
          }`}
        >
          {/* Compact Vegetarian Kitchen Meal Progress Bar (shared room meals on table) */}
          {kitchenMeals.length > 0 && !showKitchenMenuModal && (() => {
            const featuredMeal =
              kitchenMeals.find(
                (m) =>
                  (!m.foodEaten || !m.drinkDrunk) &&
                  (m.targetUid === user.id || m.recipientMode === 'all')
              ) ??
              kitchenMeals.find((m) => m.targetUid === user.id || m.orderedByUid === user.id) ??
              kitchenMeals[0];
            const hasAnyFinished = kitchenMeals.some((m) => m.foodEaten && m.drinkDrunk);
            const ownerLabel =
              featuredMeal.orderedByUid !== user.id && featuredMeal.targetUid === user.id
                ? `${featuredMeal.orderedByName} mời bạn`
                : featuredMeal.recipientMode === 'all'
                ? 'Mời cả chùa'
                : featuredMeal.targetUid !== user.id && featuredMeal.targetName
                ? `Mời ${featuredMeal.targetName}`
                : null;
            return (
              <div className={`${isFirstPerson ? 'bg-[#1C1613]/82' : 'bg-[#1C1613]/58 backdrop-blur-sm'} border border-[#9CD89A]/40 rounded-xl p-1.5 shadow-lg flex items-center gap-1.5 flex-wrap justify-end`}>
                {ownerLabel && (
                  <span className="px-2 py-0.5 rounded-md bg-[#2E251F]/85 text-[10px] font-medium text-[#FCE5B2] whitespace-nowrap">
                    {ownerLabel}
                  </span>
                )}
                <button
                  type="button"
                  disabled={featuredMeal.foodEaten}
                  onClick={() => handleRequestRitual('kitchen_table')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                    featuredMeal.foodEaten
                      ? 'bg-[#2A241E]/60 border-[#5B5247]/40 text-[#9E9387] line-through cursor-default'
                      : 'bg-[#1A1512]/70 hover:bg-[#2A221B] border-[#E8B86A]/45 text-[#FBF7F0]'
                  }`}
                >
                  <UtensilsCrossed className="w-3.5 h-3.5 text-[#E8B86A]" />
                  {VEGETARIAN_FOOD_MENU.find((f) => f.id === featuredMeal.foodId)?.name ?? 'Món chay'}
                </button>
                <button
                  type="button"
                  disabled={featuredMeal.drinkDrunk}
                  onClick={() => handleRequestRitual('kitchen_table')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                    featuredMeal.drinkDrunk
                      ? 'bg-[#2A241E]/60 border-[#5B5247]/40 text-[#9E9387] line-through cursor-default'
                      : 'bg-[#1A1512]/70 hover:bg-[#2A221B] border-[#F2B84B]/45 text-[#FDE8B4]'
                  }`}
                >
                  <GlassWater className="w-3.5 h-3.5 text-[#F2B84B]" />
                  {VEGETARIAN_DRINK_MENU.find((d) => d.id === featuredMeal.drinkId)?.name ?? 'Thức uống'}
                </button>
                {kitchenMeals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowKitchenMenuModal(true)}
                    className="min-h-[34px] px-2 py-1 rounded-lg bg-[#1A1512]/65 hover:bg-[#2A221B] border border-[#F5DFB0]/25 text-[10px] font-mono-num text-[#E5DCD1] cursor-pointer whitespace-nowrap"
                  >
                    +{kitchenMeals.length - 1} phần
                  </button>
                )}
                {hasAnyFinished && (
                  <button
                    type="button"
                    onClick={() => handleRequestRitual('kitchen_sink')}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#9CD89A]/90 hover:bg-[#B2E6B0] border border-[#DCF6DB]/70 text-[11px] font-semibold text-[#152414] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Droplets className="w-3.5 h-3.5" />
                    Rửa Bát & Ly (+1 Công đức)
                  </button>
                )}
              </div>
            );
          })()}

          {ritualsExpanded && (
            <div className={`w-full sm:w-auto ${isFirstPerson ? 'bg-[#1C1613]/78' : 'bg-[#1C1613]/45 backdrop-blur-sm'} border border-[#F5DFB0]/25 rounded-xl p-1.5 shadow-lg grid grid-cols-3 sm:flex sm:items-center sm:flex-wrap gap-1.5`}>
              <button
                type="button"
                onClick={() => handleRequestRitual('bow')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#E8B86A]/45 text-xs font-medium text-[#FCE5B2] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Lạy Phật
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('incense')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5DFB0]/15 text-xs font-medium text-[#FBF7F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Thắp Hương
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('bell')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5DFB0]/15 text-xs font-medium text-[#FBF7F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Thỉnh Chuông
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('flower')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#9CD89A]/35 text-xs font-medium text-[#D9F4D4] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Trồng Hoa
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('lantern')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F7D288]/35 text-xs font-medium text-[#FCE5B2] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Hoa Đăng
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('feed_koi')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#9EDAD6]/35 text-xs font-medium text-[#CEEFF2] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Cho Cá Ăn
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('feed_birds')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5A8C9]/40 text-xs font-medium text-[#FFE4F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Cho Chim Ăn
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('sweep')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5DFB0]/15 text-xs font-medium text-[#FBF7F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Quét Lá
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('fish')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5DFB0]/15 text-xs font-medium text-[#FBF7F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Thả Cá
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('woodfish')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5DFB0]/15 text-xs font-medium text-[#FBF7F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Gõ Mõ
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('fortune')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F5DFB0]/15 text-xs font-medium text-[#FBF7F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Xin Xăm
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('wish')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F28C82]/40 text-xs font-medium text-[#FFD9D4] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Nguyện Ước
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('kitchen_menu')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#9CD89A]/45 text-xs font-medium text-[#D9F4D4] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Bếp Chay
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('memorial')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#F7D288]/45 text-xs font-medium text-[#FDE8B4] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Cầu Siêu
              </button>
              <button
                type="button"
                onClick={() => handleRequestRitual('stupa')}
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1512]/50 hover:bg-[#1A1512]/75 border border-[#E8B86A]/45 text-xs font-medium text-[#FCE5B2] transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Bảo Tháp ({stupaOccupantCount}/{STUPA_DECK_CAPACITY})
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {((me?.cushionIndex !== null && me?.cushionIndex !== undefined) ||
              (me?.benchIndex !== null && me?.benchIndex !== undefined)) && (
              <button
                type="button"
                onClick={handleStandUp}
                className="min-h-[46px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#E5B869]/90 hover:bg-[#E5B869] border border-[#FBF0D4]/50 text-xs font-semibold text-[#1A1614] shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation"
              >
                Đứng Dậy
              </button>
            )}
            <button
              type="button"
              onClick={() => setRitualsExpanded((v) => !v)}
              className={`min-h-[46px] sm:min-h-[40px] px-3.5 py-2 rounded-xl ${isFirstPerson ? 'bg-[#1C1613]/75 hover:bg-[#1C1613]/90' : 'bg-[#1C1613]/45 hover:bg-[#1C1613]/70 backdrop-blur-sm'} border border-[#F5DFB0]/25 hover:border-[#E8B86A]/60 inline-flex items-center gap-1.5 text-xs font-medium text-[#FBF7F0] shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#E8B86A]" />
              <span>Nghi lễ</span>
              {ritualsExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#E5DCD1]" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-[#E5DCD1]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Players & Accumulated Merit Table (Công đức tích lũy) */}
      {showMeritModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 max-w-md w-full max-h-[88dvh] overflow-y-auto space-y-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-[#FBF7F0]">
                Hành Giả & Công Đức Tích Lũy
              </h3>
              <button
                type="button"
                onClick={() => setShowMeritModal(false)}
                className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] px-2 py-1 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            {/* Merit Leaderboard */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F5EFE6] inline-flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#D99B52]" />
                  Công đức tích lũy
                </span>
                <span className="font-mono-num text-[#9E9387]">{totalMeritCount} lượt</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#332A24] bg-[#1A1614]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#332A24] text-[11px] text-[#9E9387]">
                      <th className="py-2 px-2.5 font-medium">Hành giả</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Lạy</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Hương</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Chuông</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Quét</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Cá</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Hoa</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Đăng</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Koi</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Cây</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Bếp</th>
                      <th className="py-2 px-1.5 font-medium text-right whitespace-nowrap">Cầu siêu</th>
                      <th className="py-2 px-2.5 font-semibold text-right whitespace-nowrap text-[#F7D288]">Tổng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2B231E]">
                    {players.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-3 px-2.5 text-center text-[#8D8276] italic">
                          Chưa có hành giả trong phòng.
                        </td>
                      </tr>
                    ) : (
                      [...players]
                        .sort((a, b) => {
                          const totalB =
                            b.incenseCount +
                            b.bellCount +
                            b.sweepCount +
                            b.fishCount +
                            b.flowerCount +
                            b.lanternCount +
                            b.koiFeedCount +
                            b.wishCount +
                            (b.bowCount ?? 0) +
                            (b.kitchenWashCount ?? 0) +
                            (b.memorialCount ?? 0);
                          const totalA =
                            a.incenseCount +
                            a.bellCount +
                            a.sweepCount +
                            a.fishCount +
                            a.flowerCount +
                            a.lanternCount +
                            a.koiFeedCount +
                            a.wishCount +
                            (a.bowCount ?? 0) +
                            (a.kitchenWashCount ?? 0) +
                            (a.memorialCount ?? 0);
                          return totalB - totalA;
                        })
                        .map((p) => {
                          const totalP =
                            p.incenseCount +
                            p.bellCount +
                            p.sweepCount +
                            p.fishCount +
                            p.flowerCount +
                            p.lanternCount +
                            p.koiFeedCount +
                            p.wishCount +
                            (p.bowCount ?? 0) +
                            (p.kitchenWashCount ?? 0) +
                            (p.memorialCount ?? 0);
                          return (
                            <tr key={p.userId} className={p.userId === user.id ? 'bg-[#251E19]' : ''}>
                              <td className="py-2 px-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <CharacterAvatar characterId={p.characterId} size={22} />
                                  <span className="font-medium text-[#F5EFE6] truncate max-w-[92px]">
                                    {p.displayName}
                                    {p.userId === user.id ? ' (Bạn)' : ''}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#FCE5B2]">
                                {p.bowCount ?? 0}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#E5B869]">
                                {p.incenseCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#D6CEC3]">
                                {p.bellCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#C5D1B8]">
                                {p.sweepCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#9EDAD6]">
                                {p.fishCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#F2A6B8]">
                                {p.flowerCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#FFD580]">
                                {p.lanternCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#9CE5D8]">
                                {p.koiFeedCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#F28C82]">
                                {p.wishCount}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#A9E0A4]">
                                {p.kitchenWashCount ?? 0}
                              </td>
                              <td className="py-2 px-1.5 text-right font-mono-num text-[#F7D288]">
                                {p.memorialCount ?? 0}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono-num font-semibold text-[#F7D288]">
                                {totalP}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Players Roster */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F5EFE6] inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#D99B52]" />
                  Hành Giả Trong Chùa
                </span>
                <span className="font-mono-num text-[#D99B52]">
                  {room ? `${room.players.length}/${room.maxPlayers}` : '0/10'} người
                </span>
              </div>
              <div className="space-y-2">
                {room?.players.map((p) => {
                  const charInfo = CHARACTERS.find((c) => c.id === p.characterId);
                  return (
                    <div
                      key={p.userId}
                      className="flex items-center gap-3 p-2 rounded-lg bg-[#1A1614] border border-[#332A24]"
                    >
                      <CharacterAvatar characterId={p.characterId} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-[#F5EFE6] truncate">
                          {p.displayName}
                          {p.userId === user.id ? ' (Bạn)' : ''}
                        </div>
                        <div className="text-[11px] text-[#9E9387] truncate">
                          {p.role === 'admin' ? 'Quản trị viên' : charInfo?.title || 'Hành giả'}
                          {' · '}
                          {p.pose === 'meditate'
                            ? 'Đang tọa thiền'
                            : p.pose === 'sit'
                            ? 'Đang ngồi ghế đá dưới dàn hoa giấy'
                            : 'Đang dạo chùa'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 border-t border-[#332A24] flex items-center justify-between text-xs text-[#9E9387]">
                <span>Tổng nén nhang đã thắp trong chùa</span>
                <span className="font-mono-num text-[#F5EFE6]">{room?.incenseCount ?? 0} nén</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Fortune Slip */}
      {drawnFortune && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#241E1A] border border-[#D99B52]/60 rounded-xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-xs text-[#D99B52] font-medium">
              <Sparkles className="w-4 h-4" />
              {drawnFortune.number}
            </div>
            <h3 className="font-display text-2xl font-semibold text-[#FBF7F0]">
              {drawnFortune.title}
            </h3>
            <p className="font-display italic text-base text-[#EBD6B3] leading-relaxed border-y border-[#3B312B] py-3">
              “{drawnFortune.verse}”
            </p>
            <p className="text-sm text-[#C7BDB1] leading-relaxed">{drawnFortune.meaning}</p>
            <button
              type="button"
              onClick={() => setDrawnFortune(null)}
              className="w-full py-2.5 rounded-lg bg-[#D99B52] hover:bg-[#E5AC66] text-[#1A1614] text-sm font-semibold cursor-pointer"
            >
              Ghi Nhận Lời Khuyên
            </button>
          </div>
        </div>
      )}

      {/* Modal: Quick Character Switch */}
      {showCharacterModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-[#FBF7F0]">
                Chọn Nhân Vật Trong Chùa
              </h3>
              <button
                type="button"
                onClick={() => setShowCharacterModal(false)}
                className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] cursor-pointer"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {CHARACTERS.map((char) => {
                const isCurrent = user.characterId === char.id;
                return (
                  <button
                    key={char.id}
                    type="button"
                    disabled={savingChar}
                    onClick={() => void handleQuickCharacterChange(char.id)}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center gap-2 transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#2E2620] border-[#D99B52]'
                        : 'bg-[#1A1614] border-[#3B312B] hover:border-[#5C4E45]'
                    }`}
                  >
                    <CharacterAvatar characterId={char.id} size={56} />
                    <span className="text-xs font-semibold text-[#F5EFE6]">{char.title}</span>
                    <span className="text-[11px] text-[#9E9387] leading-tight">{char.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Admin Music Console */}
      {showAdminMusic && canControlMusic && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <AdminMusicPanel
            user={user}
            tracks={tracks}
            musicState={musicState}
            isPrimaryAdmin={isPrimaryAdmin}
            onClose={() => setShowAdminMusic(false)}
          />
        </div>
      )}

      {showQrModal && (
        <InviteQrModal
          defaultRoomId={roomId}
          defaultRoomName={room?.name}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {/* Modal: Vườn Hoa Liên Tâm (Auto-Growing Shared Flower Plots) */}
      {activeGardenPlotIndex !== null && (() => {
        const selectedPlot =
          gardenPlots.find((p) => p.plotIndex === activeGardenPlotIndex) ?? gardenPlots[0];
        const selectedSpecies =
          selectedPlot && selectedPlot.species !== 'none'
            ? FLOWER_CATALOG.find((f) => f.id === selectedPlot.species)
            : null;
        const selectedStage = selectedPlot ? getEffectiveFlowerStage(selectedPlot, gardenNowMs) : 0;
        const remainingSec = selectedPlot ? getFlowerRemainingSec(selectedPlot, gardenNowMs) : 0;
        return (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 max-w-md w-full max-h-[90dvh] overflow-y-auto space-y-4 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Flower2 className="w-5 h-5 text-[#9FD694]" />
                  <h3 className="font-display text-lg font-semibold text-[#FBF7F0]">
                    Vườn Hoa Liên Tâm
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveGardenPlotIndex(null)}
                  className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] px-2 py-1 cursor-pointer"
                >
                  Đóng
                </button>
              </div>

              {/* Quick 6-plot switcher grid */}
              <div className="grid grid-cols-3 gap-2">
                {GARDEN_PLOT_POSITIONS.map((pos) => {
                  const plot = gardenPlots.find((p) => p.plotIndex === pos.index);
                  const sp =
                    plot && plot.species !== 'none'
                      ? FLOWER_CATALOG.find((f) => f.id === plot.species)
                      : null;
                  const effectiveStage = plot ? getEffectiveFlowerStage(plot, gardenNowMs) : 0;
                  const isSel = activeGardenPlotIndex === pos.index;
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setActiveGardenPlotIndex(pos.index)}
                      className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-[#2E2620] border-[#E8B86A]'
                          : 'bg-[#1A1614] border-[#332A24] hover:border-[#5C4E45]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-[#F5EFE6]">
                        <span>Luống {pos.index + 1}</span>
                        {sp && effectiveStage > 0 && (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: sp.petalColor }}
                          />
                        )}
                      </div>
                      <div className="text-[10px] text-[#9E9387] truncate mt-0.5">
                        {!sp || effectiveStage === 0
                          ? 'Đất trống'
                          : effectiveStage >= 3
                          ? 'Nở rộ!'
                          : effectiveStage === 2
                          ? 'Đang kết nụ'
                          : 'Đang nảy mầm'}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected plot interaction */}
              {selectedPlot && (
                <div className="rounded-xl bg-[#1A1614] border border-[#332A24] p-4 space-y-3">
                  {selectedPlot.species === 'none' || selectedStage === 0 ? (
                    <>
                      <p className="text-xs text-[#E5DCD1]">
                        Chọn hạt giống để gieo vào <span className="font-semibold text-[#F7D288]">Luống {selectedPlot.plotIndex + 1}</span> (cây sẽ tự lớn lên và ra hoa, khi nở rộ hãy hái dâng Phật):
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {FLOWER_CATALOG.map((fl) => (
                          <button
                            key={fl.id}
                            type="button"
                            disabled={busyGarden}
                            onClick={() => void handlePlantFlower(selectedPlot.plotIndex, fl.id)}
                            className="p-2.5 rounded-lg bg-[#241E1A] hover:bg-[#2F2722] border border-[#3B312B] hover:border-[#E8B86A]/70 text-left flex items-start gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <span
                              className="w-4 h-4 rounded-full mt-0.5 shrink-0 border border-white/30"
                              style={{ backgroundColor: fl.petalColor }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#FBF7F0] truncate">
                                {fl.name}
                              </div>
                              <div className="text-[10px] text-[#9E9387] truncate">{fl.subtitle}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-5 h-5 rounded-full border border-white/30 shrink-0"
                            style={{ backgroundColor: selectedSpecies?.petalColor || '#F29BB2' }}
                          />
                          <div>
                            <div className="text-sm font-semibold text-[#FBF7F0]">
                              {selectedSpecies?.name || 'Hoa'} · Luống {selectedPlot.plotIndex + 1}
                            </div>
                            <div className="text-[11px] text-[#9E9387]">
                              Người gieo: {selectedPlot.plantedBy || 'Hành giả'}
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-[#2E2620] text-[11px] font-mono-num text-[#F7D288]">
                          {selectedStage >= 3 ? 'Nở rộ' : selectedStage === 2 ? 'Kết nụ' : 'Nảy mầm'}
                        </span>
                      </div>

                      <div className="w-full h-2 rounded-full bg-[#2A221D] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${(selectedStage / 3) * 100}%`,
                            backgroundColor: selectedSpecies?.petalColor || '#9FD694',
                          }}
                        />
                      </div>

                      {selectedStage < 3 ? (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="text-xs text-[#C7D6B9]">
                            Cây đang tự lớn... còn <span className="font-mono-num font-semibold text-[#F7D288]">{remainingSec}s</span> nở hoa
                          </div>
                          <button
                            type="button"
                            disabled={busyGarden}
                            onClick={() => void handleClearFlowerPlot(selectedPlot.plotIndex)}
                            className="py-2 px-3 rounded-lg bg-[#2E2620] hover:bg-[#3B312B] text-[#C7BDB1] text-xs cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            Dọn Luống
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busyGarden}
                          onClick={() => void handleOfferFlower(selectedPlot)}
                          className="w-full py-2.5 px-3 rounded-lg bg-[#E5B869] hover:bg-[#F0C87D] text-[#1A1614] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4" />
                          Hái Hoa Dâng Phật (+1 Công đức)
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal: Thả Hoa Đăng Ao Sen */}
      {showLanternModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitLantern}
            className="bg-[#241E1A] border border-[#D99B52]/60 rounded-xl p-5 max-w-md w-full max-h-[90dvh] overflow-y-auto space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#F7D288]" />
                <h3 className="font-display text-lg font-semibold text-[#FBF7F0]">
                  Thả Hoa Đăng Ao Sen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLanternModal(false)}
                className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] px-2 py-1 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#E5DCD1]">Chọn màu hoa đăng</label>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { id: 'gold', label: 'Vàng Ấm', hex: '#F3B44C' },
                    { id: 'lotus', label: 'Sen Hồng', hex: '#EB82A0' },
                    { id: 'jade', label: 'Ngọc Bích', hex: '#6CC4A6' },
                    { id: 'ivory', label: 'Trắng Ngà', hex: '#F5EAD2' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLanternColor(c.id)}
                    className={`p-2 rounded-lg border text-center flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                      lanternColor === c.id
                        ? 'bg-[#2E2620] border-[#E8B86A]'
                        : 'bg-[#1A1614] border-[#332A24] hover:border-[#5C4E45]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/35"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="text-[11px] text-[#F5EFE6]">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="lantern-wish" className="text-xs font-medium text-[#E5DCD1]">
                Lời nguyện ước (tối đa 60 ký tự)
              </label>
              <input
                id="lantern-wish"
                type="text"
                maxLength={60}
                value={lanternWish}
                onChange={(e) => setLanternWish(e.target.value)}
                placeholder="Cầu gia đạo bình an, tâm sáng trí thanh..."
                className="w-full px-3 py-2 rounded-lg bg-[#1A1614] border border-[#3B312B] text-sm text-[#FBF7F0] placeholder-[#8D8276] focus:outline-none focus:border-[#E8B86A]"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Cầu gia đạo bình an',
                  'Tâm an vạn sự lành',
                  'Sức khỏe dồi dào',
                  'Trí tuệ hanh thông',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLanternWish(preset)}
                    className="px-2 py-1 rounded bg-[#1A1614] hover:bg-[#2E2620] border border-[#332A24] text-[11px] text-[#E5DCD1] cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={busyLantern}
              className="w-full py-2.5 px-4 rounded-lg bg-[#E5B869] hover:bg-[#F0C87D] text-[#1A1614] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Flame className="w-4 h-4" />
              {busyLantern ? 'Đang thả hoa đăng...' : 'Thả Xuống Ao Sen (+1 Công đức)'}
            </button>
          </form>
        </div>
      )}

      {/* Modal: Cây Nguyện Ước (Toss Red Wish Ribbon) */}
      {showWishModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitWish}
            className="bg-[#241E1A] border border-[#E05248]/60 rounded-xl p-5 max-w-md w-full max-h-[90dvh] overflow-y-auto space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TreeDeciduous className="w-5 h-5 text-[#F28C82]" />
                <h3 className="font-display text-lg font-semibold text-[#FBF7F0]">
                  Cây Nguyện Ước
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWishModal(false)}
                className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] px-2 py-1 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <p className="text-xs text-[#E5DCD1] leading-relaxed">
              Viết điều ước lên dải băng lụa đỏ và ném lên cành Cây Nguyện Ước để lưu giữ ước nguyện bình an tại chùa.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="tree-wish-input" className="text-xs font-medium text-[#E5DCD1]">
                Điều ước trên dải băng đỏ (tối đa 60 ký tự)
              </label>
              <input
                id="tree-wish-input"
                type="text"
                maxLength={60}
                value={wishInput}
                onChange={(e) => setWishInput(e.target.value)}
                placeholder="Cầu bình an, sức khỏe và mọi điều như ý..."
                className="w-full px-3 py-2 rounded-lg bg-[#1A1614] border border-[#3B312B] text-sm text-[#FBF7F0] placeholder-[#8D8276] focus:outline-none focus:border-[#F28C82]"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Cầu gia đạo bình an',
                  'Sức khỏe dồi dào',
                  'Công việc hanh thông',
                  'Tâm an trí sáng',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setWishInput(preset)}
                    className="px-2 py-1 rounded bg-[#1A1614] hover:bg-[#2E2620] border border-[#332A24] text-[11px] text-[#E5DCD1] cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {wishes.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-[#C7BDB1]">
                  Dải băng đỏ đang treo trên cây ({wishes.length})
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1.5 rounded-lg bg-[#1A1614] border border-[#332A24] p-2">
                  {wishes.slice(0, 6).map((w) => (
                    <div
                      key={w.id}
                      className="flex items-start gap-2 text-xs border-b last:border-b-0 border-[#2A221D] pb-1 last:pb-0"
                    >
                      <span className="w-2 h-3.5 rounded-xs bg-[#E03E36] border border-[#F4C65C]/60 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="font-semibold text-[#F7D288]">{w.displayName}: </span>
                        <span className="text-[#E5DCD1] break-words">{w.wish}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busyWish}
              className="w-full py-2.5 px-4 rounded-lg bg-[#D94A3F] hover:bg-[#E85B50] text-[#FFF8F4] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {busyWish ? 'Đang ném dải băng...' : 'Ném Dải Băng Đỏ (+1 Công đức)'}
            </button>
          </form>
        </div>
      )}

      {/* Modal: Thực Đơn Gian Bếp Chay (Gọn nhẹ, không cần cuộn) */}
      {showKitchenMenuModal && (() => {
        const otherPlayers = players.filter((p) => p.userId !== user.id);
        const resolvedTarget =
          otherPlayers.find((p) => p.userId === kitchenTargetUid) ?? otherPlayers[0] ?? null;
        const effectiveMode: KitchenMealRecipientMode =
          kitchenRecipientMode === 'player' && !resolvedTarget ? 'self' : kitchenRecipientMode;
        return (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
            <div className="bg-[#241E1A] border border-[#9CD89A]/50 rounded-xl p-3.5 sm:p-4 max-w-2xl w-full space-y-2.5 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <UtensilsCrossed className="w-4 h-4 text-[#A9E0A4] shrink-0" />
                  <h3 className="font-display text-base font-semibold text-[#FBF7F0] truncate">
                    Thực Đơn Bếp Chay
                  </h3>
                  <span className="hidden sm:inline text-[11px] text-[#9E9387] truncate">
                    · Rửa bát tích +1 Công đức
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKitchenMenuModal(false)}
                  className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] px-2 py-0.5 cursor-pointer shrink-0"
                >
                  Đóng
                </button>
              </div>

              {/* Compact active portions bar */}
              {kitchenMeals.length > 0 && (
                <div className="rounded-lg bg-[#1A1614] border border-[#332A24] px-2.5 py-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#A9E0A4]">
                    <span>Đang bày trên bàn ({kitchenMeals.length}/6)</span>
                    {kitchenMeals.some((m) => m.foodEaten && m.drinkDrunk) && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowKitchenMenuModal(false);
                          handleRequestRitual('kitchen_sink');
                        }}
                        className="px-2 py-0.5 rounded bg-[#9CD89A] hover:bg-[#B2E6B0] text-[#152414] text-[10px] font-semibold cursor-pointer"
                      >
                        Rửa bát xong
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {kitchenMeals.slice(0, 6).map((meal) => {
                      const fName = VEGETARIAN_FOOD_MENU.find((f) => f.id === meal.foodId)?.name ?? 'Món';
                      const dName = VEGETARIAN_DRINK_MENU.find((d) => d.id === meal.drinkId)?.name ?? 'Nước';
                      const ownerLabel =
                        meal.recipientMode === 'all'
                          ? 'Cả chùa'
                          : meal.targetName || meal.orderedByName;
                      return (
                        <div
                          key={meal.id}
                          className="flex items-center gap-1 text-[10px] bg-[#241E1A] border border-[#3B312B] rounded px-1.5 py-0.5"
                        >
                          <span className="text-[#E5DCD1] font-medium max-w-[110px] truncate">
                            {ownerLabel}: {fName}
                          </span>
                          <button
                            type="button"
                            disabled={meal.foodEaten}
                            onClick={() => handleConsumeKitchenTarget('food', meal.id)}
                            className={`px-1.5 py-0.5 rounded font-medium ${
                              meal.foodEaten
                                ? 'text-[#7D746B] line-through'
                                : 'bg-[#E8B86A]/20 text-[#FCE5B2] hover:bg-[#E8B86A]/35 cursor-pointer'
                            }`}
                          >
                            {meal.foodEaten ? 'Xong' : 'Ăn'}
                          </button>
                          <button
                            type="button"
                            disabled={meal.drinkDrunk}
                            onClick={() => handleConsumeKitchenTarget('drink', meal.id)}
                            title={dName}
                            className={`px-1.5 py-0.5 rounded font-medium ${
                              meal.drinkDrunk
                                ? 'text-[#7D746B] line-through'
                                : 'bg-[#F2B84B]/20 text-[#FDE8B4] hover:bg-[#F2B84B]/35 cursor-pointer'
                            }`}
                          >
                            {meal.drinkDrunk ? 'Xong' : 'Uống'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Compact 1-row Recipient Selector */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[#D9F4D4] inline-flex items-center gap-1 mr-1">
                  <Users className="w-3.5 h-3.5" />
                  Đặt cho:
                </span>
                {(
                  [
                    { id: 'self', label: 'Mình dùng' },
                    { id: 'player', label: 'Mời bạn' },
                    { id: 'all', label: 'Mời cả chùa' },
                  ] as const
                ).map((opt) => {
                  const disabled = opt.id === 'player' && otherPlayers.length === 0;
                  const active = effectiveMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setKitchenRecipientMode(opt.id)}
                      className={`py-1 px-2.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#2E2620] border-[#A9E0A4] text-[#D9F4D4]'
                          : 'bg-[#1A1614] border-[#332A24] text-[#E5DCD1] hover:border-[#5C4E45]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {effectiveMode === 'player' &&
                  otherPlayers.map((p) => {
                    const isTarget = (resolvedTarget?.userId ?? '') === p.userId;
                    return (
                      <button
                        key={p.userId}
                        type="button"
                        onClick={() => setKitchenTargetUid(p.userId)}
                        className={`px-2 py-0.5 rounded-md border text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                          isTarget
                            ? 'bg-[#2E2620] border-[#E8B86A] text-[#FCE5B2]'
                            : 'bg-[#1A1614] border-[#332A24] text-[#E5DCD1] hover:border-[#5C4E45]'
                        }`}
                      >
                        <CharacterAvatar characterId={p.characterId} size={15} />
                        <span className="max-w-[90px] truncate">{p.displayName}</span>
                      </button>
                    );
                  })}
              </div>

              {/* Side-by-side Food & Drink Columns (No scroll needed) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Món Chay */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#F7D288] flex items-center gap-1">
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    Món Chay
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {VEGETARIAN_FOOD_MENU.map((item) => {
                      const isSel = selectedFoodId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedFoodId(item.id)}
                          className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center gap-2 transition-colors cursor-pointer ${
                            isSel
                              ? 'bg-[#2E2620] border-[#E8B86A]'
                              : 'bg-[#1A1614] border-[#332A24] hover:border-[#5C4E45]'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded shrink-0 border border-white/25"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="min-w-0 flex-1 flex items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold text-[#FBF7F0] truncate">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-[#9E9387] truncate shrink-0">
                              {item.subtitle}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Thức Uống */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#F2B84B] flex items-center gap-1">
                    <GlassWater className="w-3.5 h-3.5" />
                    Thức Uống
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {VEGETARIAN_DRINK_MENU.map((item) => {
                      const isSel = selectedDrinkId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedDrinkId(item.id)}
                          className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center gap-2 transition-colors cursor-pointer ${
                            isSel
                              ? 'bg-[#2E2620] border-[#F2B84B]'
                              : 'bg-[#1A1614] border-[#332A24] hover:border-[#5C4E45]'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded shrink-0 border border-white/25"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="min-w-0 flex-1 flex items-baseline justify-between gap-1.5">
                            <span className="text-xs font-semibold text-[#FBF7F0] truncate">
                              {item.name}
                              {item.featured ? ' · ★' : ''}
                            </span>
                            <span className="text-[10px] text-[#9E9387] truncate shrink-0">
                              {item.subtitle}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={busyKitchenOrder}
                onClick={() => {
                  unlockAudio();
                  setBusyKitchenOrder(true);
                  void (async () => {
                    try {
                      const res = await orderSharedKitchenMealsInFirestore(
                        roomId,
                        user,
                        selectedFoodId,
                        selectedDrinkId,
                        effectiveMode,
                        effectiveMode === 'player' && resolvedTarget
                          ? { userId: resolvedTarget.userId, displayName: resolvedTarget.displayName }
                          : null,
                        players,
                        kitchenMeals
                      );
                      setShowKitchenMenuModal(false);
                      const foodName =
                        VEGETARIAN_FOOD_MENU.find((f) => f.id === selectedFoodId)?.name ?? 'Món chay';
                      const drinkName =
                        VEGETARIAN_DRINK_MENU.find((d) => d.id === selectedDrinkId)?.name ?? 'Nước uống';
                      showKitchenNotice(
                        res.count > 1
                          ? `Đã bày ${res.count} phần ${foodName} & ${drinkName} mời ${res.targetSummary}!`
                          : effectiveMode === 'player' && resolvedTarget
                          ? `Đã gửi ${foodName} & ${drinkName} mời ${resolvedTarget.displayName}!`
                          : `Đã bày ${foodName} & ${drinkName} ra Bàn Ăn Chay!`
                      );
                    } finally {
                      setBusyKitchenOrder(false);
                    }
                  })();
                }}
                className="w-full py-2 px-4 rounded-lg bg-[#A9E0A4] hover:bg-[#BCEBB8] text-[#152414] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <UtensilsCrossed className="w-4 h-4" />
                {busyKitchenOrder
                  ? 'Đang bày món...'
                  : effectiveMode === 'all'
                  ? 'Mời Cả Chùa Dùng Chay'
                  : effectiveMode === 'player' && resolvedTarget
                  ? `Gọi Món Mời ${resolvedTarget.displayName}`
                  : 'Bày Món Lên Bàn Ăn Chay'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Modal: Nghi Lễ Cầu Siêu (Khu Công Viên Cầu Siêu) */}
      {showMemorialModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitMemorial}
            className="bg-[#241E1A] border border-[#E8B86A]/65 rounded-xl p-5 max-w-md w-full max-h-[90dvh] overflow-y-auto space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-[#F7D288]" />
                <h3 className="font-display text-lg font-semibold text-[#FBF7F0]">
                  Nghi Lễ Cầu Siêu
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMemorialModal(false)}
                className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] px-2 py-1 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <p className="text-xs text-[#E5DCD1] leading-relaxed">
              Thành tâm điền tên người thân đã khuất để thắp ánh sen cầu siêu nơi Đài Cầu Siêu, hồi hướng công đức bình an và siêu sinh tịnh độ.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="memorial-name-input" className="text-xs font-medium text-[#E5DCD1]">
                Tên người cần cầu siêu (bắt buộc)
              </label>
              <input
                id="memorial-name-input"
                type="text"
                required
                maxLength={36}
                value={memorialName}
                onChange={(e) => setMemorialName(e.target.value)}
                placeholder="Ví dụ: Hương linh Nguyễn Văn An..."
                className="w-full px-3 py-2 rounded-lg bg-[#1A1614] border border-[#3B312B] text-sm text-[#FBF7F0] placeholder-[#8D8276] focus:outline-none focus:border-[#E8B86A]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="memorial-wish-input" className="text-xs font-medium text-[#E5DCD1]">
                Lời nguyện cầu (tùy chọn)
              </label>
              <input
                id="memorial-wish-input"
                type="text"
                maxLength={80}
                value={memorialWish}
                onChange={(e) => setMemorialWish(e.target.value)}
                placeholder="Nguyện hương linh an nhiên siêu sinh tịnh độ..."
                className="w-full px-3 py-2 rounded-lg bg-[#1A1614] border border-[#3B312B] text-sm text-[#FBF7F0] placeholder-[#8D8276] focus:outline-none focus:border-[#E8B86A]"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Siêu sinh tịnh độ',
                  'An nhiên thanh thản',
                  'Hồi hướng công đức',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMemorialWish(preset)}
                    className="px-2 py-1 rounded bg-[#1A1614] hover:bg-[#2E2620] border border-[#332A24] text-[11px] text-[#E5DCD1] cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {memorials.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-[#C7BDB1]">
                  Lễ cầu siêu gần đây ({memorials.length})
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1.5 rounded-lg bg-[#1A1614] border border-[#332A24] p-2">
                  {[...memorials].reverse().slice(0, 6).map((m) => (
                    <div
                      key={m.id}
                      className="text-xs border-b last:border-b-0 border-[#2A221D] pb-1 last:pb-0"
                    >
                      <span className="font-semibold text-[#F7D288]">{m.deceasedName}</span>
                      <span className="text-[#9E9387]"> · {m.displayName}</span>
                      {m.wish && <div className="text-[11px] text-[#E5DCD1] mt-0.5">{m.wish}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busyMemorial || !memorialName.trim()}
              className="w-full py-2.5 px-4 rounded-lg bg-[#E5B869] hover:bg-[#F0C87D] text-[#1A1614] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {busyMemorial ? 'Đang làm lễ cầu siêu...' : 'Thắp Ánh Sen Cầu Siêu (+1 Công đức)'}
            </button>
          </form>
        </div>
      )}

      {/* Modal: Bia Ngũ Giới (Năm Giới Của Phật) */}
      {showPreceptsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setShowPreceptsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1F2226] border border-[#E5BD67]/55 rounded-xl p-5 max-w-lg w-full max-h-[90dvh] overflow-y-auto space-y-3.5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2 border-b border-[#E5BD67]/25 pb-3">
              <div className="flex items-center gap-2.5">
                <Landmark className="w-5 h-5 text-[#F5D27B] shrink-0" />
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#F5D27B]">
                    Bia Ngũ Giới
                  </h3>
                  <p className="text-[11px] text-[#D9CCB6]">
                    Năm giới cấm căn bản của người học Phật nơi khuôn viên Hòn Non Bộ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreceptsModal(false)}
                className="text-xs text-[#C7BDB1] hover:text-[#F5EFE6] px-2 py-1 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <ol className="space-y-2.5">
              {FIVE_PRECEPTS_LIST.map((item, idx) => (
                <li
                  key={item.title}
                  className="rounded-lg bg-[#16191D] border border-[#343940] px-3.5 py-2.5 space-y-0.5"
                >
                  <div className="text-sm font-semibold text-[#F7D27A]">
                    {idx + 1}. {item.title}
                  </div>
                  <p className="text-xs text-[#EFE7D6] leading-relaxed">
                    {item.meaning}
                  </p>
                </li>
              ))}
            </ol>

            <div className="pt-1 flex items-center justify-between gap-2 text-[11px] text-[#D9B15F] italic">
              <span>Giữ giới thanh tịnh · Thân tâm thường an lạc</span>
              <button
                type="button"
                onClick={() => setShowPreceptsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-[#E5BD67] hover:bg-[#F0C87D] text-[#1A1614] font-semibold not-italic text-xs cursor-pointer"
              >
                Đã rõ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AmbientParticle {
  kind: 'mote' | 'petal';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  swayAmp: number;
  swaySpeed: number;
  angle: number;
  spinSpeed: number;
  flutterPhase: number;
  flutterSpeed: number;
  tone: 'gold' | 'lotus' | 'ivory';
}

function createAmbientParticle(width: number, height: number, scatterY = true): AmbientParticle {
  const isMote = Math.random() < 0.64;
  const tones: AmbientParticle['tone'][] = isMote
    ? ['gold', 'ivory']
    : ['lotus', 'gold', 'ivory'];
  const tone = tones[Math.floor(Math.random() * tones.length)];

  if (isMote) {
    return {
      kind: 'mote',
      x: Math.random() * width,
      y: scatterY ? Math.random() * height : height + 10 + Math.random() * 20,
      vx: (Math.random() - 0.45) * 6,
      vy: -(5 + Math.random() * 8),
      size: 1.5 + Math.random() * 2.1,
      alpha: 0.16 + Math.random() * 0.24,
      phase: Math.random() * Math.PI * 2,
      swayAmp: 6 + Math.random() * 10,
      swaySpeed: 0.5 + Math.random() * 0.7,
      angle: 0,
      spinSpeed: 0,
      flutterPhase: Math.random() * Math.PI * 2,
      flutterSpeed: 0.8 + Math.random() * 1.1,
      tone,
    };
  }

  return {
    kind: 'petal',
    x: Math.random() * width,
    y: scatterY ? Math.random() * height : -12 - Math.random() * 24,
    vx: 4 + Math.random() * 9,
    vy: 11 + Math.random() * 11,
    size: 4.5 + Math.random() * 3.5,
    alpha: 0.28 + Math.random() * 0.24,
    phase: Math.random() * Math.PI * 2,
    swayAmp: 12 + Math.random() * 16,
    swaySpeed: 0.6 + Math.random() * 0.6,
    angle: Math.random() * Math.PI * 2,
    spinSpeed: (Math.random() - 0.5) * 0.9,
    flutterPhase: Math.random() * Math.PI * 2,
    flutterSpeed: 1.3 + Math.random() * 1.2,
    tone,
  };
}

function PeacefulParticlesOverlay({ disabled }: { disabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let width = canvas.parentElement?.clientWidth || window.innerWidth;
    let height = canvas.parentElement?.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const syncCanvasSize = () => {
      const parent = canvas.parentElement;
      width = Math.max(300, parent?.clientWidth || window.innerWidth);
      height = Math.max(300, parent?.clientHeight || window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncCanvasSize();

    if (disabled || motionQuery?.matches) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const particleCount = width < 640 ? 22 : 30;
    const particles: AmbientParticle[] = Array.from({ length: particleCount }, () =>
      createAmbientParticle(width, height, true)
    );

    const ro = new ResizeObserver(() => {
      syncCanvasSize();
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.x += (p.vx + Math.sin(t * p.swaySpeed + p.phase) * p.swayAmp * 0.35) * dt;
        p.y += p.vy * dt;
        p.angle += p.spinSpeed * dt;
        p.flutterPhase += p.flutterSpeed * dt;

        // Wrap smoothly around screen edges without allocations
        if (p.kind === 'mote') {
          if (p.y < -16) {
            p.y = height + 12;
            p.x = Math.random() * width;
          }
        } else {
          if (p.y > height + 18) {
            p.y = -14;
            p.x = Math.random() * width;
          }
        }
        if (p.x > width + 20) p.x = -16;
        if (p.x < -20) p.x = width + 16;

        if (p.kind === 'mote') {
          const pulse = 0.55 + 0.45 * Math.sin(t * p.flutterSpeed + p.phase);
          const alpha = p.alpha * pulse;
          const glowR = p.size * 3.8;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
          if (p.tone === 'gold') {
            grad.addColorStop(0, `rgba(247, 214, 146, ${alpha * 1.4})`);
            grad.addColorStop(0.45, `rgba(217, 155, 82, ${alpha * 0.55})`);
            grad.addColorStop(1, 'rgba(217, 155, 82, 0)');
          } else {
            grad.addColorStop(0, `rgba(251, 245, 232, ${alpha * 1.3})`);
            grad.addColorStop(0.45, `rgba(235, 214, 179, ${alpha * 0.45})`);
            grad.addColorStop(1, 'rgba(235, 214, 179, 0)');
          }
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const scaleY = 0.35 + 0.65 * Math.abs(Math.cos(p.flutterPhase));
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.scale(1, scaleY);

          if (p.tone === 'lotus') {
            ctx.fillStyle = `rgba(236, 162, 178, ${p.alpha})`;
          } else if (p.tone === 'ivory') {
            ctx.fillStyle = `rgba(245, 234, 216, ${p.alpha * 0.9})`;
          } else {
            ctx.fillStyle = `rgba(219, 182, 114, ${p.alpha})`;
          }

          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.bezierCurveTo(s * 0.85, -s * 0.45, s * 0.7, s * 0.7, 0, s);
          ctx.bezierCurveTo(-s * 0.7, s * 0.7, -s * 0.85, -s * 0.45, 0, -s);
          ctx.fill();
          ctx.restore();
        }
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [disabled]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 z-10 w-full h-full pointer-events-none"
    />
  );
}

