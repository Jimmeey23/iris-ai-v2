import { Shell } from '@/components/shell';
import { StudioOpsRadar } from '@/components/studio-ops-radar';
import { IrisMarquee } from '@/components/iris-marquee';

export const dynamic = 'force-dynamic';

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ studio?: string }>;
}) {
  const p = await searchParams;
  return (
    <Shell
      title="Studio ops radar"
      eyebrow="OPERATIONS"
      banner={<IrisMarquee page="radar" />}
    >
      <StudioOpsRadar initialStudio={p.studio || 'kwality'} />
    </Shell>
  );
}
