import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trend dashboard" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
