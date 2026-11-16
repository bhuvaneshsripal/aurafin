import { Card, PageHeader } from '../components/ui';
import FeedbackPanel from '../components/FeedbackPanel';

export default function Feedback() {
  return (
    <div className="space-y-5">
      <PageHeader title="Share Feedback" description="Tell us what's working, and what isn't." />
      <Card padding="lg" className="max-w-xl">
        <FeedbackPanel />
      </Card>
    </div>
  );
}
