/**
 * BrandKit — operaciones puras (sin React, sin I/O).
 *
 * Puente clave: un BrandKit conectado a un Designer (o a Populate) aporta sus campos como
 * CONSTANTES del Dataset, con id namespaced `bk:<nodeId>:<fieldId>`. Así toda la resolución
 * de bindings existente (que opera sobre `Dataset` + `rowIndex`) funciona sin cambiar firmas:
 * un binding `source: "node"` se resuelve como una constante con ese id namespaced.
 */

import { emptyValueForType } from "@/app/spaces/dataset/dataset-logic";
import type { Constants, Dataset, FieldDef, FieldType, FieldValue } from "@/app/spaces/dataset/dataset-types";
import { BRANDKIT_SCHEMA } from "./brandkit-types";

/** Constantes por defecto de un BrandKit nuevo (4 campos vacíos). */
export function createDefaultBrandKit(): Constants {
  const values: Record<string, FieldValue> = {};
  for (const field of BRANDKIT_SCHEMA) {
    // Color vacío (no `#000000`) para que "relleno" sea significativo en un kit nuevo.
    values[field.id] =
      field.type === "color"
        ? { type: "color", value: "" }
        : emptyValueForType(field.type, field.options);
  }
  return { fields: BRANDKIT_SCHEMA.map((f) => ({ ...f })), values };
}

/** Normaliza un BrandKit asegurando los 4 campos fijos y un valor por campo. */
export function normalizeBrandKit(brand: Constants | undefined | null): Constants {
  const base = createDefaultBrandKit();
  if (!brand) return base;
  const values: Record<string, FieldValue> = { ...base.values };
  for (const field of BRANDKIT_SCHEMA) {
    const existing = brand.values?.[field.id];
    if (existing && existing.type === field.type) values[field.id] = existing;
  }
  return { fields: base.fields, values };
}

/** Id de constante namespaced para un campo de un BrandKit concreto. */
export function brandKitConstantId(nodeId: string, fieldId: string): string {
  return `bk:${nodeId}:${fieldId}`;
}

/** ¿Este id de constante proviene de un BrandKit? */
export function isBrandKitConstantId(constantId: string): boolean {
  return constantId.startsWith("bk:");
}

export interface ConnectedBrandKit {
  nodeId: string;
  brand: Constants;
}

/** ¿Tiene el BrandKit algún campo con contenido (para mostrar "conectado · N")? */
export function brandKitFilledFieldCount(brand: Constants | undefined | null): number {
  const norm = normalizeBrandKit(brand);
  let n = 0;
  for (const field of BRANDKIT_SCHEMA) {
    const v = norm.values[field.id];
    if (!v) continue;
    if (v.type === "image") {
      if (v.url?.trim() || v.assetId?.trim()) n += 1;
    } else if (v.type === "text" || v.type === "color" || v.type === "select" || v.type === "url") {
      if (v.value.trim()) n += 1;
    } else {
      n += 1;
    }
  }
  return n;
}

/**
 * Inyecta los campos de los BrandKits conectados como constantes (namespaced) en un Dataset.
 * Si `base` es null, devuelve un Dataset sintético solo-constantes. No muta `base`.
 */
