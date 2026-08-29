import type { Metadata } from "next";
import { HomeClient } from "~/components/home/HomeClient";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, socialMetadata } from "~/lib/seo";

const TITLE = "Karaoke Now | Free Online Karaoke Rooms";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  ...socialMetadata({ title: TITLE, description: SITE_DESCRIPTION, path: "/" }),
};

const webApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "MultimediaApplication",
  applicationSubCategory: "Karaoke",
  operatingSystem: "Any modern web browser",
  browserRequirements: "Requires JavaScript, a microphone and a modern browser",
  isAccessibleForFree: true,
  inLanguage: "en",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  featureList: [
    "Private karaoke rooms joined with a six-character code",
    "Synced YouTube playback across every participant",
    "Live voice chat with hall, echo, warmth and chorus effects",
    "Shared singing queue and room chat",
    "No signup, no download, free to use",
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, author-controlled JSON: nothing here is user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema) }}
      />
      <HomeClient />
    </>
  );
}
