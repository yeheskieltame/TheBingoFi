"use client";

import { useState } from "react";

export interface SkillMediaProps {
  readonly imageUrl?: string;
  readonly animationUrl?: string;
  /** Used for the alt text and the initials fallback tile. */
  readonly label: string;
  /** Ukuran/bentuk slot art - default petak kecil; /market memakai panel besar di kepala kartu. */
  readonly className?: string;
}

/**
 * Skill art slot (CONCEPT.md §3 "identitas premium": `image`/`animation_url`
 * from GET /metadata/:id.json). Real assets aren't dropped yet - the server
 * returns placeholder URLs that don't resolve to anything (server/API.md's
 * METADATA_ASSET_BASE_URL) - so this ALWAYS assumes the URL might be broken
 * and falls back to a plain initials tile via onError, never a broken
 * image/video icon. Prefers `animation_url` (video) over `image` when both
 * are present and working, per CONCEPT.md's "makin rare makin hidup
 * assetnya (static -> animated -> full effect)".
 *
 * Uses plain <img>/<video> rather than next/image on purpose (task brief) -
 * the URL's domain isn't known/configurable ahead of time, and next/image's
 * remotePatterns allowlist would need a real asset host to be useful.
 */
export default function SkillMedia({
  imageUrl,
  animationUrl,
  label,
  className = "h-20 w-20 shrink-0 rounded",
}: SkillMediaProps) {
  const [videoBroken, setVideoBroken] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const initials = label.trim().slice(0, 2).toUpperCase() || "?";

  if (animationUrl && !videoBroken) {
    return (
      <video
        src={animationUrl}
        className={`${className} bg-white/5 object-cover object-top`}
        muted
        loop
        playsInline
        autoPlay
        aria-label={label}
        onError={() => setVideoBroken(true)}
      />
    );
  }

  if (imageUrl && !imageBroken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external, per-skill placeholder URL (task brief: plain <img> + onError fallback, not next/image)
      <img
        src={imageUrl}
        alt={label}
        className={`${className} bg-white/5 object-cover object-top`}
        onError={() => setImageBroken(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${className} flex items-center justify-center bg-gradient-to-br from-white/10 to-white/[0.02] font-display text-3xl font-bold tracking-widest text-ice/25`}
    >
      {initials}
    </div>
  );
}
