import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

/** Loaded for `font-mono` only (e.g. `.chat-prose code`); body stays `font-sans`. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TrustMeBro — Prediction Market Inefficiency Dashboard",
  description:
    "Real-time inefficiency analytics across Polymarket and Kalshi. Resolution bias, cross-venue divergence, liquidity gaps, late-breaking mismatches.",
};

// Mobile-friendly defaults: render at device width and allow the user to
// pinch-zoom (don't lock maximum-scale = 1, which is bad for accessibility).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
  ],
};

// Runs synchronously before the body paints so the saved theme is applied
// and we don't flash the wrong palette on first load.
const themeBootstrapScript = `
(function () {
  try {
    var stored = localStorage.getItem('tmb-theme');
    var prefersLight =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = stored || (prefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="bg-bg font-sans text-fg">{children}</body>
    </html>
  );
}
