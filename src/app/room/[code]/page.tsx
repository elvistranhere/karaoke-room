import type { Metadata } from "next";
import { RoomEntry } from "~/components/room/RoomEntry";
import { SITE_NAME, socialMetadata } from "~/lib/seo";

const TITLE = "Join a karaoke room";
const DESCRIPTION =
  "Someone invited you to sing. Open the room, queue a song, and take the mic. Free, in your browser, no signup.";

// Room codes are invite secrets, so this route stays out of every index. The Open Graph
// tags remain because share-link scrapers ignore robots directives and read them.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  ...socialMetadata({ title: `${TITLE} on ${SITE_NAME}`, description: DESCRIPTION }),
};

export default function RoomPage() {
  return <RoomEntry />;
}
