import type { VisualCapsule, VisualCapsuleSuggestion } from "../project-assets-metadata";
import type { VisualDnaSlot } from "@/lib/brain/visual-dna-slot/types";
import type {
  BrainVisualCapsuleSelection,
  BrainVisualCapsuleSelectionPart,
} from "@/lib/brain/build-brain-visual-prompt-context";

const BRAIN_VISUAL_LOOK_PARTS: Array<{
  id: BrainVisualCapsuleSelectionPart;
  label: string;
  description: string;
}> = [
  {
    id: "person",
    label: "Persona",
    description: "Presencia, actitud, gesto, estilo de persona o interacción. No copia una identidad exacta.",
  },
  {
    id: "texture",
    label: "Textura",
    description: "Materiales, superficies, grano, tejido, fondo o tactilidad visual.",
  },
  {
    id: "object",
    label: "Objeto",
    description: "Props, producto, elementos físicos o detalles característicos.",
  },
  {
    id: "environment",
    label: "Entorno",
    description: "Lugar, ambiente, escena, luz o contexto espacial.",
  },
  {
    id: "palette",
    label: "Paleta",
    description: "Colores dominantes, temperatura, contraste y atmósfera cromática.",
  },
  {
    id: "full_look",
    label: "Look completo",
    description: "Usa la cápsula completa como referencia visual dominante.",
  },
];

type BrainVisualLookExample = {
  id: string;
  title: string;
  description: string;
  prompt?: string;
  imageUrl?: string;
};

export function brainVisualLookPartLabel(part: BrainVisualCapsuleSelectionPart): string {
  return BRAIN_VISUAL_LOOK_PARTS.find((p) => p.id === part)?.label ?? "Look";
}

function visualCapsuleIsUsableInDesigner(capsule: VisualCapsule): boolean {
  return (
    capsule.status !== "archived" &&
    capsule.status !== "promoted_partial" &&
    capsule.analysisStatus !== "analyzing" &&
    capsule.analysisStatus !== "error"
  );
}

function isPendingBrainVisualLookText(value?: string | null): boolean {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return false;
  return (
    text.includes("preparando análisis visual") ||
    text.includes("capsula visual pendiente") ||
    text.includes("cápsula visual pendiente") ||
    text.includes("pendiente de análisis")
  );
}

function hasUsableBrainVisualLookText(value?: string | null): boolean {
  const text = (value ?? "").trim();
  return text.length > 0 && !isPendingBrainVisualLookText(text);
}

const BRAIN_VISUAL_LOOK_PERSON_OR_CLOTHING_RE =
  /\b(hombre|mujer|persona|personas|rostro|cara|barba|sonrisa|modelo|m[uú]sico|cantante|traje|chaqueta|camisa|corbata|vestuario|vestimenta|ropa|cuello|manos?|people|person|man|woman|face|beard|musician|singer|jacket|shirt|suit|clothing|wardrobe|outfit)\b/i;
const BRAIN_VISUAL_LOOK_OBJECT_RE =
  /\b(smartphone|tel[eé]fono|m[oó]vil|dispositivo|producto|objeto|pantalla|tarjeta|qr|cadena|anillo|formas? geom[eé]tricas?|guitarra|instrumento|sombrero|botas?|serape|manta|textil|botella|vaso|taza|bolso|bolsa|zapato|zapatilla|bal[oó]n|pelota|device|phone|object|product|screen|chain|ring|guitar|instrument|hat|boots?|blanket|textile|bottle|cup|bag|shoe|ball)\b/i;
const BRAIN_VISUAL_LOOK_ENVIRONMENT_RE =
  /\b(entorno|fondo|espacio|interior|exterior|edificio|arquitectura|oficina|sala|pasillo|terminal|aeropuerto|servidor|data\s*center|datacenter|luz|ambiente|paisaje|desierto|cactus|saguaro|calle|fachada|patio|pueblo|muro|pared|suelo|horizonte|environment|background|building|office|server|landscape|desert|street|facade|courtyard|wall)\b/i;
const BRAIN_VISUAL_LOOK_TEXTURE_RE =
  /\b(textura|material|superficie|metal|vidrio|tela|tejido|fibra|grano|gradiente|degradado|malla|red|cactus|saguaro|espinas?|estr[ií]as?|serape|manta|rayas?|lana|estuco|terroso|granulada|texture|material|surface|metal|glass|fabric|grain|gradient|spines?|stripes?|woven|stucco)\b/i;

function brainVisualLookTextMatchesPart(text: string, part: BrainVisualCapsuleSelectionPart): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (part === "full_look" || part === "palette" || part === "person") return true;
  if (BRAIN_VISUAL_LOOK_PERSON_OR_CLOTHING_RE.test(clean)) return false;
  if (part === "object") return BRAIN_VISUAL_LOOK_OBJECT_RE.test(clean);
  if (part === "environment") return BRAIN_VISUAL_LOOK_ENVIRONMENT_RE.test(clean);
  if (part === "texture") return BRAIN_VISUAL_LOOK_TEXTURE_RE.test(clean);
  return true;
}

