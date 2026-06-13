import { Position } from "@xyflow/react";

/**
 * Routing ortogonal de conexiones que esquiva (bordea) los demás nodos.
 *
 * Construye una rejilla sobre el área entre origen y destino, marca como no
 * transitables las celdas ocupadas por nodos (inflados un margen) y busca la
 * ruta con A* en 4 direcciones (segmentos rectos en ángulo recto). El resultado
 * se simplifica (puntos colineales) y se dibuja con esquinas redondeadas.
 *
 * Si el grafo/área es demasiado grande o no hay ruta, devuelve `null` y el edge
 * cae a un trazado smoothstep normal.
 */

export type SmartEdgeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SmartEdgePathResult = {
  svgPath: string;
  labelX: number;
  labelY: number;
};

type Point = { x: number; y: number };

const GRID = 16;
/** Margen alrededor de cada nodo para que la línea no lo roce. */
const NODE_PADDING = 14;
/** Inflado del área de búsqueda alrededor de los extremos. */
const SEARCH_MARGIN = 360;
/** Tope de celdas para no degradar el rendimiento en grafos enormes. */
const MAX_CELLS = 240 * 240;
/** Penalización por giro: favorece rutas con menos esquinas (más rectas). */
const TURN_PENALTY = 4;
/** Radio de redondeo de esquinas (0 = ángulos rectos puros). */
const CORNER_RADIUS = 0;

function isHorizontal(position: Position): boolean {
  return position === Position.Left || position === Position.Right;
}

/** Trazado ortogonal mínimo (estilo "Z"/"L") entre dos handles, sin rodear. */
function simpleOrthogonalPoints(
  source: Point & { position: Position },
  target: Point & { position: Position },
): Point[] {
  const s: Point = { x: source.x, y: source.y };
  const t: Point = { x: target.x, y: target.y };
  const sh = isHorizontal(source.position);
  const th = isHorizontal(target.position);

  if (sh && th) {
    if (s.y === t.y) return [s, t];
    const midX = (s.x + t.x) / 2;
    return [s, { x: midX, y: s.y }, { x: midX, y: t.y }, t];
  }
  if (!sh && !th) {
    if (s.x === t.x) return [s, t];
    const midY = (s.y + t.y) / 2;
    return [s, { x: s.x, y: midY }, { x: t.x, y: midY }, t];
  }
  // Mixto: codo en L.
  if (sh) return [s, { x: t.x, y: s.y }, t];
  return [s, { x: s.x, y: t.y }, t];
}

/** ¿Algún tramo (axis-aligned) de la polilínea cruza algún obstáculo? */
function pathHitsObstacles(points: Point[], rects: SmartEdgeRect[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (const r of rects) {
      if (x0 <= r.x + r.width && x1 >= r.x && y0 <= r.y + r.height && y1 >= r.y) {
        return true;
      }
    }
  }
  return false;
}

function offsetOutward(p: Point, position: Position, distance: number): Point {
  switch (position) {
    case Position.Left:
      return { x: p.x - distance, y: p.y };
    case Position.Right:
      return { x: p.x + distance, y: p.y };
    case Position.Top:
      return { x: p.x, y: p.y - distance };
    case Position.Bottom:
    default:
      return { x: p.x, y: p.y + distance };
  }
}

