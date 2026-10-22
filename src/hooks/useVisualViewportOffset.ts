import { useEffect } from 'react';

/** Publishes how far the visual viewport has been panned (e.g. by the mobile
 *  keyboard) as --vv-top, so the top bar can stay pinned to what's visible. */
export function useVisualViewportOffset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
      if (vv.offsetTop > 0) root.setAttribute('data-vv-pan', '');
      else root.removeAttribute('data-vv-pan');
    };
    // Never let the page drift sideways when an input is focused / the
    // keyboard opens: snap back to the left edge as soon as it happens.
    const lockX = () => {
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
      if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
      if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
    };
    const onScroll = () => {
      update();
      lockX();
    };
    update();
    vv.addEventListener('resize', onScroll);
    vv.addEventListener('scroll', onScroll);
    window.addEventListener('scroll', lockX, { passive: true });
    document.addEventListener('focusin', lockX);
    return () => {
      window.removeEventListener('scroll', lockX);
      document.removeEventListener('focusin', lockX);
      vv.removeEventListener('resize', onScroll);
      vv.removeEventListener('scroll', onScroll);
      root.style.removeProperty('--vv-top');
      root.removeAttribute('data-vv-pan');
    };
  }, []);
}
