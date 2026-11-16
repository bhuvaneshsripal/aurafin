import { useState } from 'react';
import { Star } from 'lucide-react';

/** Clickable 1-5 star picker (keyboard friendly: each star is a button). */
export default function StarRating({ value, onChange, size = 28 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star size={size} className={n <= shown ? 'fill-amber-400 text-amber-400' : 'text-faint'} />
        </button>
      ))}
    </div>
  );
}
