"use client";

import {Shell} from '@/components/shell';
import {EquipmentPanel} from '@/components/equipment-panel';

export const dynamic = 'force-dynamic';

export default function EquipmentPage() {
  return (
    <Shell
      title="Equipment register"
      eyebrow="FLEET HEALTH"
      banner={<p className="muted" style={{fontSize: 12}}>Every fault ever logged, against the item it happened to — bikes, weights, laptops, the air conditioning, the coffee maker. Anything taken out of rotation on the floor appears here within 30 seconds.</p>}
    >
      <EquipmentPanel />
    </Shell>
  );
}
