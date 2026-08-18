import type { MetadataRoute } from "next";
import { SITE_URL } from "~/lib/seo";

// Bump a date only when that page's own content changes: a build-time `new Date()`
// makes lastmod always-now, which Google discards site-wide once it stops matching.
const HOME_UPDATED = new Date("2026-08-18");
const BROWSE_UPDATED = new Date("2026-08-18");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: HOME_UPDATED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/browse`,
      lastModified: BROWSE_UPDATED,
      changeFrequency: "hourly",
      priority: 0.7,
    },
  ];
}
