import {Shell} from '@/components/shell';import {IrisChat} from '@/components/iris-chat';
export const dynamic='force-dynamic';
export default async function IrisPage({searchParams}:{searchParams:Promise<{category?:string;subcategory?:string}>}){const p=await searchParams;return <Shell title="A conversation is all it takes." eyebrow="MEET YOUR MEMBER CARE ASSISTANT"><IrisChat presetCategory={p.category} presetSubcategory={p.subcategory}/></Shell>;}