function rectsIntersect(a: SmartEdgeRect, b: SmartEdgeRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Cola de prioridad mínima (binary heap) sobre claves numéricas. */
class MinHeap {
  private keys: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, priority: number): void {
    this.keys.push(key);
    this.prio.push(priority);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const topKey = this.keys[0];
    const lastKey = this.keys.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.prio[0] = lastPrio;
      let i = 0;
      const n = this.keys.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && this.prio[l] < this.prio[smallest]) smallest = l;
        if (r < n && this.prio[r] < this.prio[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return topKey;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = k;
    const p = this.prio[a];
    this.prio[a] = this.prio[b];
    this.prio[b] = p;
  }
}

export function getSmartOrthogonalPath(params: {
  source: Point & { position: Position };
  target: Point & { position: Position };
  obstacles: SmartEdgeRect[];
}): SmartEdgePathResult | null {
  const { source, target, obstacles } = params;

  const sourcePoint: Point = { x: source.x, y: source.y };
  const targetPoint: Point = { x: target.x, y: target.y };

  // Obstáculos inflados (margen alrededor de cada nodo).
  const inflatedAll: SmartEdgeRect[] = [];
  for (const o of obstacles) {
    if (o.width <= 0 || o.height <= 0) continue;
    inflatedAll.push({
      x: o.x - NODE_PADDING,
      y: o.y - NODE_PADDING,
      width: o.width + NODE_PADDING * 2,
      height: o.height + NODE_PADDING * 2,
    });
  }

  // Atajo: si el trazado ortogonal directo (mínimas esquinas) no cruza ningún
  // nodo, úsalo tal cual. Solo rodeamos con A* cuando hay algo en medio.
  const directPoints = simplifyCollinear(enforceOrthogonal(simpleOrthogonalPoints(source, target)));
  if (!pathHitsObstacles(directPoints, inflatedAll)) {
    const mid = directPoints[Math.floor(directPoints.length / 2)];
    return {
      svgPath: buildRoundedPath(directPoints, CORNER_RADIUS),
      labelX: mid.x,
      labelY: mid.y,
    };
  }

  // Puntos de entrada/salida desplazados hacia fuera del nodo (en la dirección del handle).
  const startOut = offsetOutward(sourcePoint, source.position, GRID * 2);
  const endOut = offsetOutward(targetPoint, target.position, GRID * 2);

  // Área de búsqueda: caja de los extremos inflada un margen.
  let minX = Math.min(startOut.x, endOut.x) - SEARCH_MARGIN;
  let minY = Math.min(startOut.y, endOut.y) - SEARCH_MARGIN;
  let maxX = Math.max(startOut.x, endOut.x) + SEARCH_MARGIN;
  let maxY = Math.max(startOut.y, endOut.y) + SEARCH_MARGIN;

  const bbox: SmartEdgeRect = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  // Obstáculos relevantes: los inflados que intersecan el área. Expandimos el
  // área para contener por completo cada obstáculo y poder rodearlo.
  const inflated: SmartEdgeRect[] = [];
  for (const o of obstacles) {
    if (o.width <= 0 || o.height <= 0) continue;
    const r: SmartEdgeRect = {
      x: o.x - NODE_PADDING,
      y: o.y - NODE_PADDING,
      width: o.width + NODE_PADDING * 2,
      height: o.height + NODE_PADDING * 2,
    };
    if (!rectsIntersect(r, bbox)) continue;
    inflated.push(r);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  const cols = Math.ceil((maxX - minX) / GRID) + 1;
  const rows = Math.ceil((maxY - minY) / GRID) + 1;
  if (cols <= 0 || rows <= 0 || cols * rows > MAX_CELLS) return null;

  const toCol = (x: number) => Math.min(cols - 1, Math.max(0, Math.round((x - minX) / GRID)));
  const toRow = (y: number) => Math.min(rows - 1, Math.max(0, Math.round((y - minY) / GRID)));
  const cellX = (col: number) => minX + col * GRID;
  const cellY = (row: number) => minY + row * GRID;

  // Mapa de celdas transitables.
  const walkable = new Uint8Array(cols * rows).fill(1);
  for (const r of inflated) {
    const c0 = toCol(r.x);
    const c1 = toCol(r.x + r.width);
    const r0 = toRow(r.y);
    const r1 = toRow(r.y + r.height);
    for (let row = r0; row <= r1; row++) {
      const base = row * cols;
      for (let col = c0; col <= c1; col++) walkable[base + col] = 0;
    }
  }

  const startCol = toCol(startOut.x);
  const startRow = toRow(startOut.y);
  const endCol = toCol(endOut.x);
  const endRow = toRow(endOut.y);
  const startIdx = startRow * cols + startCol;
  const endIdx = endRow * cols + endCol;
  // Garantiza que los extremos sean transitables aunque caigan dentro de un nodo.
  walkable[startIdx] = 1;
  walkable[endIdx] = 1;

  // A* en 4 direcciones con penalización por giro.
  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const open = new MinHeap();
  gScore[startIdx] = 0;

  const heuristic = (idx: number) => {
    const col = idx % cols;
    const row = (idx - col) / cols;
    return Math.abs(col - endCol) + Math.abs(row - endRow);
  };

  open.push(startIdx, heuristic(startIdx));
  const neighborOffsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let found = false;
  let iterations = 0;
  const maxIterations = cols * rows;
  while (open.size > 0) {
    if (++iterations > maxIterations) break;
    const current = open.pop();
    if (current === endIdx) {
      found = true;
      break;
    }
    const col = current % cols;
    const row = (current - col) / cols;
    const prev = cameFrom[current];
    let prevDX = 0;
    let prevDY = 0;
    if (prev !== -1) {
      const pCol = prev % cols;
      const pRow = (prev - pCol) / cols;
      prevDX = Math.sign(col - pCol);
      prevDY = Math.sign(row - pRow);
    }

    for (const [dx, dy] of neighborOffsets) {
      const nCol = col + dx;
      const nRow = row + dy;
      if (nCol < 0 || nCol >= cols || nRow < 0 || nRow >= rows) continue;
      const nIdx = nRow * cols + nCol;
      if (!walkable[nIdx]) continue;
      const turn = prev !== -1 && (dx !== prevDX || dy !== prevDY) ? TURN_PENALTY : 0;
      const tentative = gScore[current] + 1 + turn;
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative;
        cameFrom[nIdx] = current;
        open.push(nIdx, tentative + heuristic(nIdx));
      }
    }
  }

  if (!found) return null;

  // Reconstruye la ruta de celdas (de destino a origen) y la pasa a mundo.
  const cellPath: Point[] = [];
  let node = endIdx;
  let guard = 0;
  while (node !== -1 && guard++ < cols * rows) {
    const col = node % cols;
    const row = (node - col) / cols;
    cellPath.push({ x: cellX(col), y: cellY(row) });
    if (node === startIdx) break;
    node = cameFrom[node];
  }
  cellPath.reverse();

  // Construye una polilínea ESTRICTAMENTE ortogonal (solo tramos H/V):
  // - sale del handle de origen en su eje (horizontal para Left/Right),
  // - recorre las celdas del A* (ya ortogonales entre sí),
  // - entra al handle de destino en su eje.
  const raw: Point[] = [sourcePoint];

  if (cellPath.length > 0) {
    const first = cellPath[0];
    if (isHorizontal(source.position)) {
      raw.push({ x: first.x, y: sourcePoint.y });
    } else {
      raw.push({ x: sourcePoint.x, y: first.y });
    }
    for (const c of cellPath) raw.push(c);

    const last = cellPath[cellPath.length - 1];
    if (isHorizontal(target.position)) {
      raw.push({ x: last.x, y: targetPoint.y });
    } else {
      raw.push({ x: targetPoint.x, y: last.y });
    }
  } else {
    // Sin celdas intermedias: conector en L entre origen y destino.
    if (isHorizontal(source.position)) {
      raw.push({ x: targetPoint.x, y: sourcePoint.y });
    } else {
      raw.push({ x: sourcePoint.x, y: targetPoint.y });
    }
  }
  raw.push(targetPoint);

  // Fuerza ortogonalidad: ningún tramo puede ser diagonal.
  const orthogonal = enforceOrthogonal(raw);
  const points = simplifyCollinear(orthogonal);
  if (points.length < 2) return null;

  const mid = points[Math.floor(points.length / 2)];
  return {
    svgPath: buildRoundedPath(points, CORNER_RADIUS),
    labelX: mid.x,
    labelY: mid.y,
  };
}

/** Red de seguridad: parte cualquier tramo diagonal en H+V. */
function enforceOrthogonal(points: Point[]): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) {
      out.push({ x: b.x, y: a.y });
    }
    out.push(b);
  }
  return out;
}

function simplifyCollinear(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (prev.x === cur.x && cur.x === next.x) continue;
    if (prev.y === cur.y && cur.y === next.y) continue;
    const dx1 = Math.sign(cur.x - prev.x);
    const dy1 = Math.sign(cur.y - prev.y);
    const dx2 = Math.sign(next.x - cur.x);
    const dy2 = Math.sign(next.y - cur.y);
    if (dx1 === dx2 && dy1 === dy2) continue;
    if (prev.x === cur.x && prev.y === cur.y) continue;
    out.push(cur);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (tail.x !== last.x || tail.y !== last.y) out.push(last);
  return out;
}

function buildRoundedPath(points: Point[], radius: number): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    if (r <= 0.5) {
      d += ` L ${cur.x},${cur.y}`;
      continue;
    }
    const inX = cur.x - ((cur.x - prev.x) / lenIn) * r;
    const inY = cur.y - ((cur.y - prev.y) / lenIn) * r;
    const outX = cur.x + ((next.x - cur.x) / lenOut) * r;
    const outY = cur.y + ((next.y - cur.y) / lenOut) * r;
    d += ` L ${inX},${inY} Q ${cur.x},${cur.y} ${outX},${outY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}
