import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import Modal from '../Modal';
import { FREE_ASSET_LIMIT } from '../../config/proFeatures';

/**
 * Shown in place of the normal "Add Asset" flow once a free-plan account
 * has FREE_ASSET_LIMIT assets already. Points to Settings > Billing, where
 * the full Aurafin Pro showcase now lives (see Settings.tsx).
 */
export default function AssetLimitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  return (
    <Modal open={open} onClose={onClose} title="Free plan limit reached">
      <div className="text-center px-1 pb-1">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600 flex items-center justify-center mx-auto mb-4 shadow-[0_6px_20px_rgba(44,110,73,0.4)]">
          <Crown size={22} className="text-brand-900" strokeWidth={2.25} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          The free plan tracks up to <span className="font-semibold">{FREE_ASSET_LIMIT} assets</span>.
          Upgrade to <span className="font-luxury">Aurafin</span> Pro for unlimited assets, plus everything else Pro unlocks.
        </p>
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/settings?tab=billing');
          }}
          className="mt-5 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-500 via-brand-600 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-semibold px-5 py-2.5 rounded-2xl text-sm shadow-[0_6px_20px_rgba(44,110,73,0.4)] transition-all duration-200 active:scale-[0.98]"
        >
          <Crown size={16} /> Upgrade to Pro
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full text-xs font-medium text-slate-600 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-2"
        >
          Maybe later
        </button>
      </div>
    </Modal>
  );
}
