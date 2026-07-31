import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw } from 'lucide-react';
import Modal from './Modal';
import { renderCroppedSquare, rotateImage } from '../utils/imageResize';

const VIEWPORT = 260; // px — size of the circular crop preview
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface AvatarCropModalProps {
  open: boolean;
  image: HTMLImageElement | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

/**
 * Lets the person pan, zoom, and rotate a photo before it's saved as their
 * profile picture, instead of always auto-cropping to the exact centre.
 * Dragging moves the photo behind a fixed circular viewport; the slider (or
 * pinch/wheel) zooms in and out; the rotate buttons turn it 90° at a time.
 * On confirm, the same region is re-rendered at full resolution onto an
 * offscreen canvas via renderCroppedSquare.
 */
export default function AvatarCropModal({ open, image, onCancel, onConfirm }: AvatarCropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  // The image re-rendered upright at the current rotation. Pan/zoom/crop
  // math below all operates on this instead of the original `image`, so
  // rotating doesn't require rewriting the offset/clamp geometry.
  const [rotatedImage, setRotatedImage] = useState<HTMLImageElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  // Reset pan/zoom/rotation whenever a new image is loaded into the modal.
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setRotatedImage(image);
  }, [image]);

  // Re-render the rotated image whenever rotation changes, and reset pan/
  // zoom since the effective canvas dimensions may have swapped.
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    rotateImage(image, rotation).then((rotated) => {
      if (cancelled) return;
      setRotatedImage(rotated);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation]);

  if (!image || !rotatedImage) return null;

  const rotateLeft = () => setRotation((r) => (r + 270) % 360);
  const rotateRight = () => setRotation((r) => (r + 90) % 360);

  // "Cover" base scale — the smallest scale at which the image fully
  // fills the square viewport with no gaps, before any user zoom.
  const baseScale = Math.max(VIEWPORT / rotatedImage.width, VIEWPORT / rotatedImage.height);
  const scale = baseScale * zoom;
  const displayW = rotatedImage.width * scale;
  const displayH = rotatedImage.height * scale;

  const clampOffset = (x: number, y: number) => {
    const minX = VIEWPORT - displayW;
    const minY = VIEWPORT - displayH;
    return {
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
    };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.startOffset.x + dx, dragRef.current.startOffset.y + dy));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleZoomChange = (next: number) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    // Keep the viewport's centre point fixed on the image while zooming,
    // rather than always zooming toward the image's top-left corner.
    const nextScale = baseScale * clampedZoom;
    const cx = VIEWPORT / 2;
    const cy = VIEWPORT / 2;
    const imgX = (cx - offset.x) / scale;
    const imgY = (cy - offset.y) / scale;
    setZoom(clampedZoom);
    setOffset(clampOffset(cx - imgX * nextScale, cy - imgY * nextScale));
  };

  const handleConfirm = () => {
    // Map the viewport back to natural image pixels: the square region
    // currently visible behind the circular mask.
    const cropSize = VIEWPORT / scale;
    const cropX = -offset.x / scale;
    const cropY = -offset.y / scale;
    const dataUrl = renderCroppedSquare(rotatedImage, cropX, cropY, cropSize);
    onConfirm(dataUrl);
  };

  return (
    <Modal open={open} onClose={onCancel} title="Adjust photo">
      <div className="flex flex-col items-center gap-5">
        <div
          className="relative rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner cursor-grab active:cursor-grabbing touch-none select-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={rotatedImage.src}
            alt=""
            draggable={false}
            className="absolute top-0 left-0 max-w-none pointer-events-none"
            style={{ width: displayW, height: displayH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={rotateLeft}
            aria-label="Rotate left"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={rotateRight}
            aria-label="Rotate right"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RotateCw size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 w-full max-w-xs">
          <ZoomOut size={16} className="text-slate-400 shrink-0" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
          <ZoomIn size={16} className="text-slate-400 shrink-0" />
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">Drag to reposition, slide/pinch to zoom, or rotate.</p>

        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Save Photo
          </button>
        </div>
      </div>
    </Modal>
  );
}
