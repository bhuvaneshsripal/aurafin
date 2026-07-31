import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Layers, Settings } from 'lucide-react';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';

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
  const activeLabel = activeProfile ? activeProfile.name : 'All Profiles';
  const activeColour = activeProfile ? activeProfile.colour : '#94a3b8';

  // Only worth showing once there's actually more than one profile to
  // switch between — otherwise it's just an inert label.
  if (profiles.length === 0) return null;

  if (compact) {
    // Small, top-left mobile trigger: dot + short label + chevron, no
    // container padding beyond a tight pill so it sits comfortably next
    // to the logo in the mobile topbar.
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Switch profile"
          aria-label="Switch profile"
          className="tap-scale flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full max-w-[6.5rem] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: activeColour }} />
          <span className="truncate text-[11px] font-medium leading-none">{activeLabel}</span>
          <ChevronDown size={11} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="animate-menu-in absolute left-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-30">
            <button
              onClick={() => {
                setActiveProfileId(null);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Layers size={15} className="text-slate-400 shrink-0" />
              <span className="flex-1 text-left">All Profiles</span>
              {activeProfileId === null && <Check size={15} className="text-brand-600 shrink-0" />}
            </button>

            <div className="border-t border-slate-100 dark:border-slate-700" />

            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActiveProfileId(p.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.colour }} />
                <span className="flex-1 text-left truncate">{p.name}</span>
                {activeProfileId === p.id && <Check size={15} className="text-brand-600 shrink-0" />}
              </button>
            ))}

            <div className="border-t border-slate-100 dark:border-slate-700" />

            <button
              onClick={() => {
                setOpen(false);
                navigate('/settings', { state: { tab: 'profiles' } });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Settings size={15} className="text-slate-400 shrink-0" />
              Manage Profiles
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative mb-4 px-1.5" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="h-3 w-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: activeColour }} />
        <span className="truncate flex-1 text-left font-bold">{activeLabel}</span>
        <ChevronDown size={15} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="animate-menu-in absolute left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-30">
          <button
            onClick={() => {
              setActiveProfileId(null);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Layers size={15} className="text-slate-400 shrink-0" />
            <span className="flex-1 text-left font-bold">All Profiles</span>
            {activeProfileId === null && <Check size={15} className="text-brand-600 shrink-0" />}
          </button>

          <div className="border-t border-slate-100 dark:border-slate-700" />

          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setActiveProfileId(p.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span className="h-3 w-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: p.colour }} />
              <span className="flex-1 text-left truncate font-bold">{p.name}</span>
              {activeProfileId === p.id && <Check size={15} className="text-brand-600 shrink-0" />}
            </button>
          ))}

          <div className="border-t border-slate-100 dark:border-slate-700" />

          <button
            onClick={() => {
              setOpen(false);
              navigate('/settings', { state: { tab: 'profiles' } });
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Settings size={15} className="text-slate-400 shrink-0" />
            Manage Profiles
          </button>
        </div>
      )}
    </div>
  );
}
