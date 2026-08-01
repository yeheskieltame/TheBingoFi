import { avatarTint } from "@/lib/avatarTint";

export interface PlazaAvatarProps {
  readonly nickname: string;
  /** Sizing + text-size utility classes - callers control how big the circle is (composer/post vs reply). */
  readonly className?: string;
}

/**
 * Round initials avatar shared by every Plaza surface (composer, post,
 * reply) - color comes from `lib/avatarTint.ts` so the same nickname always
 * reads as the same color, no state/storage needed.
 */
export default function PlazaAvatar({ nickname, className = "size-9 text-xs" }: PlazaAvatarProps) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-display font-bold text-frost ${avatarTint(nickname)} ${className}`}
    >
      {nickname.slice(0, 2).toUpperCase()}
    </span>
  );
}
