import type { Metadata } from "next";

export const SITE_URL = "https://www.karaokenow.co";

export const SITE_NAME = "Karaoke Now";

export const SITE_DESCRIPTION =
  "Free online karaoke rooms in your browser. Share a code, sing together with friends over synced YouTube playback and live voice. No signup, no download.";

export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Karaoke Now - free online karaoke rooms, sing together with friends",
} as const;

interface SocialMetadataOptions {
  title: string;
  description: string;
  /** Omit on routes that must not advertise their own URL, such as private rooms. */
  path?: string;
}

// Next.js replaces `openGraph`/`twitter` wholesale rather than merging them into the
// layout's, so every route has to restate the card in full or it ships without an image.
export function socialMetadata({
  title,
  description,
  path,
}: SocialMetadataOptions): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      title,
      description,
      images: [OG_IMAGE],
      ...(path ? { url: path } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
