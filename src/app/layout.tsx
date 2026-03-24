import "~/styles/globals.css";

import { type Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KaraOK — Sing Together Online",
  description:
    "Real-time online karaoke rooms. Join with a code, share your audio, and sing with friends.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
