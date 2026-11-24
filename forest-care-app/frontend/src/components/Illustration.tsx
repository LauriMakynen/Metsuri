// Small 3D illustrations for empty states and help pages: Microsoft Fluent Emoji 3D (MIT,
// see public/media/3d/LICENSE-fluentui-emoji.txt). Decorative only: the text next to them
// carries the meaning, so they are hidden from screen readers.

export type IllustrationName = 'tree' | 'pin' | 'wood' | 'book' | 'memo';

interface IllustrationProps {
  name: IllustrationName;
  /** Rendered size in px (the images are 256 × 256) */
  size?: number;
  className?: string;
}

export default function Illustration({ name, size = 72, className = '' }: IllustrationProps) {
  return (
    <img
      className={`illustration ${className}`}
      src={`/media/3d/${name}.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
    />
  );
}
