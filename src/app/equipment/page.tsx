"use client";

import {useSearchParams} from 'next/navigation';
import {Shell} from '@/components/shell';
import {EquipmentPanel} from '@/components/equipment-panel';

export const dynamic = 'force-dynamic';

export default function EquipmentPage() {
  const params = useSearchParams();
  const studio = params.get('studio') || undefined;
  const assetId = Number(params.get('asset')) || undefined;
  return (
    <Shell
      title="Equipment register"
      eyebrow="FLEET HEALTH"
    >
      <EquipmentPanel initialStudio={studio} initialAssetId={assetId} />
    </Shell>
  );
}
