import {Loading} from '@/components/ui';

/** Route-level fallback while a segment streams in. Reuses the workspace skeleton
 *  (same classes as every in-page loading state) so the transition is seamless. */
export default function RouteLoading(){
  return <main style={{padding:'32px clamp(16px,4vw,40px)'}}><Loading rows={3}/></main>;
}
