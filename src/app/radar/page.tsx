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
      title="Live Studio Ops Heatmap & SLA Countdown Radar"
      eyebrow="EXECUTIVE COMMAND CENTER"
      fullHeight
      banner={<IrisMarquee />}
    >
      <StudioOpsRadar initialStudio={p.studio || 'kwality'} />
    </Shell>
  );
}
