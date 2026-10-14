"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
const LazyIrisChat = dynamic(
  () => import("./iris-chat-controller").then((m) => m.IrisChat),
  { ssr: false, loading: () => <p role="status">Loading iris chat…</p> },
);
export function IrisChat(props: ComponentProps<typeof LazyIrisChat>) {
  return <LazyIrisChat {...props} />;
}
export { streamTurn } from "./iris-stream";
