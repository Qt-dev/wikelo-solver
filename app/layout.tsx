import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wikelo Solver — Mission Planner",
  description: "Plan Wikelo missions with extracted recipe data, UEX component pricing, reputation requirements, and your saved inventory.",
  openGraph: {
    title: "Wikelo Solver — Mission Planner",
    description: "Choose a commission, allocate owned and farmable resources, and see exactly what remains to source.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Wikelo Solver recipe planner" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wikelo Solver — Mission Planner",
    description: "Choose a commission. Finish the recipe.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
