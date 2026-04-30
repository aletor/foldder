export type GuionistaFormat = "post" | "article" | "script" | "scenes" | "slides" | "campaign" | "rewrite";
export type GuionistaLanguage = "auto" | "es" | "en" | "ca";
export type GuionistaLength = "short" | "medium" | "long";
export type GuionistaTone = "natural" | "professional" | "premium" | "institutional" | "ironic" | "emotional";
export type GuionistaGoal = "explain" | "convince" | "sell" | "present" | "inspire" | "conversation";
export type GuionistaAssetStatus = "draft" | "final";
export type GuionistaSocialPlatform = "LinkedIn" | "Instagram" | "X" | "Short";
export type GuionistaAiTask = "approaches" | "draft" | "transform" | "social" | "apply_comment" | "apply_comments" | "apply_global_notes";
export type GuionistaReviewCommentStatus = "pending" | "applied" | "resolved";

export type GuionistaSettings = {
  language: GuionistaLanguage;
  length: GuionistaLength;
  tone: GuionistaTone;
  audience: string;
  goal: GuionistaGoal;
  extraInstructions: string;
};

export type GuionistaApproach = {
  id: string;
  title: string;
  idea: string;
  tone: string;
  rationale?: string;
  format?: GuionistaFormat;
};

export type GuionistaVersion = {
  id: string;
  label: string;
  title: string;
  format: GuionistaFormat;
  markdown: string;
  plainText: string;
  createdAt: string;
  sourceAction?: string;
  structured?: Record<string, unknown>;
};

export type GuionistaSocialAdaptation = {
  id: string;
  platform: GuionistaSocialPlatform;
  title: string;
  text: string;
  hashtags?: string[];
  sourceAssetId?: string;
  sourceVersionId?: string;
  createdAt: string;
  updatedAt: string;
  status: GuionistaAssetStatus;
  format: "post";
};

export type GuionistaReviewComment = {
  id: string;
  selectedText: string;
  comment: string;
  status: GuionistaReviewCommentStatus;
  sourceVersionId: string;
  createdAt: string;
  updatedAt: string;
};

export type GuionistaTextAsset = {
  id: string;
  title: string;
  type: GuionistaFormat;
  source: "Guionista";
  createdAt: string;
  updatedAt: string;
  activeVersionId: string;
  versions: GuionistaVersion[];
  status: GuionistaAssetStatus;
  preview: string;
  markdown: string;
  plainText: string;
  nodeId?: string;
  sourceAssetId?: string;
  sourceVersionId?: string;
  platform?: GuionistaSocialPlatform;
  categoryPath: string[];
  structured?: Record<string, unknown>;
  comments?: GuionistaReviewComment[];
  globalAdjustmentNotes?: string;
};

export type GuionistaGeneratedTextAssetsMetadata = {
  version: 1;
  items: GuionistaTextAsset[];
};

export type GuionistaNodeData = {
  label?: string;
  briefing?: string;
  format?: GuionistaFormat;
  settings?: GuionistaSettings;
  approaches?: GuionistaApproach[];
  selectedApproachId?: string;
  activeVersionId?: string;
  versions?: GuionistaVersion[];
  assetId?: string;
  status?: GuionistaAssetStatus;
  value?: string;
  promptValue?: string;
  title?: string;
  updatedAt?: string;
  comments?: GuionistaReviewComment[];
  globalAdjustmentNotes?: string;
};

export type GuionistaBrainContext = {
  enabled: boolean;
  tone?: string[];
  projectContext?: string;
  approvedClaims?: string[];
  avoidPhrases?: string[];
  notes?: string[];
  references?: string[];
  editorialStyle?: string[];
};

export type GuionistaAiRequest = {
  task: GuionistaAiTask;
  briefing?: string;
  format?: GuionistaFormat;
  settings?: GuionistaSettings;
  approach?: GuionistaApproach | null;
  currentVersion?: GuionistaVersion | null;
  action?: string;
  targetFormat?: GuionistaFormat;
  sourceAssetId?: string;
  sourceVersionId?: string;
  brainContext?: GuionistaBrainContext;
  selectedText?: string;
  comment?: GuionistaReviewComment;
  comments?: GuionistaReviewComment[];
  globalNotes?: string;
};

