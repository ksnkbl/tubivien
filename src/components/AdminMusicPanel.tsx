import { useRef, useState, type FormEvent } from 'react';
import { Pause, Play, SkipBack, SkipForward, Trash2, Upload, Music2, Youtube, X, ListMusic, Repeat, CheckSquare, Square } from 'lucide-react';
import type { MusicPlayMode, MusicState, MusicTrack, PublicUser } from '../shared/types.ts';
import { extractYouTubeVideoId, zenAudio } from '../audio/zenAudioEngine.ts';
import {
  adminControlMusicInFirestore,
  adminDeleteTrackFromFirestore,
  adminUploadTrackToFirestore,
  resolveEffectivePlaylist,
} from '../services/templeFirestore.ts';

interface AdminMusicPanelProps {
  user: PublicUser;
  tracks: MusicTrack[];
  musicState: MusicState;
  isPrimaryAdmin?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc tệp âm thanh.'));
    reader.readAsDataURL(file);
  });
}

export function AdminMusicPanel({
  user,
  tracks,
  musicState,
  isPrimaryAdmin = user.role === 'admin',
  onClose,
  embedded = false,
}: AdminMusicPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMode, setUploadMode] = useState<'youtube' | 'file'>('youtube');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const playMode: MusicPlayMode = musicState.playMode === 'playlist' ? 'playlist' : 'single';
  const validTrackIds = new Set(tracks.map((t) => t.id));
  const selectedIds = (musicState.playlistTrackIds ?? []).filter((id) => validTrackIds.has(id));
  const effectivePlaylist = resolveEffectivePlaylist(tracks, musicState);
  const activeTrack = tracks.find((t) => t.id === musicState.activeTrackId) || tracks[0];
  const activePlaylistIdx =
    playMode === 'playlist'
      ? effectivePlaylist.findIndex((t) => t.id === activeTrack?.id)
      : -1;

  const sendControl = async (
    action: 'play' | 'pause' | 'toggle' | 'select' | 'next' | 'prev' | 'setPlaylist',
    trackId?: string,
    options?: {
      playMode?: MusicPlayMode;
      playlistTrackIds?: string[];
      autoStart?: boolean;
    }
  ) => {
    zenAudio.unlock();
    setBusyAction(true);
    setFeedback(null);
    try {
      await adminControlMusicInFirestore(
        user.displayName,
        action,
        tracks,
        musicState,
        trackId,
        options
      );
    } catch {
      setFeedback({ kind: 'err', text: 'Không thể cập nhật trạng thái phát nhạc.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleTogglePlayMode = (nextMode: MusicPlayMode) => {
    if (nextMode === playMode) return;
    const defaultIds =
      selectedIds.length > 0 ? selectedIds : tracks.map((t) => t.id);
    void sendControl('setPlaylist', undefined, {
      playMode: nextMode,
      playlistTrackIds: nextMode === 'playlist' ? defaultIds : selectedIds,
      autoStart: nextMode === 'playlist' && !defaultIds.includes(musicState.activeTrackId),
    });
  };

  const handleToggleTrackInPlaylist = (trackId: string) => {
    const exists = selectedIds.includes(trackId);
    const nextIds = exists
      ? selectedIds.filter((id) => id !== trackId)
      : [...selectedIds, trackId];
    void sendControl('setPlaylist', undefined, {
      playMode: nextIds.length > 0 ? 'playlist' : 'single',
      playlistTrackIds: nextIds,
      autoStart: false,
    });
  };

  const handleStartPlaylist = () => {
    if (selectedIds.length === 0) return;
    void sendControl('setPlaylist', undefined, {
      playMode: 'playlist',
      playlistTrackIds: selectedIds,
      autoStart: true,
    });
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (uploadMode === 'youtube') {
      const videoId = extractYouTubeVideoId(youtubeUrl);
      if (!videoId) {
        setFeedback({
          kind: 'err',
          text: 'Link YouTube chưa đúng định dạng (ví dụ: https://www.youtube.com/watch?v=... hoặc https://youtu.be/...).',
        });
        return;
      }
      setUploading(true);
      try {
        const cleanTitle = title.trim() || `Nhạc Thiền YouTube (${videoId})`;
        await adminUploadTrackToFirestore(user, {
          title: cleanTitle,
          artist: artist.trim() || 'YouTube',
          audioUrl: `https://www.youtube.com/watch?v=${videoId}`,
          sizeBytes: 0,
        });
        setTitle('');
        setArtist('');
        setYoutubeUrl('');
        setFeedback({ kind: 'ok', text: `Đã thêm "${cleanTitle}" vào danh sách phát.` });
      } catch {
        setFeedback({ kind: 'err', text: 'Không thể lưu bài nhạc YouTube lên Firestore.' });
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!selectedFile) {
      setFeedback({ kind: 'err', text: 'Vui lòng chọn tệp âm thanh từ máy của bạn.' });
      return;
    }
    if (selectedFile.size > 650 * 1024) {
      setFeedback({
        kind: 'err',
        text: 'Tệp tải trực tiếp giới hạn tối đa 650 KB. Với nhạc dài, hãy dùng tab "Dán Link YouTube".',
      });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(selectedFile);
      const cleanTitle =
        title.trim() || selectedFile.name.replace(/\.[^/.]+$/, '') || 'Nhạc Thiền Tải Lên';
      await adminUploadTrackToFirestore(user, {
        title: cleanTitle,
        artist: artist.trim() || user.displayName,
        audioUrl: dataUrl,
        sizeBytes: selectedFile.size,
      });
      setTitle('');
      setArtist('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFeedback({ kind: 'ok', text: `Đã thêm "${cleanTitle}" vào danh sách phát.` });
    } catch {
      setFeedback({ kind: 'err', text: 'Không thể lưu tệp âm thanh lên Firestore.' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (track: MusicTrack) => {
    if (track.sourceType === 'builtin') return;
    setBusyAction(true);
    setFeedback(null);
    try {
      await adminDeleteTrackFromFirestore(track.id, musicState, user.displayName);
      setFeedback({ kind: 'ok', text: `Đã xóa "${track.title}".` });
    } catch {
      setFeedback({ kind: 'err', text: 'Không thể xóa bài nhạc.' });
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'bg-[#241E1A] border border-[#3B312B] rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6'
          : 'bg-[#241E1A] border border-[#3B312B] rounded-xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5 sm:space-y-6 shadow-2xl'
      }
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#3B312B] pb-4">
        <div>
          <p className="text-xs text-[#D99B52] font-medium mb-1">
            Bảng Điều Khiển Âm Nhạc · {isPrimaryAdmin ? 'Quản Trị Viên Chính' : 'Phó Quản Trị'}
          </p>
          <h2 className="font-display text-2xl font-semibold text-[#FBF7F0]">
            Điều Phối Nhạc Thiền Toàn Chùa
          </h2>
          <p className="text-xs text-[#9E9387] mt-1">
            Đồng bộ thời gian thực qua Firestore tới tất cả hành giả đang viếng chùa.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng điều khiển nhạc"
            className="p-2 rounded-lg text-[#C7BDB1] hover:text-[#F5EFE6] hover:bg-[#332A24] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Now playing & global controls */}
      <div className="bg-[#1A1614] border border-[#332A24] rounded-lg p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-[#9E9387] mb-0.5">
              {musicState.isPlaying ? 'Đang phát toàn chùa' : 'Đang tạm dừng'} ·{' '}
              {playMode === 'playlist'
                ? activePlaylistIdx >= 0
                  ? `Danh sách bài ${activePlaylistIdx + 1}/${effectivePlaylist.length}`
                  : `Chế độ danh sách (${effectivePlaylist.length} bài)`
                : 'Lặp 1 bài'}{' '}
              · Cập nhật bởi {musicState.updatedBy}
            </div>
            <div className="text-base font-semibold text-[#FBF7F0] truncate">
              {activeTrack?.title || 'Thiền Tâm Nhã Khúc'}
            </div>
            <div className="text-xs text-[#C7BDB1] truncate">
              {activeTrack?.artist || 'Hệ thống'} ·{' '}
              {activeTrack?.sourceType === 'builtin'
                ? 'Nhạc thiền mặc định'
                : extractYouTubeVideoId(activeTrack?.audioUrl)
                ? 'Nhạc YouTube'
                : 'Danh sách Admin'}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void sendControl('prev')}
              title="Bài trước"
              className="p-2.5 rounded-lg bg-[#2A221E] hover:bg-[#382E28] text-[#F5EFE6] transition-colors cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void sendControl('toggle')}
              className="px-4 py-2.5 rounded-lg bg-[#D99B52] hover:bg-[#E5AC66] text-[#1A1614] font-semibold text-sm inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {musicState.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {musicState.isPlaying ? 'Tạm dừng' : 'Phát nhạc'}
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void sendControl('next')}
              title="Bài tiếp theo"
              className="p-2.5 rounded-lg bg-[#2A221E] hover:bg-[#382E28] text-[#F5EFE6] transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Playback Mode Toggle: Single Loop vs Custom Sequential Looping Playlist */}
        <div className="pt-3 border-t border-[#2E2520] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#241E1A] rounded-lg border border-[#332A24] w-fit">
            <button
              type="button"
              disabled={busyAction}
              onClick={() => handleTogglePlayMode('single')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                playMode === 'single'
                  ? 'bg-[#D99B52] text-[#1A1614] font-semibold'
                  : 'text-[#C7BDB1] hover:text-[#F5EFE6]'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              Lặp 1 bài
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => handleTogglePlayMode('playlist')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                playMode === 'playlist'
                  ? 'bg-[#D99B52] text-[#1A1614] font-semibold'
                  : 'text-[#C7BDB1] hover:text-[#F5EFE6]'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              Phát danh sách ({selectedIds.length > 0 ? selectedIds.length : tracks.length} bài)
            </button>
          </div>

          <p className="text-[11px] text-[#9E9387]">
            {playMode === 'playlist'
              ? 'Đánh dấu các bài muốn phát lần lượt; hết bài cuối sẽ tự quay lại bài đầu.'
              : 'Đang phát lặp lại liên tục một bài được chọn.'}
          </p>
        </div>
      </div>

      {/* Add track: YouTube link (default) or Small local file */}
      <form onSubmit={handleUpload} className="bg-[#1A1614] border border-[#332A24] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[#F5EFE6]">Thêm bài nhạc thiền mới</div>
          <div className="flex items-center gap-1 p-0.5 bg-[#241E1A] rounded-lg border border-[#332A24]">
            <button
              type="button"
              onClick={() => setUploadMode('youtube')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                uploadMode === 'youtube' ? 'bg-[#D99B52] text-[#1A1614]' : 'text-[#C7BDB1]'
              }`}
            >
              Dán Link YouTube
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('file')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                uploadMode === 'file' ? 'bg-[#D99B52] text-[#1A1614]' : 'text-[#C7BDB1]'
              }`}
            >
              Tải Tệp Nhỏ
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#C7BDB1] mb-1" htmlFor="track-title">
              Tên bài nhạc (tùy chọn)
            </label>
            <input
              id="track-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="vd: Nhạc Thiền Tĩnh Tâm 1 Giờ"
              maxLength={80}
              className="w-full px-3 py-2 bg-[#241E1A] border border-[#3B312B] rounded-lg text-base sm:text-sm text-[#F5EFE6] placeholder-[#6D635A] focus:outline-none focus:border-[#D99B52]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#C7BDB1] mb-1" htmlFor="track-artist">
              Nghệ sĩ / Kênh (tùy chọn)
            </label>
            <input
              id="track-artist"
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="vd: Sư Thầy / YouTube"
              maxLength={60}
              className="w-full px-3 py-2 bg-[#241E1A] border border-[#3B312B] rounded-lg text-base sm:text-sm text-[#F5EFE6] placeholder-[#6D635A] focus:outline-none focus:border-[#D99B52]"
            />
          </div>
        </div>

        {uploadMode === 'youtube' ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/..."
              className="flex-1 px-3 py-2 bg-[#241E1A] border border-[#3B312B] rounded-lg text-base sm:text-sm text-[#F5EFE6] placeholder-[#6D635A] focus:outline-none focus:border-[#D99B52]"
            />
            <button
              type="submit"
              disabled={uploading || !youtubeUrl.trim()}
              className="px-4 py-2 rounded-lg bg-[#D99B52] hover:bg-[#E5AC66] disabled:opacity-50 text-[#1A1614] text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Youtube className="w-4 h-4" />
              {uploading ? 'Đang lưu...' : 'Thêm YouTube'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="text-xs text-[#C7BDB1] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#332A24] file:text-[#F5EFE6] hover:file:bg-[#43372F] cursor-pointer flex-1"
            />
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-4 py-2 rounded-lg bg-[#D99B52] hover:bg-[#E5AC66] disabled:opacity-50 text-[#1A1614] text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Đang lưu...' : 'Tải Lên'}
            </button>
          </div>
        )}
        <p className="text-xs text-[#8D8276]">
          {uploadMode === 'youtube'
            ? 'Chỉ cần dán link YouTube bất kỳ (youtube.com/watch?v=..., youtu.be/..., shorts/...), hệ thống sẽ phát âm thanh nền cho cả phòng.'
            : 'Tệp tải trực tiếp giới hạn ≤ 650 KB để tiết kiệm dung lượng Firestore.'}
        </p>
      </form>

      {feedback && (
        <div
          className={`px-3.5 py-2.5 rounded-lg text-xs border ${
            feedback.kind === 'ok'
              ? 'bg-[#1E2C22] border-[#3C6848] text-[#BFE5C8]'
              : 'bg-[#3A201E] border-[#8D3E36] text-[#F5C2BC]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Playlist */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#F5EFE6]">
              Danh sách nhạc ({tracks.length} bài)
            </h3>
            <p className="text-[11px] text-[#9E9387]">
              Tích chọn các bài muốn phát (vd: bài 2, 5, 6) để tạo vòng phát tuần tự
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={busyAction || tracks.length === 0}
              onClick={() =>
                void sendControl('setPlaylist', undefined, {
                  playMode: 'playlist',
                  playlistTrackIds: tracks.map((t) => t.id),
                  autoStart: false,
                })
              }
              className="px-2.5 py-1 rounded-md bg-[#2A221E] hover:bg-[#382E28] text-[11px] font-medium text-[#C7BDB1] hover:text-[#F5EFE6] cursor-pointer"
            >
              Chọn tất cả
            </button>
            <button
              type="button"
              disabled={busyAction || selectedIds.length === 0}
              onClick={() =>
                void sendControl('setPlaylist', undefined, {
                  playMode: 'single',
                  playlistTrackIds: [],
                  autoStart: false,
                })
              }
              className="px-2.5 py-1 rounded-md bg-[#2A221E] hover:bg-[#382E28] disabled:opacity-45 text-[11px] font-medium text-[#C7BDB1] hover:text-[#F5EFE6] cursor-pointer"
            >
              Bỏ chọn
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                disabled={busyAction}
                onClick={handleStartPlaylist}
                className="px-2.5 py-1 rounded-md bg-[#D99B52] hover:bg-[#E5AC66] text-[11px] font-semibold text-[#1A1614] inline-flex items-center gap-1 cursor-pointer"
              >
                <ListMusic className="w-3.5 h-3.5" />
                Phát danh sách ({selectedIds.length})
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-[#332A24] border border-[#332A24] rounded-lg bg-[#1A1614]">
          {tracks.map((track, idx) => {
            const isActive = track.id === activeTrack?.id;
            const isYouTube = Boolean(extractYouTubeVideoId(track.audioUrl));
            const orderInPlaylist = selectedIds.indexOf(track.id);
            const inPlaylist = orderInPlaylist >= 0;
            return (
              <div
                key={track.id}
                className={`p-3.5 flex items-center justify-between gap-3 ${
                  isActive ? 'bg-[#28201B]' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleToggleTrackInPlaylist(track.id)}
                    title={
                      inPlaylist
                        ? 'Bỏ bài này khỏi danh sách phát'
                        : 'Chọn bài này vào danh sách phát'
                    }
                    className={`p-1 rounded-md transition-colors shrink-0 cursor-pointer ${
                      inPlaylist
                        ? 'text-[#D99B52] hover:bg-[#332A24]'
                        : 'text-[#6D635A] hover:text-[#C7BDB1] hover:bg-[#2A221E]'
                    }`}
                  >
                    {inPlaylist ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 relative ${
                      isActive ? 'bg-[#D99B52] text-[#1A1614]' : 'bg-[#2A221E] text-[#C7BDB1]'
                    }`}
                  >
                    {isYouTube ? <Youtube className="w-4 h-4" /> : <Music2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-mono-num text-[#9E9387] shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-medium text-[#F5EFE6] truncate">
                        {track.title}
                      </span>
                      {inPlaylist && (
                        <span className="px-1.5 py-0.5 rounded bg-[#D99B52]/20 border border-[#D99B52]/40 text-[10px] font-mono-num font-semibold text-[#F7D288] whitespace-nowrap shrink-0">
                          DS #{orderInPlaylist + 1}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#9E9387] truncate">
                      {track.artist}
                      {' · '}
                      {track.sourceType === 'builtin'
                        ? 'Nhạc thiền mặc định'
                        : isYouTube
                        ? `YouTube · Thêm bởi ${track.uploadedBy}`
                        : `Tệp nhỏ · Thêm bởi ${track.uploadedBy}${
                            track.sizeBytes ? ` · ${formatBytes(track.sizeBytes)}` : ''
                          }`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() =>
                      void (isActive ? sendControl('toggle') : sendControl('select', track.id))
                    }
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      isActive && musicState.isPlaying
                        ? 'bg-[#D99B52] text-[#1A1614]'
                        : 'bg-[#2E2620] hover:bg-[#3B312B] text-[#F5EFE6]'
                    }`}
                  >
                    {isActive && musicState.isPlaying
                      ? 'Đang phát'
                      : isActive
                      ? 'Tiếp tục'
                      : 'Phát bài này'}
                  </button>

                  {track.sourceType === 'upload' && (
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleDelete(track)}
                      title="Xóa bài nhạc"
                      className="p-2 rounded-md text-[#C7BDB1] hover:text-[#F5C2BC] hover:bg-[#3A201E] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
