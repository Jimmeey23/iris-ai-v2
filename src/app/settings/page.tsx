"use client";
import dynamic from "next/dynamic";
const LazySettingsPage = dynamic(
  () => import("./settings-controller").then((m) => m.default),
  { ssr: false, loading: () => <p role="status">Loading settings…</p> },
);
export default function SettingsPage() {
  return <LazySettingsPage />;
}
