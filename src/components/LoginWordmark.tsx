import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Giant edge-to-edge "Aurafin." wordmark for the bottom of the login page.
 *
 *  The text is measured and scaled so it always spans exactly the width of the page (phone to
 *  ultra-wide) instead of using a fixed font size that is either too small or overflows. It is
 *  decorative (the real heading text lives elsewhere on the page), so it is hidden from screen readers. */
const REF_SIZE = 100; // px: measure at this size, then scale linearly to the container width

export default function LoginWordmark() {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const fit = () => {
      const available = box.clientWidth;
      // Measure at the reference size (the span is always rendered at REF_SIZE while measuring).
      const prev = text.style.fontSize;
      text.style.fontSize = `${REF_SIZE}px`;
      const w = text.getBoundingClientRect().width;
      text.style.fontSize = prev;
      if (available > 0 && w > 0) setFontSize((available / w) * REF_SIZE);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    // Re-fit once the web font has loaded (the fallback font has different widths).
    void document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, []);

  // Fade/slide in the first time it scrolls into view.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(box);
    return () => io.disconnect();
  }, []);

  return (
    <section className="lp-wordmark" aria-hidden="true">
      <div ref={boxRef} className="lp-wordmark-box">
        <span
          ref={textRef}
          className={`lp-wordmark-text ${shown ? 'is-shown' : ''}`}
          style={{ fontSize: fontSize ? `${fontSize}px` : `${REF_SIZE}px`, visibility: fontSize ? 'visible' : 'hidden' }}
        >
          Aurafin<span className="lp-wordmark-dot">.</span>
        </span>
      </div>
    </section>
  );
}
