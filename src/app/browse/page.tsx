import type { Metadata } from "next";
import { BrowseClient } from "~/components/browse/BrowseClient";
import { SITE_NAME, socialMetadata } from "~/lib/seo";

const TITLE = "Public Karaoke Rooms - See Who Is Singing";
const DESCRIPTION =
  "See which karaoke rooms are open to anyone right now and jump into one. Free, in your browser, no signup and no download.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: "/browse" },
  ...socialMetadata({ title: TITLE, description: DESCRIPTION, path: "/browse" }),
};

export default function BrowsePage() {
  return <BrowseClient />;
}
