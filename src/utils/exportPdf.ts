/**
 * PDF Export utility for portfolio reports
 * Uses html2canvas and jspdf to generate PDF files
 */

/**
 * html2canvas@1.4.1 can't parse CSS `oklch()` colors, and Tailwind v4's
 * *default* color palette (red, amber, green, blue, etc. — everything
 * except this app's own custom brand/accent scales, which are already
 * defined in hex) is declared using oklch() under the hood. Any element
 * inside the captured region using a class like `text-red-600` or
 * `bg-amber-50` therefore throws "Attempting to parse an unsupported
 * color function" and aborts the entire capture — which is why exports
 * failed outright on pages using status colors (loss/profit, warnings,
 * etc.), not just this report specifically.
 *
 * Since Tailwind resolves these via CSS custom properties (`--color-red-600`,
 * etc.), we can override just those variables with their standard hex
 * equivalents before handing the clone to html2canvas — same trick the
 * brand-color override already did, just extended to every default color
 * family actually used across the app's UI.
 */
const TAILWIND_OKLCH_HEX_OVERRIDES: Record<string, string> = {
  'red-50': '#fef2f2', 'red-100': '#fee2e2', 'red-200': '#fecaca', 'red-300': '#fca5a5',
  'red-400': '#f87171', 'red-500': '#ef4444', 'red-600': '#dc2626', 'red-700': '#b91c1c',
  'red-800': '#991b1b', 'red-900': '#7f1d1d', 'red-950': '#450a0a',
  'orange-50': '#fff7ed', 'orange-100': '#ffedd5', 'orange-200': '#fed7aa', 'orange-300': '#fdba74',
  'orange-400': '#fb923c', 'orange-500': '#f97316', 'orange-600': '#ea580c', 'orange-700': '#c2410c',
  'orange-800': '#9a3412', 'orange-900': '#7c2d12', 'orange-950': '#431407',
  'amber-50': '#fffbeb', 'amber-100': '#fef3c7', 'amber-200': '#fde68a', 'amber-300': '#fcd34d',
  'amber-400': '#fbbf24', 'amber-500': '#f59e0b', 'amber-600': '#d97706', 'amber-700': '#b45309',
  'amber-800': '#92400e', 'amber-900': '#78350f', 'amber-950': '#451a03',
  'yellow-50': '#fefce8', 'yellow-100': '#fef9c3', 'yellow-200': '#fef08a', 'yellow-300': '#fde047',
  'yellow-400': '#facc15', 'yellow-500': '#eab308', 'yellow-600': '#ca8a04', 'yellow-700': '#a16207',
  'yellow-800': '#854d0e', 'yellow-900': '#713f12', 'yellow-950': '#422006',
  'lime-50': '#f7fee7', 'lime-500': '#84cc16', 'lime-600': '#65a30d', 'lime-700': '#4d7c0f', 'lime-900': '#365314',
  'green-50': '#f0fdf4', 'green-100': '#dcfce7', 'green-200': '#bbf7d0', 'green-300': '#86efac',
  'green-400': '#4ade80', 'green-500': '#22c55e', 'green-600': '#16a34a', 'green-700': '#15803d',
  'green-800': '#166534', 'green-900': '#14532d', 'green-950': '#052e16',
  'emerald-50': '#ecfdf5', 'emerald-100': '#d1fae5', 'emerald-200': '#a7f3d0', 'emerald-300': '#6ee7b7',
  'emerald-400': '#34d399', 'emerald-500': '#10b981', 'emerald-600': '#059669', 'emerald-700': '#047857',
  'emerald-800': '#065f46', 'emerald-900': '#064e3b', 'emerald-950': '#022c22',
  'teal-50': '#f0fdfa', 'teal-100': '#ccfbf1', 'teal-200': '#99f6e4', 'teal-300': '#5eead4',
  'teal-400': '#2dd4bf', 'teal-500': '#14b8a6', 'teal-600': '#0d9488', 'teal-700': '#0f766e',
  'teal-800': '#115e59', 'teal-900': '#134e4a', 'teal-950': '#042f2e',
  'cyan-50': '#ecfeff', 'cyan-500': '#06b6d4', 'cyan-600': '#0891b2', 'cyan-700': '#0e7490', 'cyan-900': '#164e63',
  'sky-50': '#f0f9ff', 'sky-100': '#e0f2fe', 'sky-200': '#bae6fd', 'sky-300': '#7dd3fc',
  'sky-400': '#38bdf8', 'sky-500': '#0ea5e9', 'sky-600': '#0284c7', 'sky-700': '#0369a1',
  'sky-800': '#075985', 'sky-900': '#0c4a6e', 'sky-950': '#082f49',
  'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe', 'blue-300': '#93c5fd',
  'blue-400': '#60a5fa', 'blue-500': '#3b82f6', 'blue-600': '#2563eb', 'blue-700': '#1d4ed8',
  'blue-800': '#1e40af', 'blue-900': '#1e3a8a', 'blue-950': '#172554',
  'indigo-50': '#eef2ff', 'indigo-100': '#e0e7ff', 'indigo-200': '#c7d2fe', 'indigo-300': '#a5b4fc',
  'indigo-400': '#818cf8', 'indigo-500': '#6366f1', 'indigo-600': '#4f46e5', 'indigo-700': '#4338ca',
  'indigo-800': '#3730a3', 'indigo-900': '#312e81', 'indigo-950': '#1e1b4b',
  'violet-50': '#f5f3ff', 'violet-100': '#ede9fe', 'violet-200': '#ddd6fe', 'violet-300': '#c4b5fd',
  'violet-400': '#a78bfa', 'violet-500': '#8b5cf6', 'violet-600': '#7c3aed', 'violet-700': '#6d28d9',
  'violet-800': '#5b21b6', 'violet-900': '#4c1d95', 'violet-950': '#2e1065',
  'purple-50': '#faf5ff', 'purple-500': '#a855f7', 'purple-600': '#9333ea', 'purple-700': '#7e22ce', 'purple-900': '#581c87',
  'fuchsia-50': '#fdf4ff', 'fuchsia-500': '#d946ef', 'fuchsia-600': '#c026d3', 'fuchsia-700': '#a21caf', 'fuchsia-900': '#701a75',
  'pink-50': '#fdf2f8', 'pink-100': '#fce7f3', 'pink-200': '#fbcfe8', 'pink-300': '#f9a8d4',
  'pink-400': '#f472b6', 'pink-500': '#ec4899', 'pink-600': '#db2777', 'pink-700': '#be185d',
  'pink-800': '#9d174d', 'pink-900': '#831843', 'pink-950': '#500724',
  'rose-50': '#fff1f2', 'rose-100': '#ffe4e6', 'rose-200': '#fecdd3', 'rose-300': '#fda4af',
  'rose-400': '#fb7185', 'rose-500': '#f43f5e', 'rose-600': '#e11d48', 'rose-700': '#be123c',
  'rose-800': '#9f1239', 'rose-900': '#881337', 'rose-950': '#4c0519',
};

