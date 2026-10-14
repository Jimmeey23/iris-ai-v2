"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
const LazyTicketComposer = dynamic(
  () => import("./ticket-composer-controller").then((m) => m.TicketComposer),
  { ssr: false, loading: () => <p role="status">Loading ticket composer…</p> },
);
export function TicketComposer(
  props: ComponentProps<typeof LazyTicketComposer>,
) {
  return props.open ? <LazyTicketComposer {...props} /> : null;
}
