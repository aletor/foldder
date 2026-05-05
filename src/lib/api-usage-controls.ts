import path from "path";
import { readJsonStore, updateJsonStore } from "@/lib/json-persistence";
import {
  USAGE_SERVICES,
  usageServiceCategory,
  type UsageServiceCategory,
  type UsageServiceId,
} from "@/lib/api-usage";
import { auth } from "@/lib/auth";

export type ApiServiceControl = {
  id: UsageServiceId;
  label: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

type ControlsStore = {
  services: Record<string, ApiServiceControl>;
};

const controlsStoreConfig = {
  createEmpty: (): ControlsStore => ({ services: {} }),
  defaultS3Key: "foldder-meta/api-service-controls.json",
  localPath: path.join(process.cwd(), "data", "api-service-controls.json"),
  s3KeyEnv: "FOLDDER_API_CONTROLS_S3_KEY",
};

const DEFAULT_PAID_API_ALLOWED_EMAILS = [
  "alejandro.tornero@gmail.com",
  "belenmpascualh@gmail.com",
];

const PAYWALLED_API_CATEGORIES = new Set<UsageServiceCategory>([
  "ia-text",
  "ia-image",
  "ia-video",
  "visual-analysis",
  "brain",
  "embeddings",
  "external-api",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function paidApiAllowedEmails(): Set<string> {
  const configured = (process.env.FOLDDER_PAID_API_ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
  const emails = configured.length > 0 ? configured : DEFAULT_PAID_API_ALLOWED_EMAILS;
  return new Set(emails);
}

function isPaidApiService(serviceId: UsageServiceId): boolean {
  return PAYWALLED_API_CATEGORIES.has(usageServiceCategory(serviceId));
}

async function assertPaidApiUserAllowed(serviceId: UsageServiceId): Promise<void> {
  if (!isPaidApiService(serviceId)) return;
  if (process.env.NODE_ENV !== "production") return;
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email || !paidApiAllowedEmails().has(email)) {
    const label = USAGE_SERVICES.find((s) => s.id === serviceId)?.label || serviceId;
    throw new ApiServiceDisabledError(serviceId, label, "paid_api_beta_allowlist");
  }
}

function defaultControl(serviceId: UsageServiceId): ApiServiceControl {
  const service = USAGE_SERVICES.find((s) => s.id === serviceId)!;
  return {
    id: service.id,
    label: service.label,
    enabled: true,
    updatedAt: nowIso(),
    updatedBy: "system-default",
  };
}

function normalizeControls(store: ControlsStore): Record<UsageServiceId, ApiServiceControl> {
  const out = {} as Record<UsageServiceId, ApiServiceControl>;
  for (const service of USAGE_SERVICES) {
    const existing = store.services[service.id];
    out[service.id] = existing
      ? { ...existing, id: service.id, label: service.label }
      : defaultControl(service.id);
  }
  return out;
}

export class ApiServiceDisabledError extends Error {
  constructor(
    public serviceId: UsageServiceId,
    public label: string,
    public reason: "admin_disabled" | "paid_api_beta_allowlist" = "admin_disabled",
  ) {
    super(reason === "paid_api_beta_allowlist" ? `Service not allowed for beta user: ${serviceId}` : `Service disabled: ${serviceId}`);
    this.name = "ApiServiceDisabledError";
  }
}

export async function getApiServiceControls(): Promise<Record<UsageServiceId, ApiServiceControl>> {
  const store = await readJsonStore(controlsStoreConfig);
  return normalizeControls(store);
}

export async function setApiServiceEnabled(
  serviceId: UsageServiceId,
  enabled: boolean,
  updatedBy: string,
): Promise<Record<UsageServiceId, ApiServiceControl>> {
  const next = await updateJsonStore(controlsStoreConfig, async (current) => {
    const normalized = normalizeControls(current);
    normalized[serviceId] = {
      ...normalized[serviceId],
      enabled,
      updatedAt: nowIso(),
      updatedBy,
    };
    return { services: normalized };
  });
  return normalizeControls(next);
}

export async function assertApiServiceEnabled(serviceId: UsageServiceId): Promise<void> {
  await assertPaidApiUserAllowed(serviceId);
  const controls = await getApiServiceControls();
  const row = controls[serviceId];
  if (!row?.enabled) {
    throw new ApiServiceDisabledError(serviceId, row?.label || serviceId, "admin_disabled");
  }
}
