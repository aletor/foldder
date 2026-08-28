/**
 * IDs efímeros de copias MultiCard en displayPage.
 * Seguros para SVG `url(#id)` (sin `/` ni `%`). No se persisten ni se escriben en Designer.
 */
const PREFIX = "scmcinst_";
const SEP = "__";

export type MultiCardInstanceRef = {
  nodeId: string;
  cardId: string;
  moldLayerId: string;
  cardIndex: number;
};

function encodePart(value: string): string {
  let out = "";
  for (const ch of value) {
    if (/[a-zA-Z0-9]/.test(ch)) out += ch;
    else out += `_${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
  }
  return out;
}

function decodePart(value: string): string {
  return value.replace(/_([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

export function encodeMultiCardInstanceId(args: {
  nodeId: string;
  cardId: string;
  moldLayerId: string;
}): string {
  return `${PREFIX}${encodePart(args.nodeId)}${SEP}${encodePart(args.cardId)}${SEP}${encodePart(args.moldLayerId)}`;
}

export function parseMultiCardInstanceId(layerId: string): {
  nodeId: string;
  cardId: string;
  moldLayerId: string;
} | null {
  if (!layerId.startsWith(PREFIX)) return null;
  const parts = layerId.slice(PREFIX.length).split(SEP);
  if (parts.length !== 3) return null;
  const nodeId = decodePart(parts[0]!);
  const cardId = decodePart(parts[1]!);
  const moldLayerId = decodePart(parts[2]!);
  if (!nodeId || !cardId || !moldLayerId) return null;
  return { nodeId, cardId, moldLayerId };
}

export function isMultiCardInstanceId(layerId: string): boolean {
  return parseMultiCardInstanceId(layerId) != null;
}

export function moldLayerIdFromDisplay(layerId: string): string {
  return parseMultiCardInstanceId(layerId)?.moldLayerId ?? layerId;
}
