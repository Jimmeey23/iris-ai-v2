"use client";

import {useSearchParams} from 'next/navigation';
import {Shell} from '@/components/shell';
import {EquipmentPanel} from '@/components/equipment-panel';
import { IrisMarquee } from '@/components/iris-marquee';

export const dynamic = 'force-dynamic';

export default function EquipmentPage() {
  const params = useSearchParams();
  const studio = params.get('studio') || undefined;
  const assetId = Number(params.get('asset')) || undefined;
  return (
    <Shell
      title="Equipment register"
      eyebrow="Operations"
      banner={<><IrisMarquee page="equipment" /><p className="banner-note">Every snag ever logged, against the item it happened to. Anything taken out of rotation appears here within 30 seconds.</p></>}
    >
      <EquipmentPanel initialStudio={studio} initialAssetId={assetId} />
    </Shell>
  );
}
