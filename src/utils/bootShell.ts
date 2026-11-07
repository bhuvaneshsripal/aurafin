/** Removes the instant HTML shell from index.html once the real app is on screen. */
export function hideBootShell() {
  const root = document.documentElement;
  if (!root.classList.contains('boot-on')) return;
  // Wait for the next paint so the real page is visible underneath, then fade the shell out.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.classList.add('boot-out');
      window.setTimeout(() => root.classList.remove('boot-on', 'boot-out'), 240);
    })
  );
}
