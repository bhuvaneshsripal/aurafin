import { useState } from 'react';
import { Download, Loader } from 'lucide-react';
import { exportDomToPdf } from '../utils/exportPdf';
import { toIsoDate } from '../utils/date';
import Modal from './Modal';
import { PortfolioPdfReport } from './PortfolioPdfReport';

interface PortfolioExportModalProps {
  open: boolean;
  onClose: () => void;
}

const PREVIEW_ELEMENT_ID = 'portfolio-pdf-report-preview';
// Fixed "page" width for the live preview, independent of the viewer's
// screen size -- this is also the exact element html2canvas captures, so
// keeping it fixed means the exported PDF looks the same on phone or
// desktop, and matches what's shown here.
const PREVIEW_PAGE_WIDTH = 900;

export const PortfolioExportModal = ({ open, onClose }: PortfolioExportModalProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPdf = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const reportElement = document.getElementById(PREVIEW_ELEMENT_ID);
      if (!reportElement) {
        throw new Error("The preview isn't ready yet -- please wait a moment and try again.");
      }

      const filename = `Portfolio-Report-${toIsoDate()}`;
      await exportDomToPdf(reportElement, filename, 'AuraFin Holdings - Portfolio Report');

      // Close modal after successful export
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export PDF';
      setExportError(errorMessage);
      console.error('PDF export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Portfolio" contentPanel>
      <div className="flex flex-col gap-4 h-full">
        <p className="text-sm text-muted -mt-1">
          This is exactly what your PDF will look like -- scroll through to check
          it, including your sold investments and realized gains, then download.
        </p>

        {exportError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 shrink-0">
            <p className="text-red-800 text-sm">
              <span className="font-semibold">Error:</span> {exportError}
            </p>
          </div>
        )}

        {/* Live, scrollable preview of the exact DOM node that gets
           captured for the PDF. Fixed inner width keeps the export
           consistent regardless of the device previewing it. */}
        <div className="flex-1 min-h-0 rounded-xl border border-line bg-slate-100 dark:bg-slate-800 overflow-auto">
          <div className="p-4 sm:p-6">
            <div
              className="mx-auto shadow-lg rounded-lg overflow-hidden"
              style={{ width: PREVIEW_PAGE_WIDTH, maxWidth: '100%' }}
            >
              <PortfolioPdfReport reportElementId={PREVIEW_ELEMENT_ID} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-line shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isExporting ? (
              <>
                <Loader size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download size={16} />
                Download PDF
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-muted text-center shrink-0">
          First-time export may take a moment to load required libraries.
        </p>
      </div>
    </Modal>
  );
};
