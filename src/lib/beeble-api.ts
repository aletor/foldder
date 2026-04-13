/** Cliente Beeble vía proxy `/api/beeble/*` (la API key va en el servidor: `BEEBLE_API_KEY`). */

export const BEEBLE_API_PROXY_BASE = "/api/beeble";

export interface BeebleJob {
  id: string;
  status: "in_queue" | "processing" | "completed" | "failed";
  progress: number | null;
  generation_type: "image" | "video" | null;
  alpha_mode: "auto" | "fill" | "select" | "custom" | null;
  output: {
    render: string;
    source: string;
    alpha: string;
  } | null;
  error: string | null;
  created_at: string | null;
  modified_at: string | null;
  completed_at: string | null;
  webhook?: {
    status: "pending" | "delivered" | "failed";
    attempts: number;
    last_error: string | null;
  };
}

export type BeebleAccountInfo = {
  spending_limit?: number;
  spending_used?: number;
  rate_limits?: {
    rpm?: { usage: number; limit: number };
    concurrency?: { usage: number; limit: number };
  };
};

export class BeebleClient {
  constructor(private apiKey: string) {}

  private headers(extra: Record<string, string> = {}): HeadersInit {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...extra,
    };
    const k = this.apiKey.trim();
    if (k) h["x-api-key"] = k;
    return h;
  }

  private url(path: string) {
    const p = path.startsWith("/") ? path.slice(1) : path;
    return `${BEEBLE_API_PROXY_BASE}/${p}`;
  }

  private async parseError(res: Response): Promise<Error> {
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      return new Error(body.message || body.error || `HTTP ${res.status}`);
    } catch {
      return new Error(`HTTP ${res.status}`);
    }
  }

  async createUpload(filename: string): Promise<{
    id: string;
    upload_url: string;
    beeble_uri: string;
  }> {
    const res = await fetch(this.url("uploads"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ filename }),
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json() as Promise<{
      id: string;
      upload_url: string;
      beeble_uri: string;
    }>;
  }

  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  }

  async uploadAndGetUri(file: File): Promise<string> {
    const { upload_url, beeble_uri } = await this.createUpload(file.name);
    await this.uploadFile(upload_url, file);
    return beeble_uri;
  }

  async startGeneration(params: {
    generation_type: "image" | "video";
    source_uri: string;
    alpha_mode: "auto" | "fill" | "select" | "custom";
    prompt?: string;
    reference_image_uri?: string;
    alpha_uri?: string;
    max_resolution?: 720 | 1080;
    callback_url?: string;
    idempotency_key?: string;
  }): Promise<BeebleJob> {
    const res = await fetch(this.url("switchx/generations"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json() as Promise<BeebleJob>;
  }

  async getJob(jobId: string): Promise<BeebleJob> {
    const res = await fetch(this.url(`switchx/generations/${encodeURIComponent(jobId)}`), {
      headers: this.headers(),
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json() as Promise<BeebleJob>;
  }

  async listJobs(): Promise<BeebleJob[]> {
    const res = await fetch(this.url("switchx/generations"), {
      headers: this.headers(),
    });
    if (!res.ok) throw await this.parseError(res);
    const data = (await res.json()) as unknown;
    if (Array.isArray(data)) return data as BeebleJob[];
    if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown }).items)) {
      return (data as { items: BeebleJob[] }).items;
    }
    if (data && typeof data === "object" && "data" in data && Array.isArray((data as { data: unknown }).data)) {
      return (data as { data: BeebleJob[] }).data;
    }
    return [];
  }

  async getAccountInfo(): Promise<BeebleAccountInfo> {
    const res = await fetch(this.url("account/info"), {
      headers: this.headers(),
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json() as Promise<BeebleAccountInfo>;
  }

  async getBillingInfo(): Promise<unknown> {
    const res = await fetch(this.url("account/billing"), {
      headers: this.headers(),
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json();
  }
}

/** Créditos aproximados por bloques de 30 frames (especificación producto). */
export function estimateBeebleCredits(
  maxResolution: 720 | 1080,
  frameCount?: number | null,
): { per30: number; estimated: number; isApprox: boolean } {
  const per30 = maxResolution === 1080 ? 10 : 3;
  const frames = frameCount != null && frameCount > 0 ? frameCount : 30;
  const isApprox = frameCount == null || frameCount <= 0;
  return {
    per30,
    estimated: Math.max(per30, Math.ceil((per30 / 30) * frames)),
    isApprox,
  };
}
