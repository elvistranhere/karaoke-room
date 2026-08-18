import type { MetadataRoute } from "next";
import { SITE_URL } from "~/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/browse"],
        // /room/ and /offline are left crawlable on purpose: both render
        // `noindex`, and a robots.txt block would stop the crawler from ever
        // reading it while still allowing a URL-only index entry.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
