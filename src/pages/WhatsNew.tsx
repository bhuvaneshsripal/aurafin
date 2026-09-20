import { Sparkles } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '../components/ui';

export default function WhatsNew() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="What's new"
        description={
          <>
            Latest updates and improvements to <span className="font-luxury">Aurafin</span>.
          </>
        }
      />
      <Card padding="none">
        <EmptyState
          icon={<Sparkles size={18} />}
          title="We're always shipping"
          description="Check back here for release notes and new features."
        />
      </Card>
    </div>
  );
}
