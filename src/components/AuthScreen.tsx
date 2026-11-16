import { useState, type FormEvent } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { LogIn, LogOut, Sparkles } from 'lucide-react';
import { auth, googleProvider } from '../firebase.ts';
import { CHARACTERS, type CharacterId, type PublicUser } from '../shared/types.ts';
import { createUserProfile, isUserAdmin } from '../services/templeFirestore.ts';
import { CharacterAvatar } from './CharacterAvatar.tsx';

interface AuthScreenProps {
  firebaseUser: User | null;
  onProfileCreated: (user: PublicUser) => void;
}

export function AuthScreen({ firebaseUser, onProfileCreated }: AuthScreenProps) {
  const [displayName, setDisplayName] = useState(firebaseUser?.displayName?.slice(0, 28) || '');
  const [characterId, setCharacterId] = useState<CharacterId>('ao-lam');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed-by-user')) {
        setError('Bạn đã đóng cửa sổ đăng nhập Google.');
      } else {
        setError('Không thể đăng nhập bằng Google. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setError(null);
    setLoading(true);
    try {
      const profile = await createUserProfile(
        firebaseUser,
        displayName || firebaseUser.displayName || 'Hành Giả',
        characterId
      );
      onProfileCreated(profile);
    } catch {
      setError('Không thể tạo hồ sơ hành giả trên Firebase. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1A1614] text-[#F5EFE6] flex flex-col justify-center px-4 py-6 sm:px-6 sm:py-10">
      <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-stretch">
        {/* Left column: Serene temple introduction */}
        <div className="lg:col-span-5 bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 sm:p-8 flex flex-col justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-4xl font-semibold text-[#FBF7F0] leading-tight mb-3 sm:mb-4 [text-wrap:balance]">
              Từ Bi Viện
            </h1>
            <p className="text-sm text-[#C7BDB1] leading-relaxed mb-5 sm:mb-6">
              Ngôi chùa nhỏ trực tuyến nhẹ nhàng, ít tài nguyên, kết nối trực tiếp qua Firebase để bạn
              và 1–2 người bạn cùng thắp hương, thỉnh chuông, tọa thiền và nghe nhạc thiền đồng bộ.
            </p>

            <div className="space-y-3 border-t border-[#3B312B] pt-4 sm:pt-5 text-sm text-[#D6CEC3]">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4">
                <span className="text-xs sm:text-sm text-[#9E9387]">Quy mô mỗi phòng</span>
                <span className="font-mono-num text-[#F5EFE6]">2 – 3 hành giả</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4">
                <span className="text-xs sm:text-sm text-[#9E9387]">Hoạt động trong chùa</span>
                <span className="text-[#F5EFE6]">Thắp nhang · Thỉnh chuông · Xin xăm</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4">
                <span className="text-xs sm:text-sm text-[#9E9387]">Âm nhạc phòng thiền</span>
                <span className="text-[#F5EFE6]">Nhạc mặc định & danh sách Admin</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Google Sign-In OR First-Time Character Profile Setup */}
        <div className="lg:col-span-7 bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 sm:p-8 flex flex-col justify-center">
          {!firebaseUser ? (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#FBF7F0]">
                  Đăng Nhập Để Vào Chùa
                </h2>
                <p className="text-sm text-[#C7BDB1] mt-2 leading-relaxed">
                  Mỗi người vào chùa sẽ đăng nhập bằng tài khoản Google, sau đó tạo pháp danh và chọn
                  nhân vật cho mình.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 rounded-lg bg-[#3A201E] border border-[#8D3E36] text-xs text-[#F5C2BC]"
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGoogleLogin()}
                className="w-full py-3 px-5 bg-[#D99B52] hover:bg-[#E5AC66] disabled:opacity-60 text-[#1A1614] font-semibold text-sm rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                {loading ? 'Đang kết nối Google...' : 'Đăng Nhập Bằng Google'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateProfile} className="space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-[#332A24] pb-4">
                <div>
                  <div className="text-xs text-[#D99B52]">
                    Đã xác thực: {firebaseUser.email}
                    {isUserAdmin(firebaseUser) ? ' · Quản trị viên' : ''}
                  </div>
                  <h2 className="font-display text-2xl font-semibold text-[#FBF7F0] mt-1">
                    Tạo Hồ Sơ & Chọn Nhân Vật
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut(auth)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#C7BDB1] hover:text-[#F5EFE6] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Đổi tài khoản
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#C7BDB1] mb-1.5" htmlFor="onboard-name">
                  Pháp danh / Tên hiển thị trong chùa
                </label>
                <input
                  id="onboard-name"
                  type="text"
                  required
                  maxLength={28}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="vd: Minh Tâm, Liên Hoa..."
                  className="w-full px-3.5 py-2.5 bg-[#1A1614] border border-[#3B312B] rounded-lg text-base sm:text-sm text-[#F5EFE6] placeholder-[#6D635A] focus:outline-none focus:border-[#D99B52]"
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-medium text-[#C7BDB1]">Chọn nhân vật của bạn</span>
                  <span className="text-xs text-[#D99B52]">
                    {CHARACTERS.find((c) => c.id === characterId)?.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {CHARACTERS.map((char) => {
                    const active = char.id === characterId;
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => setCharacterId(char.id)}
                        className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                          active
                            ? 'bg-[#2E2620] border-[#D99B52]'
                            : 'bg-[#1A1614] border-[#3B312B] hover:border-[#5C4E45]'
                        }`}
                      >
                        <CharacterAvatar characterId={char.id} size={46} />
                        <span className="text-xs font-medium text-[#F5EFE6] leading-tight line-clamp-1">
                          {char.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 rounded-lg bg-[#3A201E] border border-[#8D3E36] text-xs text-[#F5C2BC]"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-5 bg-[#D99B52] hover:bg-[#E5AC66] disabled:opacity-60 text-[#1A1614] font-semibold text-sm rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {loading ? 'Đang lưu hồ sơ...' : 'Hoàn Tất & Vào Sảnh Chùa'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
