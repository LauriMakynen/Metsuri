// Default profile picture: a person silhouette (head and shoulders) in a circle, like the
// default avatars on social networks. The tint comes from forest tones (moss, bark, lake,
// lichen, heather), picked by the name so the same person always gets the same colour.

const AVATAR_TONES = ['#2f6b3a', '#7a4a2a', '#2f5f7a', '#6b7a2f', '#6a3f6e'];

function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export default function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ ['--avatar-tone' as string]: avatarTone(name) }} aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <circle cx="20" cy="15.5" r="7.5" />
        <path d="M5.5 40c0-8.6 6.5-14.5 14.5-14.5S34.5 31.4 34.5 40z" />
      </svg>
    </span>
  );
}
