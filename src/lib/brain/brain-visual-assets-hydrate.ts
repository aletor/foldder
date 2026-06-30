import type {
  BrainVisualStyleSlotKey,
  KnowledgeDocumentEntry,
  ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";
import { getPresignedUrl } from "@/lib/s3-utils";
import { canUserAccessKnowledgeFileKey } from "@/lib/spaces-access-control";

const VISUAL_STYLE_SLOT_KEYS: readonly BrainVisualStyleSlotKey[] = [
  "protagonist",
  "environment",
  "textures",
  "people",
  "objects",
];

function isKnowledgeImageDoc(d: KnowledgeDocumentEntry): boolean {
  const mime = (d.mime ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (d.type === "image") return true;
  if (d.format === "image") return true;
  return false;
}

function hasVisionReadyUrl(dataUrl?: string, httpsUrl?: string): boolean {
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) return true;
  if (typeof httpsUrl === "string" && /^https:\/\//i.test(httpsUrl.trim())) return true;
  return false;
}

/**
 * Antes de visión remota (Gemini/OpenAI): asegura `https` descargable para refs que solo tienen clave S3.
 * No persiste nada; solo muta una copia en memoria para esta petición.
 */
async function canHydrateKey(key: string, ownerEmail?: string): Promise<boolean> {
  if (!ownerEmail) return false;
  return canUserAccessKnowledgeFileKey(ownerEmail, key);
}

export async function hydrateProjectAssetsForBrainVision(
  assets: ProjectAssetsMetadata,
  ownerEmail?: string,
): Promise<ProjectAssetsMetadata> {
  const vs = assets.strategy.visualStyle;
  const nextStyle = {
    protagonist: { ...vs.protagonist },
    environment: { ...vs.environment },
    textures: { ...vs.textures },
    people: { ...vs.people },
    objects: { ...vs.objects },
  };
  for (const key of VISUAL_STYLE_SLOT_KEYS) {
    const slot = nextStyle[key];
    const u = slot.imageUrl?.trim() ?? "";
    if (u.startsWith("data:image") || /^https:\/\//i.test(u)) continue;
    const s3 = slot.imageS3Key?.trim();
    if (!s3) continue;
    try {
      if (!(await canHydrateKey(s3, ownerEmail))) continue;
      nextStyle[key] = { ...slot, imageUrl: await getPresignedUrl(s3) };
    } catch {
      /* sin credenciales S3 o objeto inexistente */
    }
  }

  const documents = await Promise.all(
    assets.knowledge.documents.map(async (d) => {
      if (!isKnowledgeImageDoc(d)) return d;
      if (hasVisionReadyUrl(d.dataUrl, d.originalSourceUrl)) return d;
      const key = d.s3Path?.trim();
      if (!key) return d;
      try {
        if (!(await canHydrateKey(key, ownerEmail))) return d;
        const url = await getPresignedUrl(key);
        return { ...d, originalSourceUrl: url };
      } catch {
        return d;
      }
    }),
  );

  return {
    ...assets,
    strategy: { ...assets.strategy, visualStyle: nextStyle },
    knowledge: { ...assets.knowledge, documents },
  };
}
