import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { Baloo_2, Be_Vietnam_Pro } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";
import { TooltipProvider } from "~/components/ui/tooltip";
import { ServiceWorkerRegistrar } from "~/components/ServiceWorkerRegistrar";
import { Analytics } from "~/components/Analytics";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, socialMetadata } from "~/lib/seo";

const DEFAULT_TITLE = "Online Karaoke Rooms - Sing Together with Friends, Free";

const display = Baloo_2({
  subsets: ["latin", "vietnamese"],
  variable: "--font-display",
  display: "swap",
});

const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "online karaoke",
    "karaoke with friends",
    "karaoke room",
    "sing together online",
    "youtube karaoke",
    "free karaoke",
    "virtual karaoke party",
    "karaoke no signup",
  ],
  category: "entertainment",
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Karaoke",
  },
  // No `path`: an inherited og:url would make every route without its own
  // openGraph block claim to be the homepage.
  ...socialMetadata({ title: DEFAULT_TITLE, description: SITE_DESCRIPTION }),
};

export const viewport: Viewport = {
  themeColor: "#12121a",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // maximumScale 1 stops iOS Safari's input-focus auto-zoom; pinch zoom still
  // works through the accessibility override, so this is app-feel, not a trap.
  maximumScale: 1,
  userScalable: false,
  // The room is h-dvh with no scrollable ancestor, so the layout viewport has to
  // shrink for the software keyboard or the chat input ends up behind it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="antialiased">
        <TRPCReactProvider>
          <TooltipProvider delay={250}>{children}</TooltipProvider>
        </TRPCReactProvider>
        <ServiceWorkerRegistrar />
        <Analytics />
      </body>
    </html>
  );
}
