import { CHARACTERS, type CharacterId } from '../shared/types.ts';

interface CharacterAvatarProps {
  characterId: CharacterId;
  size?: number;
  className?: string;
}

export function CharacterAvatar({ characterId, size = 56, className = '' }: CharacterAvatarProps) {
  const char = CHARACTERS.find((c) => c.id === characterId) || CHARACTERS[0];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={char.name}
    >
      {/* Subtle circular halo backdrop */}
      <circle cx="32" cy="32" r="30" fill="#231D19" stroke={char.accentColor} strokeWidth="1.5" strokeOpacity="0.45" />

      {/* Robe body */}
      <path
        d="M14 58C14 45 20 39 32 39C44 39 50 45 50 58"
        fill={char.robePrimary}
      />
      {/* Robe collar / sash */}
      <path
        d="M23 40L32 51L41 40"
        stroke={char.robeSecondary}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 41L32 48L38 41"
        stroke={char.accentColor}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />

      {/* Neck & Head */}
      <rect x="28.5" y="34" width="7" height="7" rx="3" fill={char.skinTone} />

      {/* Back hair for long style */}
      {char.hairStyle === 'long' && (
        <path d="M19 25C19 16 25 11 32 11C39 11 45 16 45 25V41H19V25Z" fill="#211A17" />
      )}

      {/* Top bun for bun style */}
      {char.hairStyle === 'bun' && (
        <circle cx="32" cy="11" r="5" fill="#221B18" />
      )}

      {/* Face */}
      <circle cx="32" cy="25" r="11" fill={char.skinTone} />

      {/* Hair front */}
      {char.hairStyle === 'shaved' ? (
        <path
          d="M22 21C22 15.5 26.5 13 32 13C37.5 13 42 15.5 42 21"
          fill={char.skinTone}
        />
      ) : (
        <path
          d="M21 23C21 16 25.5 12.5 32 12.5C38.5 12.5 43 16 43 23C40 19.5 36.5 18 32 18C27.5 18 24 19.5 21 23Z"
          fill="#221B18"
        />
      )}

      {/* Serene eyes & smile */}
      <path d="M26.5 25.5C27.2 26.3 28.4 26.3 29.1 25.5" stroke="#2D221D" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M34.9 25.5C35.6 26.3 36.8 26.3 37.5 25.5" stroke="#2D221D" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M29.8 29.5C31 30.6 33 30.6 34.2 29.5" stroke="#8C4E42" strokeWidth="1.3" strokeLinecap="round" />

      {/* Rosy cheeks */}
      <circle cx="25.5" cy="28" r="1.6" fill="#D98B80" fillOpacity="0.45" />
      <circle cx="38.5" cy="28" r="1.6" fill="#D98B80" fillOpacity="0.45" />

      {/* Prayer beads / lotus accent for novice monk */}
      {characterId === 'tieu-su' && (
        <circle cx="32" cy="52" r="2" fill={char.accentColor} />
      )}
    </svg>
  );
}
