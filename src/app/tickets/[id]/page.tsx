"use client";
import {useParams,useRouter} from 'next/navigation';
import {Shell} from '@/components/shell';import {TicketDialog} from '@/components/ticket-detail';
export default function TicketPage(){const{id}=useParams<{id:string}>();const router=useRouter();return <Shell title="Ticket workspace" eyebrow="MEMBER CARE"><TicketDialog open id={Number(id)} onClose={()=>router.push('/tickets')}/></Shell>;}
