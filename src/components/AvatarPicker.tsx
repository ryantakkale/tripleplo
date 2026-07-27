"use client";

import { AVATARS, DEFAULT_AVATAR_ID, avatarSrc, type AvatarId } from "@/lib/avatars";

export function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarId;
  onChange: (id: AvatarId) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="label mb-0">Avatar</div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
        {AVATARS.map((a) => {
          const selected = value === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange(a.id)}
              aria-label={a.label}
              aria-pressed={selected}
              className={`relative aspect-square overflow-hidden rounded-full ring-2 transition ${
                selected
                  ? "ring-accent ring-offset-2 ring-offset-felt-900"
                  : "ring-white/10 hover:ring-white/30"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarSrc(a.id)}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          );
        })}
      </div>
      <div className="text-xs text-muted">
        {value === DEFAULT_AVATAR_ID ? "Default selected" : `${value} selected`}
      </div>
    </div>
  );
}
