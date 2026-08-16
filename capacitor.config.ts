import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.karaokenow.app",
  appName: "Karaoke Now",
  webDir: "public",
  server: {
    url: "https://karaoke-room.vercel.app",
  },
};

export default config;
