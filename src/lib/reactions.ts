// Single source of truth for allowed reaction emojis.
// Used by both client (Toolbar) and should match server (party/index.ts).
export const REACTION_EMOJIS = ["🔥", "👏", "😍", "🎵", "💯", "🙌", "😂", "💀", "👎", "😴"] as const;
export type ReactionEmoji = typeof REACTION_EMOJIS[number];
