import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karaoke Now",
    short_name: "Karaoke",
    description: "Sing together online with synced YouTube playback",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#12121a",
    theme_color: "#12121a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
