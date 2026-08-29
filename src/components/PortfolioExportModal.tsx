import { useState } from 'react';
import { Download, FileText, Loader } from 'lucide-react';
import { exportDomToPdf } from '../utils/exportPdf';
import Modal from './Modal';

interface PortfolioExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportElementId?: string;
}

export const PortfolioExportModal = ({ isOpen, onClose, reportElementId = 'portfolio-pdf-report' }: PortfolioExportModalProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPdf = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const reportElement = document.getElementById(reportElementId);
      if (!reportElement) {
        throw new Error('Report element not found. Please ensure the portfolio report is rendered.');
      }

      const filename = `Portfolio-Report-${new Date().toISOString().split('T')[0]}`;
      await exportDomToPdf(
        reportElement,
        filename,
        'AuraFin Holdings - Portfolio Report'
      );

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
    <Modal open={isOpen} onClose={onClose} title="Export Portfolio">
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Export your complete portfolio report as a PDF including all assets, liabilities, and financial metrics.
          </p>
        </div>

        {exportError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-300">
              <span className="font-semibold">Error:</span> {exportError}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              If the problem persists, please check your browser's developer console for more details.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText size={20} className="text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">PDF Report</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Comprehensive portfolio report with summary, asset breakdown, liabilities, and detailed listings.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
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
                Export as PDF
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          Note: First-time export may take a moment to load required libraries.
        </p>
      </div>
    </Modal>
  );
};
