/** Small inline-SVG flags (no network, no emoji — Windows can't render flag
 *  emoji). Drawn on a 30x20 canvas and centre-cropped into a square. */
function FlagArt({ code }: { code: string }) {
  switch (code) {
    case 'US':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} y={(i * 2 * 20) / 13} width="30" height={20 / 13} fill="#c8102e" />
          ))}
          <rect width="13" height={(7 * 20) / 13} fill="#1c3f94" />
        </>
      );
    case 'JP':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <circle cx="15" cy="10" r="6" fill="#bc002d" />
        </>
      );
    case 'HK':
      return (
        <>
          <rect width="30" height="20" fill="#de2910" />
          <circle cx="15" cy="10" r="4.2" fill="#fff" />
          <circle cx="15" cy="10" r="1.3" fill="#de2910" />
        </>
      );
    case 'DE':
      return (
        <>
          <rect width="30" height="20" fill="#ffce00" />
          <rect width="30" height="6.67" fill="#000" />
          <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
        </>
      );
    case 'FR':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect width="10" height="20" fill="#0055a4" />
          <rect x="20" width="10" height="20" fill="#ef4135" />
        </>
      );
    case 'KR':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <path d="M11 10a4 4 0 0 1 8 0z" fill="#cd2e3a" />
          <path d="M11 10a4 4 0 0 0 8 0z" fill="#0047a0" />
          <path d="M4 4l3 2M5 3l3 2M26 16l-3-2M25 17l-3-2M26 4l-3 2M25 3l-3 2M4 16l3-2M5 17l3-2" stroke="#000" strokeWidth="0.9" />
        </>
      );
    case 'GB':
      return (
        <>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
          <path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" strokeWidth="1.6" />
          <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
          <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.4" />
        </>
      );
    default:
      return <rect width="30" height="20" fill="#cbd5e1" />;
  }
}

export default function CountryFlag({ code, className }: { code: string; className?: string }) {
  return (
    <span className={`inline-block overflow-hidden rounded-lg border border-line shrink-0 ${className ?? 'h-9 w-9'}`}>
      <svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice" className="h-full w-full block" aria-hidden="true">
        <FlagArt code={code} />
      </svg>
    </span>
  );
}
