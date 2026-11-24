import { Bug, Coins, Handshake, MessagesSquare, Sprout } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ForumCategory } from '../services/forumService';

// Forum categories in sidebar order; tone colours the chip on each discussion
export const FORUM_CATEGORIES: { value: ForumCategory; label: string; Icon: LucideIcon; tone: string }[] = [
  { value: 'metsanhoito', label: 'Metsänhoito', Icon: Sprout, tone: '#2f7a43' },
  { value: 'puukauppa', label: 'Puukauppa', Icon: Coins, tone: '#a3620d' },
  { value: 'urakointi', label: 'Urakointi ja hinnat', Icon: Handshake, tone: '#2f5f7a' },
  { value: 'tuhot', label: 'Metsätuhot', Icon: Bug, tone: '#a33a2a' },
  { value: 'yleinen', label: 'Yleinen', Icon: MessagesSquare, tone: '#5b5f6b' },
];

export function forumCategory(value: string | null | undefined) {
  return FORUM_CATEGORIES.find((c) => c.value === value) ?? null;
}
