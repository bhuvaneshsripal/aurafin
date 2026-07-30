import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function UpiQrCode({ link, size = 160 }: { link: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
      />
    );
  }

  return <img src={dataUrl} alt="UPI payment QR code" width={size} height={size} className="rounded-lg" />;
}
