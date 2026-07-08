export type DragTransferLike = {
  dataTransfer: { types: readonly string[] | string[] };
};

/** True cuando el drag trae archivos (no solo texto o nodos internos del canvas). */
export function dragEventHasFiles(event: DragTransferLike): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}
