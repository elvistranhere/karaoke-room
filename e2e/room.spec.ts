import { expect, test, type Browser } from "@playwright/test";
import { enterRoom, joinRoom, openQueuePanel, openRoom, uniqueRoomCode, type RoomClient } from "./fixtures/room";

const clients: RoomClient[] = [];

async function join(browser: Browser, roomCode: string, name: string): Promise<RoomClient> {
  const client = await joinRoom(browser, roomCode, name);
  clients.push(client);
  return client;
}

test.afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.context.close()));
});

test("two clients join one room and see each other in the participants list", async ({ browser }) => {
  const roomCode = uniqueRoomCode();
  const alice = await join(browser, roomCode, "Alice");
  const bob = await join(browser, roomCode, "Bob");

  for (const client of [alice, bob]) {
    await expect(client.people.getByText("Alice", { exact: true })).toBeVisible();
    await expect(client.people.getByText("Bob", { exact: true })).toBeVisible();
    await expect(client.page.locator("#panel-tab-people")).toContainText("2");
  }

  await expect(alice.people.getByText("(you)")).toBeVisible();
  await expect(alice.people.getByLabel("Host")).toBeVisible();
});

test("a chat message crosses from one client to the other", async ({ browser }) => {
  const roomCode = uniqueRoomCode();
  const alice = await join(browser, roomCode, "Alice");
  const bob = await join(browser, roomCode, "Bob");
  await expect(bob.people.getByText("Alice", { exact: true })).toBeVisible();

  const message = `sound check ${Date.now()}`;
  const input = alice.chat.getByPlaceholder("Type a message...");
  await input.fill(message);
  await input.press("Enter");

  await expect(bob.chat.getByText(message)).toBeVisible();
  await expect(bob.chat.getByText("Alice", { exact: true })).toBeVisible();
  await expect(alice.chat.getByText(message)).toBeVisible();
  await expect(input).toHaveValue("");
});

test("joining the queue promotes the requester onto the stage for everyone", async ({ browser }) => {
  const roomCode = uniqueRoomCode();
  const alice = await join(browser, roomCode, "Alice");
  const bob = await join(browser, roomCode, "Bob");
  await expect(alice.people.getByText("Bob", { exact: true })).toBeVisible();

  const queue = await openQueuePanel(bob);
  await queue.getByRole("button", { name: "Add to Queue" }).click();

  await expect(queue.getByText("You're singing!")).toBeVisible();
  await expect(bob.stage.getByRole("heading", { name: "Your turn to sing" })).toBeVisible();
  await expect(alice.stage.getByRole("heading", { name: "Bob is singing" })).toBeVisible();
  await expect(alice.people.getByText("On stage")).toBeVisible();

  await bob.stage.getByRole("button", { name: "Leave stage" }).click();

  await expect(alice.stage.getByRole("heading", { name: "The stage is ready" })).toBeVisible();
  await expect(bob.stage.getByRole("heading", { name: "The stage is ready" })).toBeVisible();
});

test("the entry overlay reports party, LiveKit and player readiness", async ({ browser, request }) => {
  const probe = await request.get(`/api/livekit-token?room=${uniqueRoomCode()}&name=probe`);
  test.skip(!probe.ok(), "LiveKit credentials are not configured for this environment");

  const roomCode = uniqueRoomCode();
  const alice = await openRoom(browser, roomCode, "Alice");
  clients.push(alice);

  await expect(alice.entry).toHaveAttribute("data-party-connected", "true");
  await expect(alice.entry).toHaveAttribute("data-player-api-ready", "true");
  await expect(alice.entry).toHaveAttribute("data-livekit-connected", "true");

  await enterRoom(alice);

  await expect(alice.page.getByRole("button", { name: "Mute microphone" })).toBeVisible();
  await expect(alice.page.getByText("Reconnecting to the room")).toBeHidden();
});

test("an explicit mute survives taking the stage", async ({ browser, request }) => {
  const probe = await request.get(`/api/livekit-token?room=${uniqueRoomCode()}&name=probe`);
  test.skip(!probe.ok(), "LiveKit credentials are not configured for this environment");

  const roomCode = uniqueRoomCode();
  const bob = await join(browser, roomCode, "Bob");

  // exact: "Mute microphone" is a substring of "Unmute microphone"
  const muteButton = bob.page.getByRole("button", { name: "Mute microphone", exact: true });
  const unmuteButton = bob.page.getByRole("button", { name: "Unmute microphone", exact: true });

  await expect(muteButton).toBeVisible();
  await muteButton.click();
  await expect(unmuteButton).toBeVisible();

  const queue = await openQueuePanel(bob);
  await queue.getByRole("button", { name: "Add to Queue" }).click();
  await expect(queue.getByText("You're singing!")).toBeVisible();
  await expect(bob.stage.getByRole("heading", { name: "Your turn to sing" })).toBeVisible();

  await expect(unmuteButton).toBeVisible();
});
