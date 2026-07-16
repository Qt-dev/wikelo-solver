import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wikelo Solver — Reward Planner",
  description: "Plan Wikelo rewards with extracted recipe data, UEX pricing, reputation thresholds, and your saved inventory.",
  openGraph: {
    title: "Wikelo Solver — Reward Planner",
    description: "Pick a reward, separate owned materials from what you need to farm, and see exactly what remains to source.",
  },
  twitter: {
    card: "summary",
    title: "Wikelo Solver — Reward Planner",
    description: "Pick a reward. Plan every material.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
