import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunatoon — Neon Protocol",
  description: "One choice. Two panels. An experiment in AI-generated interactive storytelling.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
