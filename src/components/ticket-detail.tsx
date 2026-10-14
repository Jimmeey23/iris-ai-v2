"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
const LazyTicketDialog = dynamic(
  () => import("./ticket-detail-controller").then((m) => m.TicketDialog),
  { ssr: false, loading: () => <p role="status">Loading ticket detail…</p> },
);
export function TicketDialog(props: ComponentProps<typeof LazyTicketDialog>) {
  return props.open ? <LazyTicketDialog {...props} /> : null;
}
