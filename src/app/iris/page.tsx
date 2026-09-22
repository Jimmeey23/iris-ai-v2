import { IrisIntakePage } from '@/components/intake/iris-intake-page';

export const dynamic = 'force-dynamic';

/**
 * Raise a ticket. The form-based generator (category → sub-category → taxonomy-driven
 * questions → review → filed) is the default; the earlier chat intake sits behind a
 * clearly labelled legacy switch inside IrisIntakePage.
 *
 *   /iris?category=&subcategory=   opens that sub-category's form straight away
 *   /iris?desk=class               opens the class desk (start from a Momence session)
 *   /iris?mode=chat                opens the legacy chat for this visit only
 */
export default async function IrisPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; subcategory?: string; mode?: string; desk?: string }>;
}) {
  const p = await searchParams;
  return (
    <IrisIntakePage
      presetCategory={p.category}
      presetSubcategory={p.subcategory}
      presetMode={p.mode === 'chat' ? 'chat' : p.mode === 'form' ? 'form' : undefined}
      presetDesk={p.desk === 'class'}
    />
  );
}
