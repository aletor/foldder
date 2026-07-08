/**
 * Resuelve objetos pdf.js lazy (callback) — evita throw "Requesting object that isn't resolved yet".
 */

export function getPdfJsObject(page: unknown, objectName: string, timeoutMs = 500): Promise<unknown> {
  const objectStore = (page as { objs?: { get?: (name: string, callback: (value: unknown) => void) => void } }).objs;
  const getObject = objectStore?.get;
  if (!getObject) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    try {
      getObject.call(objectStore, objectName, (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      });
    } catch {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

/** Fuerza resolución de XObjects referenciados en la página (post getOperatorList). */
export async function warmPdfJsPageObjects(
  page: unknown,
  operatorList: { fnArray: number[]; argsArray: unknown[][] },
  imageOps: Set<number>,
): Promise<void> {
  const names = new Set<string>();
  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    if (!imageOps.has(operatorList.fnArray[i]!)) continue;
    const args = operatorList.argsArray[i] ?? [];
    if (typeof args[0] === "string") names.add(args[0]);
  }
  await Promise.all([...names].map((name) => getPdfJsObject(page, name)));
}