function buildColorOverrideCss(): string {
  const decls = Object.entries(TAILWIND_OKLCH_HEX_OVERRIDES)
    .map(([name, hex]) => `--color-${name}: ${hex} !important;`)
    .join('\n        ');
  return `
      * {
        --color-brand-600: #2c6e49 !important;
        --color-brand-700: #24573c !important;
        --color-brand-900: #163a2c !important;
        ${decls}
      }
    `;
}

export async function exportDomToPdf(
  element: HTMLElement,
  filename: string,
  title?: string
): Promise<void> {
  // The clone needs to actually be laid out by the browser (correct
  // widths, wrapped text, rendered charts) before html2canvas can
  // rasterize it — a detached node cloneNode() alone produces has no
  // layout at all. It's positioned off-screen (not display:none /
  // visibility:hidden, both of which would skip layout) so it never
  // flashes on screen, and is always removed again in `finally`.
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '-99999px';
  host.style.width = `${element.offsetWidth || element.scrollWidth || 1024}px`;
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';

  try {
    const clonedElement = element.cloneNode(true) as HTMLElement;

    // Convert Tailwind's oklch()-based default color palette to hex
    // equivalents html2canvas can actually parse (see module docs above).
    const style = document.createElement('style');
    style.textContent = buildColorOverrideCss();
    clonedElement.prepend(style);

    host.appendChild(clonedElement);
    document.body.appendChild(host);

    // Let the browser lay out/paint the attached clone (fonts, charts,
    // wrapped text) before capturing it.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Dynamically import the required libraries
    const html2canvas = (await import('html2canvas')).default;
    const jsPDF = (await import('jspdf')).jsPDF;

    // Create a canvas from the DOM element
    const canvas = await html2canvas(clonedElement, {
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      // Disable problematic features that might use oklch
      imageTimeout: 0,
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let position = 0;

    // Add title page if provided
    if (title) {
      pdf.setFontSize(24);
      pdf.text(title, pdf.internal.pageSize.getWidth() / 2, 40, { align: 'center' });
      pdf.setFontSize(10);
      pdf.text(`Generated on ${new Date().toLocaleDateString()}`, pdf.internal.pageSize.getWidth() / 2, 50, {
        align: 'center',
      });
      pdf.addPage();
      position = 0;
    }

    // Add image pages
    const imgData = canvas.toDataURL('image/png');
    while (heightLeft > 0) {
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      position = heightLeft;
      if (heightLeft > 0) {
        pdf.addPage();
      }
    }

    // Download the PDF
    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF. Please ensure the export libraries are available.');
  } finally {
    host.remove();
  }
}

/**
 * Generate a portfolio summary report as a structured object
 */
export interface PortfolioSummary {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  invested: number;
  gains: number;
  gainPercent: number;
  monthlyIncome: number;
  monthlyExpense: number;
  generatedAt: string;
}

export function generatePortfolioSummary(
  totalAssets: number,
  totalLiabilities: number,
  investedTotal: number,
  monthlyIncome: number,
  monthlyExpense: number
): PortfolioSummary {
  const netWorth = totalAssets - totalLiabilities;
  const gains = totalAssets - investedTotal;
  const gainPercent = investedTotal > 0 ? (gains / investedTotal) * 100 : 0;

  return {
    netWorth,
    totalAssets,
    totalLiabilities,
    invested: investedTotal,
    gains,
    gainPercent,
    monthlyIncome,
    monthlyExpense,
    generatedAt: new Date().toLocaleString(),
  };
}
