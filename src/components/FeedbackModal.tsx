import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import Modal from './Modal';
import { Button } from './ui';
import FeedbackPanel from './FeedbackPanel';
import { isFeedbackConfigured } from '../utils/feedback';

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Until Firebase/EmailJS is configured, show "Coming soon".
  const comingSoon = !isFeedbackConfigured();

  // Portaled to <body>: the sidebar is a sticky element with its own stacking
  // context, so rendering the modal inside it let the page content draw over
  // the dialog and left the top bar un-dimmed.
  return createPortal(
    <Modal open={open} onClose={onClose} title="Share Feedback" widthClassName="max-w-lg">
      {comingSoon ? (
        <div className="flex flex-col items-center text-center py-4">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            <MessageSquare size={22} />
          </span>
          <p className="text-[15px] font-semibold text-ink">Coming soon</p>
          <p className="mt-1 text-sm text-muted">Feedback will be available shortly.</p>
          <Button className="mt-5" variant="secondary" onClick={onClose}>Close</Button>
        </div>
      ) : (
        // Remounted per open so it always starts fresh on the Submit tab.
        open && <FeedbackPanel onCancel={onClose} onDone={onClose} />
      )}
    </Modal>,
    document.body
  );
}
