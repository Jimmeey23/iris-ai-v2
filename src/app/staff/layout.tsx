import type { Metadata } from "next";

export const metadata: Metadata = { title: "People & teams" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
