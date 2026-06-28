/**
 * Clonado profundo de objetos del lienzo (Freehand/Designer).
 *
 * Extraído de `FreehandStudio.tsx` para poder testearlo de forma aislada (sin cargar el componente
 * de 30k líneas). Importa SOLO tipos de `../FreehandStudio` (borrados en runtime → sin ciclo) y las
 * utilidades de relleno de `./fill`.
 */
import type {
  AdjustmentLayerObject,
  BooleanGroupObject,
  ClipMaskShape,
  ClippingContainerObject,
  FreehandObject,
  GroupContainerObject,
  PathObject,
  TextObject,
  TextOnPathObject,
} from "../FreehandStudio";
import { cloneFill, migrateFill } from "./fill";

/**
 * Clona en profundidad un objeto y todo su subárbol. `newId` se invoca UNA vez por nodo (raíz + cada
 * descendiente) recibiendo ese nodo, así el llamador decide el id de cada uno: `uid` para ids nuevos,
 * o `(node) => node.id` para conservar el id propio de cada nodo (ver `deepCloneFreehandObjectKeepIds`).
 */
export function deepCloneFreehandObject(
  o: FreehandObject,
  newId: (node: FreehandObject) => string,
): FreehandObject {
  const id = newId(o);
  if (o.type === "path") {
    const p = o as PathObject;
    return {
      ...p,
      id,
      points: p.points.map((pt) => ({
        ...pt,
        anchor: { ...pt.anchor },
        handleIn: { ...pt.handleIn },
        handleOut: { ...pt.handleOut },
      })),
    };
  }
  if (o.type === "booleanGroup") {
    const g = o as BooleanGroupObject;
    return {
      ...g,
      id,
      children: g.children.map((ch) => deepCloneFreehandObject(ch, newId)),
      cachedResult: g.cachedResult,
    };
  }
  if (o.type === "groupContainer") {
    const g = o as GroupContainerObject;
    return {
      ...g,
      id,
      children: g.children.map((ch) => deepCloneFreehandObject(ch, newId)),
    };
  }
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    return {
      ...c,
      id,
      mask: deepCloneFreehandObject(c.mask, newId) as ClipMaskShape,
      content: c.content.map((ch) => deepCloneFreehandObject(ch, newId)),
    };
  }
  if (o.type === "textOnPath") {
    const t = o as TextOnPathObject;
    const guidePath = t.guidePath ? (deepCloneFreehandObject(t.guidePath, newId) as PathObject) : undefined;
    return { ...t, id, guidePath, guidePathId: guidePath?.id ?? t.guidePathId };
  }
  if (o.type === "text") {
    const t = o as TextObject;
    return { ...t, id, fill: cloneFill(migrateFill(t.fill)) };
  }
  if (o.type === "adjustmentLayer") {
    const a = o as AdjustmentLayerObject;
    return {
      ...a,
      id,
      adjustment: { ...a.adjustment, levels: { ...a.adjustment.levels } },
    };
  }
  return { ...o, id, fill: cloneFill(migrateFill(o.fill)) };
}

/**
 * Clona en profundidad conservando el id PROPIO de cada nodo (no el de la raíz).
 *
 * Cuidado histórico: la versión anterior usaba `() => o.id`, que capturaba la RAÍZ, así que al clonar
 * una carpeta TODOS sus hijos heredaban el id de la carpeta → ids duplicados en cada snapshot de
 * carpeta (mover/escalar/rotar) y corrupción del documento. Por eso `newId` recibe cada nodo.
 */
export function deepCloneFreehandObjectKeepIds(o: FreehandObject): FreehandObject {
  return deepCloneFreehandObject(o, (node) => node.id);
}
