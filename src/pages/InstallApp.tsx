import { useEffect } from 'react';
import { Smartphone, Monitor, CheckCircle2 } from 'lucide-react';
import { useInstallPromptStore, triggerInstallPrompt } from '../store/installPromptStore';
import { Button, Card, PageHeader } from '../components/ui';

export default function InstallApp() {
  const installed = useInstallPromptStore((s) => s.installed);

  // Visiting this page from the nav is itself a request to install —
  // show the same prompt used everywhere else in the app.
  useEffect(() => {
    if (!installed) triggerInstallPrompt();
  }, [installed]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Install app"
        description={
          <>
            Add <span className="font-luxury">Aurafin</span> to your home screen or desktop for quick access.
          </>
        }
      />

      {installed ? (
        <Card padding="lg" className="flex items-center gap-3">
          <CheckCircle2 size={18} className="text-positive shrink-0" />
          <p className="text-sm font-medium text-ink">
            <span className="font-luxury">Aurafin</span> is already installed as an app on this device.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card padding="lg">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
                <Smartphone size={18} />
              </span>
              <p className="text-sm font-semibold text-ink mb-1">Mobile</p>
              <p className="text-sm text-muted">
                Open this site in your phone's browser, then choose "Add to Home Screen" from the browser menu.
              </p>
            </Card>
            <Card padding="lg">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
                <Monitor size={18} />
              </span>
              <p className="text-sm font-semibold text-ink mb-1">Desktop</p>
              <p className="text-sm text-muted">
                Click the install icon in your browser's address bar to add <span className="font-luxury">Aurafin</span>{' '}
                as a desktop app.
              </p>
            </Card>
          </div>

          <Button variant="secondary" onClick={triggerInstallPrompt}>
            Show install prompt
          </Button>
        </>
      )}
    </div>
  );
}