function visualCapsuleSuggestionToLookExample(item: VisualCapsuleSuggestion, index: number): BrainVisualLookExample {
  const rawDescription = item.description?.trim() || item.prompt?.trim() || "";
  return {
    id: item.id,
    title: item.title?.trim() || `Ejemplo ${index + 1}`,
    description: hasUsableBrainVisualLookText(rawDescription) ? rawDescription : "Referencia visual del mosaico.",
    ...(item.prompt?.trim() ? { prompt: item.prompt.trim() } : {}),
    ...(item.imageUrl?.trim() ? { imageUrl: item.imageUrl.trim() } : {}),
  };
}

function compactBrainVisualLookText(parts: Array<string | undefined | null>, maxChars = 520): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const text = (raw ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.join(" · ").slice(0, maxChars);
}

function brainVisualLookExamplesFromSlotSection(
  slot: VisualDnaSlot | null | undefined,
  kind: VisualCapsuleSuggestion["kind"],
  section: VisualDnaSlot["people"] | undefined,
): BrainVisualLookExample[] {
  if (!slot || !section) return [];
  return ([section.same, section.similar] as const)
    .map((asset, index): BrainVisualLookExample | null => {
      const description = compactBrainVisualLookText([asset?.description, asset?.prompt, section.notes]);
      if (!asset?.imageUrl && !hasUsableBrainVisualLookText(description)) return null;
      const title = asset?.role === "similar" || index === 1 ? "Variación compatible" : "Ejemplo principal";
      return {
        id: `${slot.id}_${kind}_${index === 1 ? "similar" : "same"}`,
        title,
        description: hasUsableBrainVisualLookText(description) ? description : "Referencia visual del mosaico.",
        ...(asset?.prompt?.trim() ? { prompt: asset.prompt.trim() } : {}),
        ...(asset?.imageUrl?.trim() ? { imageUrl: asset.imageUrl.trim() } : {}),
      };
    })
    .filter((item): item is BrainVisualLookExample => Boolean(item))
    .slice(0, 2);
}

function findVisualDnaSlotForCapsule(
  capsule: VisualCapsule | null | undefined,
  slots: readonly VisualDnaSlot[] | undefined,
): VisualDnaSlot | null {
  if (!capsule || !slots?.length) return null;
  return (
    slots.find((slot) => capsule.sourceVisualDnaSlotId && slot.id === capsule.sourceVisualDnaSlotId) ??
    slots.find((slot) => capsule.sourceImageId && slot.sourceDocumentId === capsule.sourceImageId) ??
    slots.find((slot) => capsule.sourceImageId && slot.sourceImageId === capsule.sourceImageId) ??
    null
  );
}

function fallbackVisualLookExample(
  capsule: VisualCapsule,
  slot: VisualDnaSlot | null,
  part: Exclude<BrainVisualCapsuleSelectionPart, "palette" | "full_look">,
): BrainVisualLookExample[] {
  const partLabel = brainVisualLookPartLabel(part);
  const mosaicUrl = slot?.mosaic.imageUrl || capsule.mosaicImageUrl;
  if (mosaicUrl) {
    const labelByPart: Record<typeof part, string> = {
      person: "PEOPLE / PERSONAS",
      texture: "TEXTURES / TEXTURAS",
      object: "OBJECTS / OBJETOS",
      environment: "ENVIRONMENTS / ENTORNOS",
    };
    const promptByPart: Record<typeof part, string> = {
      person:
        "Usa únicamente las celdas de personas/interacción del mosaico ADN como referencia: actitud, gesto, composición humana y relación espacial. No copies identidades ni rostros exactos.",
      texture:
        "Usa únicamente las celdas TEXTURES/TEXTURAS del mosaico ADN como referencia: materiales, tejido, grano, superficie, tactilidad y atmósfera material.",
      object:
        "Usa únicamente las celdas OBJECTS/OBJETOS del mosaico ADN como referencia: props, elementos físicos, detalles de producto y lenguaje objetual.",
      environment:
        "Usa únicamente las celdas ENVIRONMENTS/ENTORNOS del mosaico ADN como referencia: espacio, luz, escala, atmósfera y contexto visual.",
    };
    const titlesByPart: Record<typeof part, [string, string]> = {
      person: ["Persona / interacción A", "Persona / interacción B"],
      texture: ["Textura izquierda del mosaico", "Textura derecha del mosaico"],
      object: ["Objeto izquierdo del mosaico", "Objeto derecho del mosaico"],
      environment: ["Entorno izquierdo del mosaico", "Entorno derecho del mosaico"],
    };
    return titlesByPart[part].map((title, index) => ({
      id: `${capsule.id}_${part}_mosaic_focus_${index + 1}`,
      title,
      description: `Referencia desde la sección ${labelByPart[part]} del mosaico ADN.`,
      prompt: `${promptByPart[part]} Prioriza la ${index === 0 ? "primera" : "segunda"} celda visible de esa sección si el mosaico muestra dos ejemplos.`,
      imageUrl: mosaicUrl,
    }));
  }
  const section =
    part === "person"
      ? slot?.people
      : part === "texture"
        ? slot?.textures
        : part === "object"
          ? slot?.objects
          : slot?.environments;
  const description = compactBrainVisualLookText([
    section?.notes,
    capsule.heroConclusion,
    capsule.summary,
    capsule.visualTraits?.join(", "),
    capsule.moodTags?.join(", "),
  ]);
  if (!hasUsableBrainVisualLookText(description) && !capsule.sourceImageUrl && !capsule.mosaicImageUrl) return [];
  return [
    {
      id: `${capsule.id}_${part}_focus`,
      title: `${partLabel} del look`,
      description: hasUsableBrainVisualLookText(description)
        ? description
        : "Usa la imagen fuente de esta cápsula como dirección visual focal para esta categoría.",
      imageUrl: capsule.sourceImageUrl || capsule.mosaicImageUrl,
    },
  ];
}

