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
      eyebrow="FLEET HEALTH"
      banner={<><IrisMarquee page="equipment" /><p className="muted" style={{fontSize: 12, marginTop: 10}}>Every snag ever logged, against the item it happened to — bikes, weights, laptops, the air conditioning, the coffee maker. Anything taken out of rotation on the floor appears here within 30 seconds.</p></>}
    >
      <EquipmentPanel initialStudio={studio} initialAssetId={assetId} />
    </Shell>
  );
}
