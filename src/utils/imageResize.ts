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
