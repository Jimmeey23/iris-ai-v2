import type {Metadata} from "next";
import {CommandCenter} from "@/components/command-center";
export const metadata: Metadata = {title: "Assigned to me"};
export default function AssignedPage() {return <CommandCenter directory assignedOnly/>;}