export function visualCapsuleHasUsableDesignerDna(capsule: VisualCapsule, slots?: readonly VisualDnaSlot[]): boolean {
  const slot = findVisualDnaSlotForCapsule(capsule, slots);
  const usableText = [
    capsule.summary,
    capsule.heroConclusion,
    capsule.moodTags?.join(", "),
    capsule.visualTraits?.join(", "),
    slot?.hero.description,
    slot?.hero.conclusion,
    slot?.generalStyle.summary,
    slot?.people.notes,
    slot?.textures.notes,
    slot?.objects.notes,
    slot?.environments.notes,
    slot?.palette.colorNotes,
  ].some(hasUsableBrainVisualLookText);
  const usablePalette = Boolean(capsule.palette.length || slot?.palette.dominantColors.length);
  const usableReferenceImage = Boolean(capsule.sourceImageUrl || capsule.mosaicImageUrl || slot?.sourceImageUrl || slot?.mosaic.imageUrl);
  return visualCapsuleIsUsableInDesigner(capsule) && (usableText || usablePalette || usableReferenceImage);
}

export function brainVisualCapsuleSelectionIsUsable(selection: BrainVisualCapsuleSelection | null): boolean {
  if (!selection) return true;
  return Boolean(
    hasUsableBrainVisualLookText(selection.selectedExampleDescription) ||
      hasUsableBrainVisualLookText(selection.selectedExamplePrompt) ||
      hasUsableBrainVisualLookText(selection.capsuleSummary) ||
      hasUsableBrainVisualLookText(selection.heroConclusion) ||
      selection.selectedExampleImageUrl,
  );
}

