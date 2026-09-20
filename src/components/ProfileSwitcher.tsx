import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronsUpDown, Layers, Settings } from 'lucide-react';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';

/**
 * Household profile selector. `compact` is the small mobile-header trigger;
 * the default is the sidebar's bordered selector, which collapses to just the
 * coloured initial when the sidebar is an icon rail (`.sb-*` rules in index.css).
 */
export default function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const profiles = useHouseholdProfilesStore((s) => s.profiles);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const setActiveProfileId = useHouseholdProfilesStore((s) => s.setActiveProfileId);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const activeLabel = activeProfile ? activeProfile.name : 'All profiles';
  const activeColour = activeProfile ? activeProfile.colour : '#9a9a94';

  // Only worth showing once there's actually more than one profile to
  // switch between — otherwise it's just an inert label.
  if (profiles.length === 0) return null;

  const itemClass =
    'w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-hover';

  const menu = (
    <div
      className={`animate-menu-in absolute top-full mt-1.5 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-30 py-1 ${
        compact ? 'left-0 w-52' : 'left-0 min-w-full w-56'
      }`}
    >
      <button
        onClick={() => {
          setActiveProfileId(null);
          setOpen(false);
        }}
        className={itemClass}
      >
        <Layers size={15} className="text-muted shrink-0" />
        <span className="flex-1 text-left">All profiles</span>
        {activeProfileId === null && <Check size={15} className="text-primary-ink shrink-0" />}
      </button>

      <div className="my-1 border-t border-line-soft" />

      {profiles.map((p) => (
        <button
          key={p.id}
          onClick={() => {
            setActiveProfileId(p.id);
            setOpen(false);
          }}
          className={itemClass}
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.colour }} />
          <span className="flex-1 text-left truncate">{p.name}</span>
          {activeProfileId === p.id && <Check size={15} className="text-primary-ink shrink-0" />}
        </button>
      ))}

      <div className="my-1 border-t border-line-soft" />

      <button
        onClick={() => {
          setOpen(false);
          navigate('/settings', { state: { tab: 'profiles' } });
        }}
        className={itemClass}
      >
        <Settings size={15} className="text-muted shrink-0" />
        Manage profiles
      </button>
    </div>
  );

  if (compact) {
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Switch profile"
          aria-label="Switch profile"
          className="tap-scale flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-md max-w-[7rem] text-slate-600 dark:text-slate-300 hover:bg-surface-hover"
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: activeColour }} />
          <span className="truncate text-xs font-medium leading-none">{activeLabel}</span>
          <ChevronDown size={12} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && menu}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Profile: ${activeLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="sb-chip w-full h-10 flex items-center gap-2.5 px-2.5 rounded-lg border border-line bg-surface text-sm font-medium text-ink hover:bg-surface-hover transition-colors"
      >
        <span
          className="h-5 w-5 rounded-md shrink-0 flex items-center justify-center text-[11px] font-semibold text-white"
          style={{ backgroundColor: activeColour }}
        >
          {activeProfile ? activeProfile.name.charAt(0).toUpperCase() : <Layers size={12} />}
        </span>
        <span className="sb-label truncate flex-1 text-left">{activeLabel}</span>
        <ChevronsUpDown size={14} className="sb-label text-muted shrink-0" />
      </button>
      {open && menu}
    </div>
  );
}
