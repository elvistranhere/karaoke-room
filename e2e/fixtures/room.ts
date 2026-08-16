import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { YOUTUBE_IFRAME_API_STUB } from "./youtubeStub";

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export interface RoomClient {
  name: string;
  context: BrowserContext;
  page: Page;
  entry: Locator;
  people: Locator;
  chat: Locator;
  stage: Locator;
}

export function uniqueRoomCode(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index++) {
    code += CODE_CHARSET.charAt(Math.floor(Math.random() * CODE_CHARSET.length));
  }
  return code;
}

// Everything the room reaches for outside localhost, answered locally. The empty
// thumbnail and genre answers are the ones both call sites already fall back to.
export async function stubExternalServices(context: BrowserContext): Promise<void> {
  await context.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: YOUTUBE_IFRAME_API_STUB }),
  );
  await context.route("**/*.ytimg.com/**", (route) => route.abort());
  await context.route("**/api/youtube-search**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
}

export async function openRoom(browser: Browser, roomCode: string, name: string): Promise<RoomClient> {
  const context = await browser.newContext({ permissions: ["microphone"] });
  await stubExternalServices(context);
  const page = await context.newPage();

  await page.goto(`/room/${roomCode}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  const client: RoomClient = {
    name,
    context,
    page,
    entry: page.getByTestId("room-entry"),
    people: page.locator("#panel-body-people"),
    chat: page.locator("#panel-body-chat"),
    stage: page.getByTestId("room-stage"),
  };
  await expect(client.entry).toBeVisible();
  return client;
}

export async function enterRoom(client: RoomClient): Promise<void> {
  await expect(client.entry).toHaveAttribute("data-party-connected", "true");
  await client.page.getByRole("button", { name: "Join the party" }).click();
  await expect(client.entry).toBeHidden();
}

export async function joinRoom(browser: Browser, roomCode: string, name: string): Promise<RoomClient> {
  const client = await openRoom(browser, roomCode, name);
  await enterRoom(client);
  return client;
}

export function queuePanel(client: RoomClient): Locator {
  return client.page.locator("#panel-body-queue");
}

export async function openQueuePanel(client: RoomClient): Promise<Locator> {
  await client.page.locator("#panel-tab-queue").click();
  const panel = queuePanel(client);
  await expect(panel).toBeVisible();
  return panel;
}

interface YouTubeStubHandle {
  duration: number;
  count: () => number;
  state: () => number | null;
  time: () => number | null;
  rate: () => number | null;
  videoId: () => string | null;
}

type StubWindow = Window & { __ytStub?: YouTubeStubHandle };

export function playerTime(page: Page): Promise<number | null> {
  return page.evaluate(() => (window as StubWindow).__ytStub?.time() ?? null);
}

export function playerState(page: Page): Promise<number | null> {
  return page.evaluate(() => (window as StubWindow).__ytStub?.state() ?? null);
}

export function playerVideoId(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as StubWindow).__ytStub?.videoId() ?? null);
}

export async function playerDrift(pages: [Page, Page]): Promise<number> {
  const [first, second] = await Promise.all([playerTime(pages[0]), playerTime(pages[1])]);
  if (first === null || second === null) return Number.POSITIVE_INFINITY;
  return Math.abs(first - second);
}
