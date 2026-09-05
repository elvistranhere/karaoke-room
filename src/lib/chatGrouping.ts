import type { ChatMessage } from "~/types/room";

const CHAT_GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface ChatMessageGroup {
  from: string;
  fromName: string;
  messages: [ChatMessage, ...ChatMessage[]];
}

/** Group nearby, consecutive messages without grouping across system notices. */
export function groupChatMessages(messages: ChatMessage[]): ChatMessageGroup[] {
  return messages.reduce<ChatMessageGroup[]>((groups, message) => {
    const previousGroup = groups.at(-1);
    const previousMessage = previousGroup?.messages.at(-1);
    const isSameConversationRun =
      message.from !== "system" &&
      previousGroup?.from === message.from &&
      previousGroup.fromName === message.fromName &&
      previousMessage !== undefined &&
      message.timestamp >= previousMessage.timestamp &&
      message.timestamp - previousMessage.timestamp <= CHAT_GROUP_WINDOW_MS;

    if (isSameConversationRun) {
      previousGroup.messages.push(message);
      return groups;
    }

    groups.push({
      from: message.from,
      fromName: message.fromName,
      messages: [message],
    });
    return groups;
  }, []);
}
