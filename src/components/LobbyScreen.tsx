import { useEffect, useState, type FormEvent } from 'react';
import { Users, Plus, Check, LogOut, Share2, QrCode, Trash2, ShieldCheck, ShieldOff, RefreshCw } from 'lucide-react';
import {
  CHARACTERS,
  type CharacterId,
  type MusicState,
  type MusicTrack,
  type PublicUser,
  type RoomSummary,
  type SubAdminRecord,
} from '../shared/types.ts';
import {
  appointSubAdmin,
  createTempleRoom,
  deleteTempleRoom,
  listRegisteredUsersForAdmin,
  revokeSubAdmin,
  subscribeAllSubAdmins,
  subscribeRooms,
  updateLocalProfileCacheOnly,
} from '../services/templeFirestore.ts';
import { CharacterAvatar } from './CharacterAvatar.tsx';
import { AdminMusicPanel } from './AdminMusicPanel.tsx';
import { InviteQrModal } from './InviteQrModal.tsx';

interface LobbyScreenProps {
  user: PublicUser;
  tracks: MusicTrack[];
  musicState: MusicState;
  isPrimaryAdmin: boolean;
  isSubAdmin: boolean;
  joinError: string | null;
  onUserUpdated: (user: PublicUser) => void;
  onEnterRoom: (roomId: string) => void;
  onLogout: () => void;
}

type LobbyTab = 'rooms' | 'character' | 'music';

