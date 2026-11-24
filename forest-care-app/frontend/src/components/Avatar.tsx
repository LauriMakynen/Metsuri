// Round initial avatar in forest tones (moss, bark, lake, lichen, heather), picked by the name
// so the same person always gets the same colour. Used in chat and on the forum.

const AVATAR_TONES = ['#2f6b3a', '#7a4a2a', '#2f5f7a', '#6b7a2f', '#6a3f6e'];

function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export default function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ ['--avatar-tone' as string]: avatarTone(name) }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
