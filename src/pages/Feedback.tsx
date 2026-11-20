import { Card, PageHeader } from '../components/ui';
import FeedbackPanel from '../components/FeedbackPanel';
import { openSupportMail } from '../config/support';

export default function Feedback() {
  return (
    <div className="space-y-5">
      <PageHeader title="Share Feedback" description="Tell us what's working, and what isn't." />
      <Card padding="lg" className="max-w-xl">
        <FeedbackPanel />
      </Card>
      <p className="max-w-xl text-sm text-muted">
        Need help with something?{' '}
        <button
          type="button"
          onClick={() => openSupportMail('Aurafin support')}
          className="font-medium text-brand-600 hover:underline"
        >
          Contact support
        </button>
        .
      </p>
    </div>
  );
}