export type GuionistaAiResponse =
  | { task: "approaches"; approaches: GuionistaApproach[] }
  | { task: "draft" | "transform" | "apply_comment" | "apply_comments" | "apply_global_notes"; version: GuionistaVersion }
  | { task: "social"; socialPack: GuionistaSocialAdaptation[] };

export const GUI_FORMAT_LABELS: Record<GuionistaFormat, string> = {
  post: "Post",
  article: "Articulo",
  script: "Guion",
  scenes: "Escenas",
  slides: "Slides",
  campaign: "Campana",
  rewrite: "Reescribir",
};

export const GUI_FORMAT_FOLDERS: Record<GuionistaFormat, string> = {
  post: "Posts",
  article: "Articles",
  script: "Scripts",
  scenes: "Scenes",
  slides: "Slides",
  campaign: "Campaigns",
  rewrite: "Rewrites",
};

export const GUI_DEFAULT_SETTINGS: GuionistaSettings = {
  language: "es",
  length: "medium",
  tone: "natural",
  audience: "",
  goal: "explain",
  extraInstructions: "",
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeGuionistaId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function previewText(text: string, max = 150): string {
  const clean = plainTextFromMarkdown(text || "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function normalizeGuionistaData(raw: unknown): GuionistaNodeData {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const format = isGuionistaFormat(input.format) ? input.format : "post";
  const settings = normalizeGuionistaSettings(input.settings);
  const versions = Array.isArray(input.versions)
    ? input.versions.filter(isGuionistaVersion)
    : [];
  const activeVersionId = typeof input.activeVersionId === "string"
    ? input.activeVersionId
    : versions.at(-1)?.id;
  return {
    label: typeof input.label === "string" ? input.label : "Guionista",
    title: typeof input.title === "string" ? input.title : versions.find((v) => v.id === activeVersionId)?.title,
    briefing: typeof input.briefing === "string" ? input.briefing : "",
    format,
    settings,
    approaches: Array.isArray(input.approaches) ? input.approaches.filter(isGuionistaApproach) : [],
    selectedApproachId: typeof input.selectedApproachId === "string" ? input.selectedApproachId : undefined,
    activeVersionId,
    versions,
    assetId: typeof input.assetId === "string" ? input.assetId : undefined,
    status: input.status === "final" ? "final" : "draft",
    value: typeof input.value === "string" ? input.value : versions.find((v) => v.id === activeVersionId)?.markdown ?? "",
    promptValue: typeof input.promptValue === "string" ? input.promptValue : versions.find((v) => v.id === activeVersionId)?.markdown ?? "",
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : nowIso(),
    comments: Array.isArray(input.comments) ? input.comments.filter(isGuionistaReviewComment) : [],
    globalAdjustmentNotes: typeof input.globalAdjustmentNotes === "string" ? input.globalAdjustmentNotes : "",
  };
}

export function normalizeGuionistaSettings(raw: unknown): GuionistaSettings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    language: input.language === "auto" || input.language === "en" || input.language === "ca" || input.language === "es" ? input.language : GUI_DEFAULT_SETTINGS.language,
    length: input.length === "short" || input.length === "long" || input.length === "medium" ? input.length : GUI_DEFAULT_SETTINGS.length,
    tone: input.tone === "professional" || input.tone === "premium" || input.tone === "institutional" || input.tone === "ironic" || input.tone === "emotional" || input.tone === "natural" ? input.tone : GUI_DEFAULT_SETTINGS.tone,
    audience: typeof input.audience === "string" ? input.audience : "",
    goal: input.goal === "convince" || input.goal === "sell" || input.goal === "present" || input.goal === "inspire" || input.goal === "conversation" || input.goal === "explain" ? input.goal : GUI_DEFAULT_SETTINGS.goal,
    extraInstructions: typeof input.extraInstructions === "string" ? input.extraInstructions : "",
  };
}

