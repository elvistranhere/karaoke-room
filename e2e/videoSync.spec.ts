import { expect, test, type Browser } from "@playwright/test";
import { SEEK_THRESHOLD_S } from "../src/lib/syncMath";
import {
  joinRoom,
  openQueuePanel,
  playerDrift,
  playerState,
  playerTime,
  playerVideoId,
  uniqueRoomCode,
  type RoomClient,
} from "./fixtures/room";
import { STUB_DURATION_S, stubVideoTitle } from "./fixtures/youtubeStub";

const VIDEO_ID = "dQw4w9WgXcQ";
const DURATION_LABEL = `${Math.floor(STUB_DURATION_S / 60)}:${String(STUB_DURATION_S % 60).padStart(2, "0")}`;
const PLAYING = 1;
const PAUSED = 2;
const MID_SONG_S = 3;
const CONVERGE_TIMEOUT_MS = 30_000;

const clients: RoomClient[] = [];

async function join(browser: Browser, roomCode: string, name: string): Promise<RoomClient> {
  const client = await joinRoom(browser, roomCode, name);
  clients.push(client);
  return client;
}

test.afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.context.close()));
});

test("a mid-song joiner converges on the singer's video state", async ({ browser }) => {
  const roomCode = uniqueRoomCode();
  const alice = await join(browser, roomCode, "Alice");
  const bob = await join(browser, roomCode, "Bob");
  await expect(alice.people.getByText("Bob", { exact: true })).toBeVisible();

  const queue = await openQueuePanel(alice);
  await queue.getByRole("button", { name: "Add to Queue" }).click();
  await expect(alice.stage.getByRole("heading", { name: "Your turn to sing" })).toBeVisible();

  await alice.stage.getByLabel("Search YouTube or paste a link").fill(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
  await alice.stage.getByRole("button", { name: "Put on stage" }).click();

  await expect.poll(() => playerVideoId(alice.page)).toBe(VIDEO_ID);
  await expect.poll(() => playerVideoId(bob.page)).toBe(VIDEO_ID);
  await expect(bob.stage.getByTestId("stage-song-title")).toHaveText(stubVideoTitle(VIDEO_ID));

  await alice.stage.getByRole("button", { name: "Play for everyone" }).click();

  await expect.poll(() => playerState(alice.page)).toBe(PLAYING);
  await expect.poll(() => playerState(bob.page)).toBe(PLAYING);
  await expect
    .poll(() => playerDrift([bob.page, alice.page]), { timeout: CONVERGE_TIMEOUT_MS })
    .toBeLessThan(SEEK_THRESHOLD_S);

  await expect.poll(() => playerTime(alice.page), { timeout: CONVERGE_TIMEOUT_MS }).toBeGreaterThan(MID_SONG_S);

  const carol = await join(browser, roomCode, "Carol");

  await expect(carol.stage.getByRole("heading", { name: "Alice is singing" })).toBeVisible();
  await expect(carol.stage.getByTestId("stage-song-title")).toHaveText(stubVideoTitle(VIDEO_ID));
  await expect(carol.stage.getByText(DURATION_LABEL)).toBeVisible();
  await expect.poll(() => playerVideoId(carol.page)).toBe(VIDEO_ID);
  await expect.poll(() => playerState(carol.page)).toBe(PLAYING);
  await expect.poll(() => playerTime(carol.page)).toBeGreaterThan(MID_SONG_S);
  await expect
    .poll(() => playerDrift([carol.page, alice.page]), { timeout: CONVERGE_TIMEOUT_MS })
    .toBeLessThan(SEEK_THRESHOLD_S);

  await alice.stage.getByRole("button", { name: "Pause for everyone" }).click();

  await expect.poll(() => playerState(bob.page)).toBe(PAUSED);
  await expect.poll(() => playerState(carol.page)).toBe(PAUSED);
});
