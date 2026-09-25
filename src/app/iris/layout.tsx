import type { Metadata } from "next";

export const metadata: Metadata = { title: "Raise a ticket" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
