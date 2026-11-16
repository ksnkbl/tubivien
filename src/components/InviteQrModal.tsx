import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, X } from 'lucide-react';
import type { RoomSummary } from '../shared/types.ts';

interface InviteQrModalProps {
  onClose: () => void;
  defaultRoomId?: string;
  defaultRoomName?: string;
  rooms?: RoomSummary[];
}

export function InviteQrModal({
  onClose,
  defaultRoomId,
  defaultRoomName,
  rooms = [],
}: InviteQrModalProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(defaultRoomId || '');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const inviteUrl = useMemo(() => {
    const base = window.location.origin;
    return selectedRoomId ? `${base}/?room=${encodeURIComponent(selectedRoomId)}` : base;
  }, [selectedRoomId]);

  const targetLabel = useMemo(() => {
    if (!selectedRoomId) return 'Sảnh Chùa (chọn phòng sau khi vào)';
    if (defaultRoomId === selectedRoomId && defaultRoomName) return defaultRoomName;
    return rooms.find((r) => r.id === selectedRoomId)?.name || selectedRoomId;
  }, [selectedRoomId, defaultRoomId, defaultRoomName, rooms]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(inviteUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#1A1614',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [inviteUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#241E1A] border border-[#3B312B] rounded-xl p-5 sm:p-6 max-w-sm w-full max-h-[92vh] overflow-y-auto space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-[#D99B52] font-medium inline-flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" />
              Mời Bạn Đồng Tu
            </div>
            <h3 className="font-display text-xl font-semibold text-[#FBF7F0] mt-1">
              Mã QR Vào Chùa
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng mã QR"
            className="p-1.5 rounded-lg text-[#C7BDB1] hover:text-[#F5EFE6] hover:bg-[#332A24] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target room selector */}
        <div>
          <label htmlFor="qr-target-room" className="block text-xs text-[#C7BDB1] mb-1.5">
            Điểm đến khi quét mã
          </label>
          {defaultRoomId ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedRoomId(defaultRoomId)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer truncate ${
                  selectedRoomId === defaultRoomId
                    ? 'bg-[#2E2620] border-[#D99B52] text-[#FBF7F0]'
                    : 'bg-[#1A1614] border-[#3B312B] text-[#C7BDB1]'
                }`}
              >
                Vào thẳng phòng này
              </button>
              <button
                type="button"
                onClick={() => setSelectedRoomId('')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer truncate ${
                  selectedRoomId === ''
                    ? 'bg-[#2E2620] border-[#D99B52] text-[#FBF7F0]'
                    : 'bg-[#1A1614] border-[#3B312B] text-[#C7BDB1]'
                }`}
              >
                Vào Sảnh Chùa
              </button>
            </div>
          ) : (
            <select
              id="qr-target-room"
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 bg-[#1A1614] border border-[#3B312B] rounded-lg text-xs text-[#F5EFE6] focus:outline-none focus:border-[#D99B52]"
            >
              <option value="">Sảnh Chùa (chọn phòng sau khi vào)</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  Vào thẳng: {room.name} ({room.playerCount}/{room.maxPlayers} người)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Crisp high-contrast QR container */}
        <div className="flex flex-col items-center justify-center bg-white rounded-xl p-4 border border-[#E6DFD5]">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Mã QR mời vào ${targetLabel}`}
              className="w-56 h-56 object-contain"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-xs text-[#5C5349]">
              Đang tạo mã QR...
            </div>
          )}
          <div className="text-[11px] font-medium text-[#3B312B] mt-2 text-center line-clamp-1">
            {targetLabel}
          </div>
        </div>

        <p className="text-xs text-[#9E9387] text-center leading-relaxed">
          Bạn bè dùng camera điện thoại hoặc Zalo quét mã này để mở ngay trang chùa và đăng nhập Google.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex-1 py-2.5 px-3 rounded-lg bg-[#2E2620] hover:bg-[#3B312B] text-xs font-medium text-[#F5EFE6] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#BFE5C8]" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Đã sao chép' : 'Sao chép link'}
          </button>
          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`ma-qr-${selectedRoomId || 'chua-tinh-tam'}.png`}
              className="flex-1 py-2.5 px-3 rounded-lg bg-[#D99B52] hover:bg-[#E5AC66] text-xs font-semibold text-[#1A1614] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Tải ảnh QR
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