export function mergeBrandKitsIntoConstants(
  base: Dataset | null | undefined,
  kits: readonly ConnectedBrandKit[],
): Dataset {
  const now = new Date().toISOString();
  const baseConstants: Constants = base?.constants ?? { fields: [], values: {} };

  const extraFields: FieldDef[] = [];
  const extraValues: Record<string, FieldValue> = {};
  for (const kit of kits) {
    const brand = normalizeBrandKit(kit.brand);
    for (const field of BRANDKIT_SCHEMA) {
      const id = brandKitConstantId(kit.nodeId, field.id);
      extraFields.push({ ...field, id, key: id });
      extraValues[id] = brand.values[field.id] ?? emptyValueForType(field.type, field.options);
    }
  }

  const mergedConstants: Constants = {
    fields: [...baseConstants.fields, ...extraFields],
    values: { ...baseConstants.values, ...extraValues },
  };

  if (base) {
    return { ...base, constants: mergedConstants };
  }

  return {
    id: "__brandkit_synthetic__",
    name: "BrandKit",
    scope: "local",
    lists: [],
    constants: mergedConstants,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

/** Marca de Brain (`project.metadata.assets.brand`) en su forma mínima vinculable. */
export interface BrainBrandLike {
  logoPositive?: string | null;
  logoNegative?: string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  colorAccent?: string | null;
}

/**
 * Inyecta la MARCA de un nodo Brain conectado (logo + colores) como constantes vinculables en el
 * Designer, reutilizando el mismo puente que BrandKit (id namespaced `bk:<brainNodeId>:<campo>`).
 * Así un mismo color/logo editado UNA vez en Brain se vincula a cualquier objeto del Designer.
 * Solo aporta los campos con contenido (evita opciones vacías en el selector). No muta `base`.
 */
export function mergeBrainBrandIntoConstants(
  base: Dataset | null | undefined,
  brainNodeId: string,
  brand: BrainBrandLike | null | undefined,
): Dataset | null {
  if (!brand) return base ?? null;
  const logo = (brand.logoPositive || brand.logoNegative || "").trim();
  const primary = (brand.colorPrimary || "").trim();
  const secondary = (brand.colorSecondary || "").trim();
  const accent = (brand.colorAccent || "").trim();

  const slots: Array<{ fieldId: string; label: string; type: FieldType; value: FieldValue }> = [];
  if (logo) {
    slots.push({ fieldId: "logo", label: "Logo", type: "image", value: { type: "image", assetId: "", url: logo } });
  }
  if (primary) {
    slots.push({ fieldId: "primaryColor", label: "Color primario", type: "color", value: { type: "color", value: primary } });
  }
  if (secondary) {
    slots.push({ fieldId: "secondaryColor", label: "Color secundario", type: "color", value: { type: "color", value: secondary } });
  }
  if (accent) {
    slots.push({ fieldId: "accentColor", label: "Color de acento", type: "color", value: { type: "color", value: accent } });
  }
  if (slots.length === 0) return base ?? null;

  const baseConstants: Constants = base?.constants ?? { fields: [], values: {} };
  const extraFields: FieldDef[] = [];
  const extraValues: Record<string, FieldValue> = {};
  for (const slot of slots) {
    const id = brandKitConstantId(brainNodeId, slot.fieldId);
    extraFields.push({ id, key: id, label: slot.label, type: slot.type, required: false });
    extraValues[id] = slot.value;
  }

  const mergedConstants: Constants = {
    fields: [...baseConstants.fields, ...extraFields],
    values: { ...baseConstants.values, ...extraValues },
  };

  if (base) return { ...base, constants: mergedConstants };

  const now = new Date().toISOString();
  return {
    id: "__brain_brand_synthetic__",
    name: "BrandKit",
    scope: "local",
    lists: [],
    constants: mergedConstants,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

/** Firma estable de la marca de Brain (para detectar cambios y re-aplicar). */
export function brainBrandSignature(brainNodeId: string | null, brand: BrainBrandLike | null | undefined): string {
  if (!brainNodeId || !brand) return "";
  return [
    brainNodeId,
    brand.logoPositive ?? "",
    brand.logoNegative ?? "",
    brand.colorPrimary ?? "",
    brand.colorSecondary ?? "",
    brand.colorAccent ?? "",
  ].join("|");
}

/** Firma estable del contenido de los BrandKits conectados (para detectar cambios y re-aplicar). */
export function brandKitsSignature(kits: readonly ConnectedBrandKit[]): string {
  return kits
    .map((kit) => {
      const brand = normalizeBrandKit(kit.brand);
      const parts = BRANDKIT_SCHEMA.map((f) => {
        const v = brand.values[f.id];
        if (!v) return "";
        return v.type === "image" ? v.url ?? "" : v.type === "video" ? v.url ?? "" : String((v as { value?: unknown }).value ?? "");
      });
      return `${kit.nodeId}=${parts.join("|")}`;
    })
    .join(";");
}
