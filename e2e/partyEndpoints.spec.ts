import { expect, test } from "@playwright/test";
import { partyBaseUrl, probeLiveKitToken, uniqueRoomCode } from "./fixtures/room";

// The client fetches its LiveKit token from the worker, not from Next, so the suite
// proves the worker route exists on the dev server the rest of the specs run against.
test("the party token endpoint mints a LiveKit token", async ({ request }) => {
  const probe = await probeLiveKitToken(request);
  test.skip(probe.credentialsMissing, "LiveKit credentials are not configured for this environment");

  // Anything other than the credential case is a real failure: a 403 means the allowlist
  // is misconfigured and a 429 means the rate limiter is keyed wrong.
  expect(probe.status, probe.body.error ?? "").toBe(200);
  expect(probe.acao).toBe("http://localhost");
  expect(typeof probe.body.token).toBe("string");
  expect(probe.body.token?.split(".")).toHaveLength(3);
  expect(probe.body.keySet).toBeGreaterThanOrEqual(1);
});

// The party id is the rate-limit and presence scope, so a request that names a different
// room must not be served from this shard.
test("the token endpoint refuses a room code that is not its own shard", async ({ request }) => {
  const response = await request.get(
    `${partyBaseUrl()}/parties/token/${uniqueRoomCode()}?room=${uniqueRoomCode()}&name=probe`,
  );
  expect(response.status()).toBe(400);
});
