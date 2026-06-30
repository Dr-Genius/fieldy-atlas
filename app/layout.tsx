import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Atlas — Chief of Staff · Lester", description: "AI Chief of Staff dashboard" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
