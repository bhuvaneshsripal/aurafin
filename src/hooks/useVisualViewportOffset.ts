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
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--vv-top');
      root.removeAttribute('data-vv-pan');
    };
  }, []);
}