export function LobbyScreen({
  user,
  tracks,
  musicState,
  isPrimaryAdmin,
  isSubAdmin,
  joinError,
  onUserUpdated,
  onEnterRoom,
  onLogout,
}: LobbyScreenProps) {
  const [activeTab, setActiveTab] = useState<LobbyTab>('rooms');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCap, setNewRoomCap] = useState<number>(10);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Sub-admin delegation state (Primary Admin only)
  const [subAdmins, setSubAdmins] = useState<SubAdminRecord[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<PublicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [delegationBusyUid, setDelegationBusyUid] = useState<string | null>(null);
  const [delegationMsg, setDelegationMsg] = useState<string | null>(null);

  const canControlMusic = isPrimaryAdmin || isSubAdmin;

  // Character editing state initialized from local cache
  const [selectedChar, setSelectedChar] = useState<CharacterId>(user.characterId);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [charFeedback, setCharFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSelectedChar(user.characterId);
    setDisplayName(user.displayName);
  }, [user.characterId, user.displayName]);

  useEffect(() => {
    const unsub = subscribeRooms((nextRooms) => {
      setRooms(nextRooms);
      setLoadingRooms(false);
    });
    return () => unsub();
  }, []);

  const refreshRegisteredUsers = async () => {
    if (!isPrimaryAdmin) return;
    setLoadingUsers(true);
    try {
      const list = await listRegisteredUsersForAdmin();
      setRegisteredUsers(list.filter((u) => u.id !== user.id));
    } catch {
      // non-fatal
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!isPrimaryAdmin) {
      setSubAdmins([]);
      setRegisteredUsers([]);
      return;
    }
    const unsubSubs = subscribeAllSubAdmins(setSubAdmins);
    void refreshRegisteredUsers();
    return () => unsubSubs();
  }, [isPrimaryAdmin, user.id]);

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!isPrimaryAdmin || !newRoomName.trim()) return;
    setCreatingRoom(true);
    try {
      const roomId = await createTempleRoom(user.id, newRoomName, newRoomCap);
      setNewRoomName('');
      onEnterRoom(roomId);
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!isPrimaryAdmin || roomId === 'chua-tinh-tam') return;
    setDeletingRoomId(roomId);
    try {
      await deleteTempleRoom(roomId);
      setConfirmDeleteRoomId(null);
    } finally {
      setDeletingRoomId(null);
    }
  };

  const handleAppointSubAdmin = async (target: { id: string; displayName: string; characterId: CharacterId }) => {
    if (!isPrimaryAdmin) return;
    setDelegationBusyUid(target.id);
    setDelegationMsg(null);
    try {
      await appointSubAdmin(target, user.displayName);
      setDelegationMsg(`Đã bổ nhiệm ${target.displayName} làm Phó quản trị (chỉnh nhạc & thời tiết).`);
    } catch {
      setDelegationMsg('Không thể bổ nhiệm Phó quản trị.');
    } finally {
      setDelegationBusyUid(null);
    }
  };

  const handleRevokeSubAdmin = async (targetUid: string, targetName: string) => {
    if (!isPrimaryAdmin) return;
    setDelegationBusyUid(targetUid);
    setDelegationMsg(null);
    try {
      await revokeSubAdmin(targetUid);
      setDelegationMsg(`Đã thu hồi quyền Phó quản trị của ${targetName}.`);
    } catch {
      setDelegationMsg('Không thể thu hồi quyền.');
    } finally {
      setDelegationBusyUid(null);
    }
  };

  const handleSaveCharacter = (e: FormEvent) => {
    e.preventDefault();
    const updated = updateLocalProfileCacheOnly(
      { characterId: selectedChar, displayName },
      user
    );
    onUserUpdated(updated);
    setCharFeedback('Đã lưu pháp danh và nhân vật vào bộ nhớ đệm (không tốn lượt ghi Firebase).');
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore clipboard error
    }
  };

  const currentCharacter = CHARACTERS.find((c) => c.id === user.characterId) || CHARACTERS[0];
  const activeTrack = tracks.find((t) => t.id === musicState.activeTrackId) || tracks[0];

  return (
    <div className="min-h-screen bg-[#1A1614] text-[#F5EFE6] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-[#332A24] bg-[#201A17] px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-x-4 gap-y-2.5 md:gap-8">
          <span className="font-display text-lg sm:text-xl font-semibold text-[#FBF7F0] whitespace-nowrap shrink-0">
            Từ Bi Viện
          </span>

          <nav className="order-3 w-full md:order-none md:w-auto border-t border-[#2D241F] pt-2.5 md:border-0 md:pt-0 flex items-center gap-5 sm:gap-6 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('rooms')}
              className={`text-sm font-medium pb-0.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'rooms'
                  ? 'text-[#D99B52] border-b border-[#D99B52]'
                  : 'text-[#C7BDB1] hover:text-[#F5EFE6]'
              }`}
            >
              Sảnh Chùa
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('character')}
              className={`text-sm font-medium pb-0.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'character'
                  ? 'text-[#D99B52] border-b border-[#D99B52]'
                  : 'text-[#C7BDB1] hover:text-[#F5EFE6]'
              }`}
            >
              Chọn Nhân Vật
            </button>
            {canControlMusic && (
              <button
                type="button"
                onClick={() => setActiveTab('music')}
                className={`text-sm font-medium pb-0.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'music'
                    ? 'text-[#D99B52] border-b border-[#D99B52]'
                    : 'text-[#C7BDB1] hover:text-[#F5EFE6]'
                }`}
              >
                Điều Khiển Nhạc
              </button>
            )}
          </nav>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#2C241F] hover:bg-[#382E28] text-xs font-medium text-[#F5EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 sm:px-6 sm:py-8 space-y-5 sm:space-y-6">
        {/* Compact traveler banner */}
        <section className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <CharacterAvatar characterId={user.characterId} size={56} />
            <div>
              <div className="text-xs text-[#9E9387]">
                {isPrimaryAdmin
                  ? 'Quản trị viên chính (Trụ trì)'
                  : isSubAdmin
                  ? 'Phó quản trị (Nhạc & Thời tiết)'
                  : 'Hành giả'}{' '}
                · Đã kết nối Firebase
              </div>
              <h1 className="font-display text-xl font-semibold text-[#FBF7F0]">
                {user.displayName}
              </h1>
              <div className="text-xs text-[#C7BDB1]">{currentCharacter.name}</div>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            <div className="text-left sm:text-right">
              <div className="text-xs text-[#9E9387]">
                {musicState.playMode === 'playlist' && (musicState.playlistTrackIds?.length ?? 0) > 0
                  ? `Phát danh sách (${musicState.playlistTrackIds?.length} bài lặp vòng)`
                  : 'Nhạc thiền phòng chùa hiện tại'}
              </div>
              <div className="text-sm font-medium text-[#D99B52]">
                {activeTrack?.title || 'Thiền Tâm Nhã Khúc'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void copyShareLink()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C7BDB1] hover:text-[#D99B52] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                {copiedLink ? 'Đã sao chép đường dẫn!' : 'Sao chép đường dẫn'}
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2C241F] hover:bg-[#382E28] border border-[#473A32] text-xs font-medium text-[#D99B52] transition-colors whitespace-nowrap cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                Mã QR Mời Bạn
              </button>
            </div>
          </div>
        </section>

        {joinError && (
          <div
            role="alert"
            className="px-4 py-3 rounded-lg bg-[#3A201E] border border-[#8D3E36] text-sm text-[#F5C2BC]"
          >
            {joinError}
          </div>
        )}

        {/* Tab 1: Temple Rooms */}
        {activeTab === 'rooms' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className={isPrimaryAdmin ? 'lg:col-span-7 space-y-4' : 'lg:col-span-12 space-y-4'}>
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#FBF7F0]">
                  Chọn Ngôi Chùa
                </h2>
                <p className="text-xs text-[#9E9387] mt-0.5">
                  Mỗi phòng hỗ trợ tối đa 10 người cùng lúc, đồng bộ trực tiếp qua Cloud Firestore.
                </p>
              </div>

              {loadingRooms ? (
                <div className="p-8 rounded-xl border border-[#3B312B] bg-[#241E1A] text-sm text-[#9E9387]">
                  Đang tải danh sách chùa từ Firebase...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {rooms.map((room) => {
                    const isFull = room.playerCount >= room.maxPlayers;
                    const canDeleteRoom = isPrimaryAdmin && room.id !== 'chua-tinh-tam';
                    const isConfirming = confirmDeleteRoomId === room.id;
                    return (
                      <div
                        key={room.id}
                        className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 flex flex-col justify-between gap-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-[#9E9387] mb-1">
                              Sức chứa tối đa {room.maxPlayers} người · {room.incenseCount} nén nhang đã thắp
                            </div>
                            <h3 className="font-display text-lg font-semibold text-[#FBF7F0]">
                              {room.name}
                            </h3>
                          </div>
                          {canDeleteRoom && !isConfirming && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRoomId(room.id)}
                              title="Xóa ngôi chùa này"
                              aria-label={`Xóa ${room.name}`}
                              className="p-1.5 rounded-lg text-[#9E9387] hover:text-[#F5C2BC] hover:bg-[#3A201E] transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {isConfirming && (
                          <div className="p-2.5 rounded-lg bg-[#331D1A] border border-[#8D3E36] flex items-center justify-between gap-2 text-xs">
                            <span className="text-[#F5C2BC]">Xóa chùa này?</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={deletingRoomId === room.id}
                                onClick={() => void handleDeleteRoom(room.id)}
                                className="px-2.5 py-1 rounded bg-[#B5473C] hover:bg-[#C95549] text-white font-semibold cursor-pointer disabled:opacity-50"
                              >
                                {deletingRoomId === room.id ? 'Đang xóa...' : 'Xác nhận'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRoomId(null)}
                                className="px-2 py-1 rounded bg-[#2A221E] text-[#C7BDB1] hover:text-[#F5EFE6] cursor-pointer"
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#332A24]">
                          <div className="inline-flex items-center gap-1.5 text-sm font-mono-num text-[#D6CEC3]">
                            <Users className="w-4 h-4 text-[#D99B52]" />
                            {room.playerCount}/{room.maxPlayers} người
                          </div>

                          <button
                            type="button"
                            disabled={isFull}
                            onClick={() => onEnterRoom(room.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                              isFull
                                ? 'bg-[#332A24] text-[#8D8276] cursor-not-allowed'
                                : 'bg-[#D99B52] hover:bg-[#E5AC66] text-[#1A1614]'
                            }`}
                          >
                            {isFull ? 'Đã Đủ Người' : 'Vào Chùa'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Primary Admin Controls: Create Temple & Delegate Sub-Admins */}
            {isPrimaryAdmin && (
              <div className="lg:col-span-5 space-y-5">
                <aside className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-[#FBF7F0]">
                      Mở Ngôi Chùa Mới (Quản trị viên)
                    </h3>
                    <p className="text-xs text-[#9E9387] mt-1">
                      Chỉ tài khoản quản trị viên chính mới được tạo mới hoặc xóa chùa đã tạo.
                    </p>
                  </div>

                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div>
                      <label className="block text-xs text-[#C7BDB1] mb-1.5" htmlFor="new-room-name">
                        Tên ngôi chùa
                      </label>
                      <input
                        id="new-room-name"
                        type="text"
                        required
                        maxLength={36}
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="vd: Am Trúc Yên"
                        className="w-full px-3.5 py-2.5 bg-[#1A1614] border border-[#3B312B] rounded-lg text-base sm:text-sm text-[#F5EFE6] placeholder-[#6D635A] focus:outline-none focus:border-[#D99B52]"
                      />
                    </div>

                    <div>
                      <span className="block text-xs text-[#C7BDB1] mb-1.5">Số người tối đa</span>
                      <div className="grid grid-cols-4 gap-2">
                        {[2, 3, 5, 10].map((cap) => (
                          <button
                            key={cap}
                            type="button"
                            onClick={() => setNewRoomCap(cap)}
                            className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                              newRoomCap === cap
                                ? 'bg-[#2E2620] border-[#D99B52] text-[#FBF7F0]'
                                : 'bg-[#1A1614] border-[#3B312B] text-[#C7BDB1]'
                            }`}
                          >
                            {cap} Người
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={creatingRoom || !newRoomName.trim()}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#D99B52] hover:bg-[#E5AC66] disabled:opacity-50 text-[#1A1614] text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      {creatingRoom ? 'Đang tạo...' : 'Tạo & Vào Chùa'}
                    </button>
                  </form>
                </aside>

                {/* Sub-Admin Delegation Panel */}
                <aside className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-[#FBF7F0] inline-flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#D99B52]" />
                        Bổ Nhiệm Phó Quản Trị
                      </h3>
                      <p className="text-xs text-[#9E9387] mt-0.5">
                        Phó quản trị được quyền chọn nhạc thiền và điều chỉnh thời tiết / ngày đêm (không tạo hay xóa chùa).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshRegisteredUsers()}
                      disabled={loadingUsers}
                      title="Làm mới danh sách hành giả"
                      className="p-1.5 rounded-lg bg-[#1A1614] border border-[#3B312B] text-[#C7BDB1] hover:text-[#F5EFE6] cursor-pointer shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {delegationMsg && (
                    <div className="px-3 py-2 rounded-lg bg-[#1E2C22] border border-[#3C6848] text-xs text-[#BFE5C8]">
                      {delegationMsg}
                    </div>
                  )}

                  {/* Currently appointed Sub-Admins */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#D99B52]">
                      Phó quản trị hiện tại ({subAdmins.length})
                    </div>
                    {subAdmins.length === 0 ? (
                      <p className="text-xs text-[#8D8276] italic">Chưa bổ nhiệm tài khoản nào.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {subAdmins.map((sa) => (
                          <div
                            key={sa.uid}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#1A1614] border border-[#3B312B]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <CharacterAvatar characterId={sa.characterId} size={26} />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-[#F5EFE6] truncate">
                                  {sa.displayName}
                                </div>
                                <div className="text-[10px] text-[#9E9387] truncate">
                                  Nhạc & Thời tiết
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={delegationBusyUid === sa.uid}
                              onClick={() => void handleRevokeSubAdmin(sa.uid, sa.displayName)}
                              className="px-2.5 py-1 rounded bg-[#3A201E] hover:bg-[#522B28] text-[11px] font-medium text-[#F5C2BC] inline-flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              <ShieldOff className="w-3 h-3" />
                              Thu hồi
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Appoint from registered visitors */}
                  <div className="space-y-1.5 pt-2 border-t border-[#332A24]">
                    <div className="text-[11px] font-semibold text-[#C7BDB1]">
                      Hành giả đã đăng ký ({registeredUsers.filter((u) => !subAdmins.some((s) => s.uid === u.id)).length})
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {registeredUsers
                        .filter((u) => !subAdmins.some((s) => s.uid === u.id))
                        .map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#1A1614] border border-[#332A24]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <CharacterAvatar characterId={u.characterId} size={26} />
                              <span className="text-xs text-[#F5EFE6] truncate">{u.displayName}</span>
                            </div>
                            <button
                              type="button"
                              disabled={delegationBusyUid === u.id}
                              onClick={() => void handleAppointSubAdmin(u)}
                              className="px-2.5 py-1 rounded bg-[#2E2620] hover:bg-[#3B312B] border border-[#D99B52]/40 text-[11px] font-medium text-[#F7D288] inline-flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Bổ nhiệm
                            </button>
                          </div>
                        ))}
                      {!loadingUsers &&
                        registeredUsers.filter((u) => !subAdmins.some((s) => s.uid === u.id)).length === 0 && (
                          <p className="text-xs text-[#8D8276] italic">
                            Không có thêm tài khoản nào để bổ nhiệm.
                          </p>
                        )}
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Character Selection */}
        {activeTab === 'character' && (
          <form
            onSubmit={handleSaveCharacter}
            className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-6 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#332A24] pb-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#FBF7F0]">
                  Chọn Nhân Vật & Pháp Danh
                </h2>
                <p className="text-xs text-[#9E9387] mt-1">
                  Hình dáng nhân vật sẽ hiển thị trực tiếp khi bạn dạo bước và tọa thiền trong chùa.
                </p>
              </div>
              <div className="w-full sm:w-64">
                <label className="block text-xs text-[#C7BDB1] mb-1" htmlFor="lobby-display-name">
                  Tên hiển thị
                </label>
                <input
                  id="lobby-display-name"
                  type="text"
                  maxLength={28}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1A1614] border border-[#3B312B] rounded-lg text-base sm:text-sm text-[#F5EFE6] focus:outline-none focus:border-[#D99B52]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {CHARACTERS.map((char) => {
                const isSelected = selectedChar === char.id;
                return (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => setSelectedChar(char.id)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#2E2620] border-[#D99B52]'
                        : 'bg-[#1A1614] border-[#3B312B] hover:border-[#5C4E45]'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center gap-2.5">
                      <CharacterAvatar characterId={char.id} size={72} />
                      <div>
                        <div className="text-xs text-[#D99B52]">{char.title}</div>
                        <div className="text-sm font-semibold text-[#FBF7F0] mt-0.5">{char.name}</div>
                      </div>
                    </div>
                    <p className="text-xs text-[#9E9387] leading-relaxed text-center">
                      {char.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="text-xs text-[#BFE5C8]">{charFeedback || ''}</div>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg bg-[#D99B52] hover:bg-[#E5AC66] text-[#1A1614] text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Lưu Pháp Danh & Nhân Vật
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Admin & Sub-Admin Music Console */}
        {activeTab === 'music' && canControlMusic && (
          <AdminMusicPanel
            user={user}
            tracks={tracks}
            musicState={musicState}
            isPrimaryAdmin={isPrimaryAdmin}
            embedded
          />
        )}
      </main>

      {showQrModal && (
        <InviteQrModal
          rooms={rooms}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
}
