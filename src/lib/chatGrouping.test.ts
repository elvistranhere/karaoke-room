import { describe, expect, it } from "vitest";
import type { ChatMessage } from "~/types/room";
import { groupChatMessages } from "./chatGrouping";

function message(from: string, timestamp: number, text = "hello"): ChatMessage {
  return { from, fromName: from, text, timestamp };
}

describe("groupChatMessages", () => {
  it("groups consecutive messages from the same author", () => {
    const groups = groupChatMessages([
      message("gwen", 1_000, "one"),
      message("gwen", 2_000, "two"),
      message("alex", 3_000, "three"),
    ]);

    expect(groups.map((group) => group.messages.map((item) => item.text))).toEqual([
      ["one", "two"],
      ["three"],
    ]);
  });

  it("starts a new group after a system message or a five-minute gap", () => {
    const groups = groupChatMessages([
      message("gwen", 1_000, "one"),
      message("system", 2_000, "notice"),
      message("gwen", 3_000, "two"),
      message("gwen", 303_001, "three"),
    ]);

    expect(groups.map((group) => group.messages.map((item) => item.text))).toEqual([
      ["one"],
      ["notice"],
      ["two"],
      ["three"],
    ]);
  });
});
