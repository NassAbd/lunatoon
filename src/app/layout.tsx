import type { Metadata } from "next";
import "./globals.css";
import "./platform.css";

export const metadata: Metadata = {
  title: "Lunatoon — A different story",
  description: "Discover interactive webtoons. Make a choice, add your imagination, and follow the story you helped create.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
