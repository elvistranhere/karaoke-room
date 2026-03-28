import { NextRequest, NextResponse } from "next/server";

// Fetches playlist items from YouTube Data API v3.
// Requires YOUTUBE_API_KEY env var.

interface PlaylistItem {
  videoId: string;
  title: string;
}

interface YouTubePlaylistItemsResponse {
  nextPageToken?: string;
  items?: {
    snippet?: {
      title?: string;
      resourceId?: { videoId?: string };
    };
    status?: {
      privacyStatus?: string;
    };
  }[];
}

export async function GET(req: NextRequest) {
  const playlistId = req.nextUrl.searchParams.get("id");
  if (!playlistId || !/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Playlist support not configured" }, { status: 503 });
  }

  const maxItems = Math.min(
    Number(req.nextUrl.searchParams.get("max") ?? 20),
    50,
  );

  try {
    const items: PlaylistItem[] = [];
    let pageToken: string | undefined;

    // Paginate through playlist (50 items per page, stop at maxItems)
    while (items.length < maxItems) {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "snippet,status");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("maxResults", String(Math.min(50, maxItems - items.length)));
      url.searchParams.set("key", apiKey);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.text();
        console.error("[YouTube Playlist] API error:", res.status, body);
        if (res.status === 404) {
          return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 502 });
      }

      const data = (await res.json()) as YouTubePlaylistItemsResponse;
      for (const item of data.items ?? []) {
        const videoId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title;
        const privacy = item.status?.privacyStatus;
        // Skip private/deleted videos
        if (!videoId || !title || privacy === "private" || title === "Private video" || title === "Deleted video") continue;
        items.push({ videoId, title });
        if (items.length >= maxItems) break;
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[YouTube Playlist] Fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
  }
}
