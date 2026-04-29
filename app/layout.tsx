import type { Metadata } from "next";
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

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TrustMeBro — Prediction Market Inefficiency Dashboard",
  description:
    "Real-time inefficiency analytics across Polymarket and Kalshi. Resolution bias, cross-venue divergence, liquidity gaps, late-breaking mismatches.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSans.variable} ${mono.variable}`}
    >
      <body className="bg-bg font-sans text-fg">{children}</body>
    </html>
  );
}
