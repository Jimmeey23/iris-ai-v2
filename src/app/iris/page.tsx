import { Shell } from '@/components/shell';
import { IrisChat } from '@/components/iris-chat';
import { IrisMarquee } from '@/components/iris-marquee';

export const dynamic = 'force-dynamic';

export default async function IrisPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; subcategory?: string }>;
}) {
  const p = await searchParams;
  return (
    <Shell hideHeading hideFooter fullHeight banner={<IrisMarquee />}>
      <IrisChat presetCategory={p.category} presetSubcategory={p.subcategory} />
    </Shell>
  );
}
