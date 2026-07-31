/**
 * Loads an image file into an <img> element so its natural dimensions and
 * pixels are available for interactive cropping (see AvatarCropModal).
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => resolve(img);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Re-renders `img` rotated by `degrees` (must be a multiple of 90) onto an
 * offscreen canvas and loads the result into a fresh <img> element. For a
 * 90°/270° turn the canvas dimensions are swapped so the output is upright
 * with no cropping. Used by AvatarCropModal so pan/zoom/crop math can treat
 * "the image" as always upright, regardless of the rotation the person chose.
 */
export function rotateImage(img: HTMLImageElement, degrees: number): Promise<HTMLImageElement> {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) {
    return Promise.resolve(img);
  }

  const swapped = normalized === 90 || normalized === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swapped ? img.height : img.width;
  canvas.height = swapped ? img.width : img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser does not support image editing.');

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return new Promise((resolve, reject) => {
    const rotated = new Image();
    rotated.onload = () => resolve(rotated);
    rotated.onerror = () => reject(new Error('Could not rotate that image.'));
    rotated.src = canvas.toDataURL('image/png');
  });
}

/**
 * Draws a square region — `cropSize` x `cropSize` starting at (cropX, cropY)
 * in the image's natural pixel space — scaled to `outSize` x `outSize`,
 * returning a JPEG data URL. Used by the crop/zoom modal to render the
 * final avatar once the person has positioned and zoomed the photo.
 */
export function renderCroppedSquare(
  img: HTMLImageElement,
  cropX: number,
  cropY: number,
  cropSize: number,
  outSize = 320,
  quality = 0.85
): string {
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser does not support image editing.');
  ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, outSize, outSize);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Load an image file, centre-crop it to a square, and downscale it to
 * `size` x `size` pixels, returning a JPEG data URL.
 *
 * Keeping the result small (a few tens of KB) matters because it's stored
 * directly in a Firestore document field rather than a file-storage bucket
 * — well under Firestore's 1MB per-document limit, and avoids needing
 * Firebase Storage (and its own security rules / billing plan) set up
 * just for a profile picture.
 */
export function fileToSquareDataUrl(file: File, size = 320, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => {
        // Centre-crop to a square first (so a landscape or portrait photo
        // doesn't get squashed), then draw that square down to `size`.
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Your browser does not support image editing.'));
          return;
        }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
