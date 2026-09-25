import { IrisIntakePage } from '@/components/intake/iris-intake-page';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Raise a ticket. The form-based generator (category → sub-category → taxonomy-driven
 * questions → review → filed) is the default; the earlier chat intake sits behind a
 * clearly labelled legacy switch inside IrisIntakePage.
 *
 *   /iris?category=&subcategory=   opens that sub-category's form straight away
 *   /iris?desk=class               opens the class desk (start from a Momence session)
 *   /iris?mode=chat                opens the legacy chat for this visit only, admins only —
 *     a non-admin passing this query param still gets the form.
 */
export default async function IrisPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; subcategory?: string; mode?: string; desk?: string }>;
}) {
  const [p, user] = await Promise.all([searchParams, currentUser()]);
  const isAdmin = user?.role === 'admin';
  return (
    <IrisIntakePage
      presetCategory={p.category}
      presetSubcategory={p.subcategory}
      presetMode={isAdmin && p.mode === 'chat' ? 'chat' : p.mode === 'form' ? 'form' : undefined}
      presetDesk={p.desk === 'class'}
    />
  );
}
