/** Deterministic sender color shared by chat and floating room activity. */
export function chatNameColor(peerId: string): string {
  const colors = [
    "var(--chat-name-1)",
    "var(--chat-name-2)",
    "var(--chat-name-3)",
    "var(--chat-name-4)",
    "var(--chat-name-5)",
    "var(--chat-name-6)",
    "var(--chat-name-7)",
    "var(--chat-name-8)",
  ];
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length]!;
}
