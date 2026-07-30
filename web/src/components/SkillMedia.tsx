"use client";

import { useState } from "react";

export interface SkillMediaProps {
  readonly imageUrl?: string;
  readonly animationUrl?: string;
  /** Used for the alt text and the initials fallback tile. */
  readonly label: string;
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
export default function SkillMedia({ imageUrl, animationUrl, label }: SkillMediaProps) {
  const [videoBroken, setVideoBroken] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const initials = label.trim().slice(0, 2).toUpperCase() || "?";

  if (animationUrl && !videoBroken) {
    return (
      <video
        src={animationUrl}
        className="h-20 w-20 shrink-0 rounded bg-slate-800 object-cover"
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
        className="h-20 w-20 shrink-0 rounded bg-slate-800 object-cover"
        onError={() => setImageBroken(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-slate-800 text-xl font-bold text-slate-500"
    >
      {initials}
    </div>
  );
}
