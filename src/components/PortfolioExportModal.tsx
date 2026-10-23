import { useEffect, useRef } from 'react';
import { exportDomToPdf } from '../utils/exportPdf';
import { toIsoDate } from '../utils/date';
import { toast } from '../store/toastStore';
import { PortfolioPdfReport } from './PortfolioPdfReport';

interface PortfolioExportModalProps {
  open: boolean;
  onClose: () => void;
}

const REPORT_ELEMENT_ID = 'portfolio-pdf-report-export';
// Fixed "page" width the report is laid out at -- the same element the PDF
// is captured from, so the file looks the same on phone or desktop.
const PAGE_WIDTH = 900;

/**
 * No preview: while `open` is true the report is rendered off-screen, the PDF
 * is generated and downloaded straight away, then `onClose` is called.
 * (Name kept so existing callers don't change.)
 */
export const PortfolioExportModal = ({ open, onClose }: PortfolioExportModalProps) => {
  const running = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || running.current) return;
    running.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        toast.info('Preparing your report…');
        // Let the off-screen report mount, lay out and load its charts.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => window.setTimeout(r, 600));
        if (cancelled) return;
        const el = document.getElementById(REPORT_ELEMENT_ID);
        if (!el) throw new Error('The report is not ready yet. Please try again.');
        await exportDomToPdf(el, `Portfolio-Report-${toIsoDate()}`, 'AuraFin Holdings - Portfolio Report');
        toast.success('Report downloaded');
      } catch (error) {
        console.error('PDF export error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to export PDF');
      } finally {
        running.current = false;
        if (!cancelled) onCloseRef.current();
      }
    };
    void run();

    return () => {
      cancelled = true;
      running.current = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: -10000,
        width: PAGE_WIDTH,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <PortfolioPdfReport reportElementId={REPORT_ELEMENT_ID} />
    </div>
  );
};
