/**
 * A one-shot handoff for a single File picked on one page but meant to be
 * parsed on another (onboarding's "Import from Broker" opens the OS file
 * picker immediately, then routes to the full /import review screen).
 * Router `state` can't reliably carry a File across navigations, so this
 * is just a module-level box: set it right before navigating, take() it
 * once on the next page's mount. Not meant to survive a reload.
 */
let pendingFile: File | null = null;

export function setPendingImportFile(file: File) {
  pendingFile = file;
}

export function takePendingImportFile(): File | null {
  const file = pendingFile;
  pendingFile = null;
  return file;
}
