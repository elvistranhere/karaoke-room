import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { Baloo_2, Be_Vietnam_Pro } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";
import { TooltipProvider } from "~/components/ui/tooltip";
import { ServiceWorkerRegistrar } from "~/components/ServiceWorkerRegistrar";

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
  title: "Karaoke Now - Sing Together Online",
  description:
    "Real-time online karaoke rooms. Join with a code, put a YouTube video on stage, and sing with friends.",
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Karaoke",
  },
};

export const viewport: Viewport = {
  themeColor: "#12121a",
  viewportFit: "cover",
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
      </body>
    </html>
  );
}
