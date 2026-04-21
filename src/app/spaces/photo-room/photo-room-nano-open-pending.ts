/**
 * Abrir Nano Banana Studio justo tras crear el nodo desde PhotoRoom: el evento en window puede
 * dispararse antes del mount/listener; el layout effect del Nano consume este mapa síncronamente.
 */
const pending = new Map<string, { photoRoomNodeId: string }>();

export function registerPendingNanoStudioOpenFromPhotoRoom(
  nanoNodeId: string,
  photoRoomNodeId: string,
): void {
  pending.set(nanoNodeId, { photoRoomNodeId });
}

export function takePendingNanoStudioOpenFromPhotoRoom(
  nanoNodeId: string,
): { photoRoomNodeId: string } | null {
  const v = pending.get(nanoNodeId);
  if (!v) return null;
  pending.delete(nanoNodeId);
  return v;
}
