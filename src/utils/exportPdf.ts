/**
 * PDF Export utility for portfolio reports
 * Uses html2canvas and jspdf to generate PDF files
 */

export async function exportDomToPdf(
  element: HTMLElement,
  filename: string,
  title?: string
): Promise<void> {
  try {
    // Clone the element to avoid modifying the original
    const clonedElement = element.cloneNode(true) as HTMLElement;
    
    // Convert unsupported CSS colors to hex equivalents
    const style = document.createElement('style');
    style.textContent = `
      * {
        --color-brand-600: #16a34a !important;
        --color-brand-700: #15803d !important;
        --color-brand-900: #166534 !important;
      }
    `;
    clonedElement.appendChild(style);

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
