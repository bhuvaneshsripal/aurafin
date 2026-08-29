# PDF Export Feature Integration Guide

This guide explains how to integrate the new PDF export feature for the AuraFin Holdings portfolio.

## Overview

The PDF export feature allows users to generate comprehensive portfolio reports including:
- Portfolio summary (Net Worth, Total Assets, Liabilities)
- Monthly cashflow metrics
- Asset breakdown with charts
- Liabilities breakdown
- Detailed asset listings
- Generated with current date and time

## Files Added

### Core Files
1. **`src/utils/exportPdf.ts`** - Utility functions for PDF generation
   - `exportDomToPdf()` - Converts DOM element to PDF
   - `generatePortfolioSummary()` - Creates portfolio summary object

2. **`src/components/PortfolioPdfReport.tsx`** - Printable portfolio report component
   - Renders complete portfolio data
   - Includes charts and tables
   - Optimized for PDF export
   - Responsive design

3. **`src/components/PortfolioExportModal.tsx`** - Modal dialog for export
   - User-friendly export interface
   - Error handling
   - Loading state
   - PDF generation trigger

## Dependencies Added

The following packages have been added to `package.json`:
- `html2canvas@^1.4.1` - Convert DOM to canvas
- `jspdf@^2.5.1` - Generate PDF files

Install them with:
```bash
npm install
```

## Integration Steps

### 1. Update Dashboard.tsx

Add the import statements at the top of `src/pages/Dashboard.tsx`:

```typescript
import { useState } from 'react';
import { PortfolioPdfReport } from '../components/PortfolioPdfReport';
import { PortfolioExportModal } from '../components/PortfolioExportModal';
```

Add state management inside the Dashboard component:

```typescript
const [exportModalOpen, setExportModalOpen] = useState(false);
```

### 2. Add Export Button

Add a button to trigger the export modal. Insert this in the Dashboard JSX, typically in the header area:

```typescript
<button
  onClick={() => setExportModalOpen(true)}
  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
>
  <Download size={16} />
  Export Portfolio
</button>
```

Remember to import the Download icon:
```typescript
import { Download } from 'lucide-react';
```

### 3. Render the Components

Add the modal and report component at the end of the Dashboard return statement:

```typescript
// At the end of the Dashboard component, before closing div
<PortfolioExportModal 
  isOpen={exportModalOpen} 
  onClose={() => setExportModalOpen(false)} 
/>

{/* Hidden report component - used only for PDF generation */}
<div style={{ display: 'none' }}>
  <PortfolioPdfReport hideInPrint={false} />
</div>
```

### 4. Styling (Optional)

The export button placement suggestion - update the Dashboard header area:

```typescript
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">Dashboard</h1>
  <button
    onClick={() => setExportModalOpen(true)}
    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
  >
    <Download size={16} />
    Export Portfolio
  </button>
</div>
```

## Example Integration (Complete)

Here's a simplified version of how the Dashboard should be updated:

```typescript
import { useState } from 'react';
import { Download } from 'lucide-react';
// ... other imports ...
import { PortfolioPdfReport } from '../components/PortfolioPdfReport';
import { PortfolioExportModal } from '../components/PortfolioExportModal';

export default function Dashboard() {
  const [exportModalOpen, setExportModalOpen] = useState(false);
  
  // ... existing state and logic ...

  return (
    <div className="space-y-6">
      {/* Header with export button */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
        >
          <Download size={16} />
          Export Portfolio
        </button>
      </div>

      {/* Existing dashboard content */}
      {/* ... existing components ... */}

      {/* Export modal */}
      <PortfolioExportModal 
        isOpen={exportModalOpen} 
        onClose={() => setExportModalOpen(false)} 
      />

      {/* Hidden report component - used only for PDF generation */}
      <div style={{ display: 'none' }}>
        <PortfolioPdfReport hideInPrint={false} />
      </div>
    </div>
  );
}
```

## Features

### What's Included in the PDF

1. **Portfolio Summary**
   - Net Worth
   - Total Assets
   - Total Liabilities
   - Overall Gain/Loss percentage

2. **Monthly Cashflow**
   - Income
   - Expenses
   - Net Cashflow

3. **Asset Breakdown**
   - Pie chart visualization
   - Asset class breakdown table
   - Individual asset percentages

4. **Liabilities**
   - Liability type breakdown
   - Amount and percentage tables

5. **Detailed Assets List**
   - Name, class, quantity
   - Current value vs invested
   - Gain/loss for each asset

### Styling & Layout

- A4 page size (210mm × 297mm)
- Professional report layout
- Charts and tables for data visualization
- Auto page breaks for long reports
- Header and footer with generation timestamp
- Responsive to light/dark mode colors (converted to print colors)

## User Experience

1. User clicks "Export Portfolio" button
2. Modal dialog opens with export options
3. User clicks "Export as PDF"
4. PDF is generated (may take 2-5 seconds on first load)
5. File automatically downloads as `Portfolio-Report-YYYY-MM-DD.pdf`
6. Modal closes after successful export

## Error Handling

The feature includes robust error handling:
- Checks for missing report element
- Handles library loading failures
- Displays user-friendly error messages
- Logs detailed errors to console for debugging

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge 60+
- Firefox 55+
- Safari 10.1+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Notes

- PDF generation is performed client-side (no server required)
- First export may take longer as libraries are loaded
- Subsequent exports are faster
- Large portfolios (100+ assets) may take 5-10 seconds

## Privacy & Security

- All processing happens in the user's browser
- No data is sent to external servers
- Files are saved directly to user's device
- No tracking or logging of exported data

## Troubleshooting

### PDF won't generate
1. Check browser console for errors
2. Ensure `PortfolioPdfReport` component is rendered
3. Check that `report-pdf-report` element ID is correct
4. Try in a different browser

### Styling looks wrong in PDF
1. Some CSS properties don't render well in PDFs
2. Complex layouts may need adjustment
3. Consider using print-specific CSS with `@media print`

### Large file sizes
1. PDFs with many assets can be large
2. This is normal for detailed reports
3. Consider exporting less frequently if storage is limited

## Future Enhancements

Potential improvements:
- Email PDF directly
- Schedule automatic monthly exports
- Export specific date ranges
- Multiple export formats (CSV, Excel)
- Customizable report sections
- Add company branding/logo
- Multi-profile portfolio comparison

## Support

For issues or questions:
1. Check browser developer console (F12)
2. Verify all dependencies are installed (`npm install`)
3. Clear browser cache and try again
4. Check that all new files are properly imported
