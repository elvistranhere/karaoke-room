import { afterEach, describe, expect, it } from "vitest";
import { livekitTokenUrl, partyHost, partyOrigin, youtubeSearchUrl } from "./apiBase";

const original = process.env.NEXT_PUBLIC_PARTY_HOST;

function withHost(host: string | undefined): void {
  if (host === undefined) delete process.env.NEXT_PUBLIC_PARTY_HOST;
  else process.env.NEXT_PUBLIC_PARTY_HOST = host;
}

afterEach(() => withHost(original));

describe("partyOrigin", () => {
  it("uses http for a loopback host, in every spelling", () => {
    for (const host of ["localhost:1999", "localhost", "127.0.0.1:1999", "0.0.0.0:1999", "[::1]:1999"]) {
      withHost(host);
      expect(partyOrigin()).toBe(`http://${host}`);
    }
  });

  it("uses https for every deployed host", () => {
    withHost("karaoke-room.elvistranhere.partykit.dev");
    expect(partyOrigin()).toBe("https://karaoke-room.elvistranhere.partykit.dev");
    // The loopback names are anchored, so a hostname that merely starts with one is TLS.
    withHost("localhost.example.com");
    expect(partyOrigin()).toBe("https://localhost.example.com");
  });

  it("defaults to the local dev party", () => {
    withHost(undefined);
    expect(partyHost()).toBe("localhost:1999");
    expect(partyOrigin()).toBe("http://localhost:1999");
  });
});

describe("url builders", () => {
  it("addresses the token party by room code and repeats it in the query", () => {
    withHost("localhost:1999");
    const url = new URL(livekitTokenUrl({ room: "ABC234", name: "Ana", keyHint: "next" }));
    expect(url.pathname).toBe("/parties/token/ABC234");
    expect(url.searchParams.get("room")).toBe("ABC234");
    expect(url.searchParams.get("name")).toBe("Ana");
    expect(url.searchParams.get("keyHint")).toBe("next");
  });

  it("omits keyHint when it was not asked for", () => {
    withHost("localhost:1999");
    expect(livekitTokenUrl({ room: "ABC234", name: "Ana" })).not.toContain("keyHint");
  });

  it("sends search to the single global instance", () => {
    withHost("localhost:1999");
    expect(youtubeSearchUrl({ q: "a b" })).toBe("http://localhost:1999/parties/search/global?q=a+b");
    expect(youtubeSearchUrl({ id: "dQw4w9WgXcQ" })).toContain("?id=dQw4w9WgXcQ");
  });
});