export function visualCapsuleExamplesForPart(
  capsule: VisualCapsule | null | undefined,
  part: BrainVisualCapsuleSelectionPart | null,
  slots?: readonly VisualDnaSlot[],
): BrainVisualLookExample[] {
  if (!capsule || !part) return [];
  const slot = findVisualDnaSlotForCapsule(capsule, slots);
  if (part === "person") {
    const direct = capsule.persons.slice(0, 2).map(visualCapsuleSuggestionToLookExample);
    return direct.length ? direct : brainVisualLookExamplesFromSlotSection(slot, "person", slot?.people).concat(fallbackVisualLookExample(capsule, slot, "person")).slice(0, 2);
  }
  if (part === "texture") {
    const direct = capsule.textures
      .slice(0, 2)
      .map(visualCapsuleSuggestionToLookExample)
      .filter((example) => brainVisualLookTextMatchesPart(`${example.description} ${example.prompt ?? ""}`, "texture"));
    const mosaicFallback = fallbackVisualLookExample(capsule, slot, "texture");
    return direct.length ? direct : brainVisualLookExamplesFromSlotSection(slot, "texture", slot?.textures).concat(mosaicFallback).slice(0, 2);
  }
  if (part === "object") {
    const direct = capsule.objects
      .slice(0, 2)
      .map(visualCapsuleSuggestionToLookExample)
      .filter((example) => brainVisualLookTextMatchesPart(`${example.description} ${example.prompt ?? ""}`, "object"));
    const mosaicFallback = fallbackVisualLookExample(capsule, slot, "object");
    return direct.length ? direct : brainVisualLookExamplesFromSlotSection(slot, "object", slot?.objects).concat(mosaicFallback).slice(0, 2);
  }
  if (part === "environment") {
    const direct = capsule.environments
      .slice(0, 2)
      .map(visualCapsuleSuggestionToLookExample)
      .filter((example) => brainVisualLookTextMatchesPart(`${example.description} ${example.prompt ?? ""}`, "environment"));
    const mosaicFallback = fallbackVisualLookExample(capsule, slot, "environment");
    return direct.length ? direct : brainVisualLookExamplesFromSlotSection(slot, "environment", slot?.environments).concat(mosaicFallback).slice(0, 2);
  }
  if (part === "palette") {
    const colors = [
      ...capsule.palette.map((p) => p.hex),
      ...(slot?.palette.dominantColors ?? []),
    ]
      .filter(Boolean)
      .filter((hex, index, arr) => arr.findIndex((x) => x.toLowerCase() === hex.toLowerCase()) === index)
      .slice(0, 7);
    if (!colors.length) {
      const mosaicUrl = slot?.mosaic.imageUrl || capsule.mosaicImageUrl;
      if (mosaicUrl) {
        return [
          {
            id: `${capsule.id}_palette_mosaic_focus`,
            title: "Paleta del mosaico",
            description: "Usa la zona PALETA del mosaico ADN como referencia cromática.",
            prompt:
              "Usa únicamente la paleta visible en el mosaico ADN como referencia: colores dominantes, temperatura, contraste y atmósfera cromática. No uses paleta de marca ni otros looks.",
            imageUrl: mosaicUrl,
          },
        ];
      }
      const description = compactBrainVisualLookText([
        slot?.palette.colorNotes,
        capsule.summary,
        capsule.heroConclusion,
        capsule.moodTags?.join(", "),
      ]);
      if (!description && !capsule.sourceImageUrl && !capsule.mosaicImageUrl) return [];
      return [
        {
          id: `${capsule.id}_palette_atmosphere`,
          title: "Atmósfera cromática",
          description: description || "Usa la imagen fuente como guía de temperatura, contraste y atmósfera cromática.",
          imageUrl: capsule.sourceImageUrl || capsule.mosaicImageUrl,
        },
      ];
    }
    return [
      {
        id: `${capsule.id}_palette_main`,
        title: "Paleta principal",
        description: compactBrainVisualLookText([
          `Colores dominantes: ${colors.join(", ")}.`,
          slot?.palette.colorNotes,
          capsule.moodTags?.join(", "),
        ]),
      },
    ];
  }
  const generalLooks = capsule.generalLooks?.slice(0, 2).map(visualCapsuleSuggestionToLookExample) ?? [];
  if (generalLooks.length) return generalLooks;
  const description = [capsule.summary, capsule.heroConclusion, slot?.hero.conclusion, slot?.hero.description, capsule.visualTraits?.join(", "), capsule.moodTags?.join(", ")]
    .filter(Boolean)
    .join(" · ")
    .trim();
  if (!description && !capsule.sourceImageUrl && !capsule.mosaicImageUrl) return [];
  return [
    {
      id: `${capsule.id}_full_look`,
      title: "Look completo",
      description: description || "Referencia visual completa de la cápsula.",
      imageUrl: slot?.mosaic.imageUrl || capsule.mosaicImageUrl || capsule.sourceImageUrl,
    },
  ];
}

export function buildBrainVisualCapsuleSelection(
  capsule: VisualCapsule,
  part: BrainVisualCapsuleSelectionPart,
  example: BrainVisualLookExample,
): BrainVisualCapsuleSelection {
  return {
    capsuleId: capsule.id,
    capsuleTitle: capsule.title,
    capsuleUpdatedAt: capsule.updatedAt,
    selectedPart: part,
    includeBrandContext: false,
    selectedExampleId: example.id,
    selectedExampleTitle: example.title,
    selectedExampleDescription: example.description,
    ...(example.prompt ? { selectedExamplePrompt: example.prompt } : {}),
    ...(example.imageUrl ? { selectedExampleImageUrl: example.imageUrl } : {}),
    ...(hasUsableBrainVisualLookText(capsule.summary) ? { capsuleSummary: capsule.summary } : {}),
    ...(hasUsableBrainVisualLookText(capsule.heroConclusion) ? { heroConclusion: capsule.heroConclusion } : {}),
  };
}

export function brainVisualCapsuleSelectionFingerprint(selection: BrainVisualCapsuleSelection | null): string {
  if (!selection) return "general";
  return [
    selection.capsuleId,
    selection.capsuleUpdatedAt ?? "",
    selection.selectedPart,
    selection.includeBrandContext ? "brand" : "no_brand",
    selection.selectedExampleId ?? "",
    selection.selectedExampleTitle ?? "",
    selection.selectedExampleDescription ?? "",
    selection.selectedExamplePrompt ?? "",
  ].join("¦");
}
