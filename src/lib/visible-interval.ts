/**
 * Runs `fn` now, then every `ms` while the tab is visible, and catches up the moment it is
 * shown again. Returns the cleanup for a `useEffect`.
 *
 * A tab left open in the background all night is the commonest caller on the Hobby plan's
 * CPU budget: every tick is a serverless invocation that nobody is looking at.
 */
export function onVisibleInterval(fn: () => void, ms: number): () => void {
  let timer: number | undefined;
  const start = () => {
    if (timer === undefined) timer = window.setInterval(fn, ms);
  };
  const stop = () => {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else {
      fn();
      start();
    }
  };
  fn();
  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
