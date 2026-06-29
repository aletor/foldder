/**
 * File System Access API + fallback <input type="file">.
 * Handles vivos en memoria por nodeId (no sobreviven a recarga).
 */

type FileHandleWithPermissions = FileSystemFileHandle & {
  queryPermission(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
};

type WindowWithFilePicker = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle[]>;
};

const RAW_ACCEPT: Record<string, string[]> = {
  "image/x-canon-cr3": [".cr3"],
  "image/x-canon-cr2": [".cr2"],
  "image/x-adobe-dng": [".dng"],
  "image/x-nikon-nef": [".nef"],
  "image/x-sony-arw": [".arw"],
  "image/x-fuji-raf": [".raf"],
  "image/x-panasonic-rw2": [".rw2"],
  "image/x-olympus-orf": [".orf"],
  "application/octet-stream": [
    ".cr3",
    ".cr2",
    ".dng",
    ".nef",
    ".arw",
    ".raf",
    ".rw2",
    ".orf",
    ".pef",
    ".srw",
  ],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export type PickedLocalFile = {
  file: File;
  handle?: FileSystemFileHandle;
};

const handleByNodeId = new Map<string, FileSystemFileHandle>();

export function storeFileHandleForNode(nodeId: string, handle: FileSystemFileHandle | undefined) {
  if (handle) handleByNodeId.set(nodeId, handle);
  else handleByNodeId.delete(nodeId);
}

export function clearFileHandleForNode(nodeId: string) {
  handleByNodeId.delete(nodeId);
}

export async function getFileForNode(nodeId: string): Promise<File | null> {
  const handle = handleByNodeId.get(nodeId) as FileHandleWithPermissions | undefined;
  if (!handle) return null;
  try {
    const perm = await handle.queryPermission({ mode: "read" });
    if (perm === "granted") return handle.getFile();
    const req = await handle.requestPermission({ mode: "read" });
    if (req === "granted") return handle.getFile();
    return null;
  } catch {
    return null;
  }
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && typeof (window as WindowWithFilePicker).showOpenFilePicker === "function";
}

export async function pickLocalPhotoFile(): Promise<PickedLocalFile | null> {
  const picker = (window as WindowWithFilePicker).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        multiple: false,
        types: [
          {
            description: "RAW / DNG / JPEG",
            accept: RAW_ACCEPT,
          },
        ],
      });
      const file = await handle.getFile();
      return { file, handle };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      throw e;
    }
  }
  return pickViaHiddenInput();
}

function pickViaHiddenInput(): Promise<PickedLocalFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = Object.values(RAW_ACCEPT).flat().join(",") + ",.jpg,.jpeg,.png";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file ? { file } : null);
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    input.click();
  });
}

export async function tryRelinkFile(
  expected: { fileName: string; fileSize: number; lastModified: number },
): Promise<PickedLocalFile | null> {
  const picked = await pickLocalPhotoFile();
  if (!picked) return null;
  const { file } = picked;
  if (
    file.name !== expected.fileName ||
    file.size !== expected.fileSize ||
    file.lastModified !== expected.lastModified
  ) {
    const ok = window.confirm(
      `El archivo elegido (${file.name}) no coincide exactamente con la referencia guardada (${expected.fileName}). ¿Usarlo igualmente?`,
    );
    if (!ok) return null;
  }
  return picked;
}
