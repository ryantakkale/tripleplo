/** Curated profile avatars for host / join / practice. */

export const DEFAULT_AVATAR_ID = "Default" as const;

export const AVATARS = [
  { id: "Default", label: "Default" },
  { id: "Yam", label: "Yam" },
  { id: "Sergio", label: "Sergio" },
  { id: "Kale", label: "Kale" },
  { id: "Tat", label: "Tat" },
  { id: "Elt", label: "Elt" },
  { id: "Hop", label: "Hop" },
  { id: "Roy", label: "Roy" },
  { id: "Hound", label: "Hound" },
  { id: "Corner", label: "Corner" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];

const AVATAR_IDS = new Set<string>(AVATARS.map((a) => a.id));

export function isAvatarId(value: string): value is AvatarId {
  return AVATAR_IDS.has(value);
}

export function normalizeAvatarId(value: unknown): AvatarId {
  if (typeof value === "string" && isAvatarId(value)) return value;
  return DEFAULT_AVATAR_ID;
}

export function avatarSrc(id: string | null | undefined): string {
  return `/avatars/${normalizeAvatarId(id)}.png`;
}