export function isGuionistaFormat(value: unknown): value is GuionistaFormat {
  return value === "post" || value === "article" || value === "script" || value === "scenes" || value === "slides" || value === "campaign" || value === "rewrite";
}

function isGuionistaApproach(value: unknown): value is GuionistaApproach {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string" && typeof row.idea === "string" && typeof row.tone === "string";
}

function isGuionistaVersion(value: unknown): value is GuionistaVersion {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string" && typeof row.markdown === "string" && isGuionistaFormat(row.format);
}

function isGuionistaReviewComment(value: unknown): value is GuionistaReviewComment {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.selectedText === "string" &&
    typeof row.comment === "string" &&
    (row.status === "pending" || row.status === "applied" || row.status === "resolved") &&
    typeof row.sourceVersionId === "string" &&
    typeof row.createdAt === "string" &&
    typeof row.updatedAt === "string"
  );
}

export function getGuionistaTextAssetsFromMetadata(metadata: unknown): GuionistaGeneratedTextAssetsMetadata {
  const source = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const raw = source.generatedTextAssets;
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(input.items) ? input.items.filter(isGuionistaTextAsset) : [];
  return { version: 1, items };
}

export function setGuionistaTextAssetsInMetadata(
  metadata: Record<string, unknown>,
  assets: GuionistaGeneratedTextAssetsMetadata,
): Record<string, unknown> {
  return {
    ...metadata,
    generatedTextAssets: {
      version: 1,
      items: assets.items.slice(0, 250),
    },
  };
}

export function upsertGuionistaTextAsset(
  assets: GuionistaGeneratedTextAssetsMetadata,
  asset: GuionistaTextAsset,
): GuionistaGeneratedTextAssetsMetadata {
  const others = assets.items.filter((item) => item.id !== asset.id);
  return { version: 1, items: [asset, ...others].slice(0, 250) };
}

export function isGuionistaTextAsset(value: unknown): value is GuionistaTextAsset {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    isGuionistaFormat(row.type) &&
    row.source === "Guionista" &&
    typeof row.activeVersionId === "string" &&
    Array.isArray(row.versions)
  );
}

export function buildGuionistaAssetFromVersion(args: {
  existing?: GuionistaTextAsset | null;
  nodeId?: string;
  format: GuionistaFormat;
  title: string;
  version: GuionistaVersion;
  versions: GuionistaVersion[];
  status?: GuionistaAssetStatus;
  sourceAssetId?: string;
  sourceVersionId?: string;
  platform?: GuionistaSocialPlatform;
  comments?: GuionistaReviewComment[];
  globalAdjustmentNotes?: string;
}): GuionistaTextAsset {
  const now = nowIso();
  const id = args.existing?.id ?? makeGuionistaId("gui_asset");
  const markdown = args.version.markdown;
  return {
    id,
    title: args.title.trim() || args.version.title || GUI_FORMAT_LABELS[args.format],
    type: args.format,
    source: "Guionista",
    createdAt: args.existing?.createdAt ?? now,
    updatedAt: now,
    activeVersionId: args.version.id,
    versions: args.versions,
    status: args.status ?? args.existing?.status ?? "draft",
    preview: previewText(markdown),
    markdown,
    plainText: plainTextFromMarkdown(markdown),
    nodeId: args.nodeId ?? args.existing?.nodeId,
    sourceAssetId: args.sourceAssetId ?? args.existing?.sourceAssetId,
    sourceVersionId: args.sourceVersionId ?? args.existing?.sourceVersionId,
    platform: args.platform ?? args.existing?.platform,
    categoryPath: ["Generated Media", "Texts", "Guionista", GUI_FORMAT_FOLDERS[args.format]],
    structured: args.version.structured ?? args.existing?.structured,
    comments: args.comments ?? args.existing?.comments ?? [],
    globalAdjustmentNotes: args.globalAdjustmentNotes ?? args.existing?.globalAdjustmentNotes ?? "",
  };
}
