/**
 * Cliente server-side para Vectorizer.AI (L6).
 * Auth: HTTP Basic — API ID + secret en env (nunca en código).
 */

const VECTORIZE_URL = "https://api.vectorizer.ai/api/v1/vectorize";

export type VectorizerCredentials = {
  authorizationHeader: string;
};

export function getVectorizerCredentials(): VectorizerCredentials | null {
  const id = process.env.VECTORIZER_API_ID?.trim();
  const secret = process.env.VECTORIZER_API_SECRET?.trim();
  if (id && secret) {
    return {
      authorizationHeader: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    };
  }

  const basicToken = process.env.VECTORIZER_BASIC_AUTH?.trim();
  if (basicToken) {
    const token = basicToken.startsWith("Basic ") ? basicToken.slice(6) : basicToken;
    return { authorizationHeader: `Basic ${token}` };
  }

  const legacy = process.env.VECTORIZER_API_KEY?.trim();
  if (legacy?.includes(":")) {
    const [legacyId, legacySecret] = legacy.split(":", 2);
    if (legacyId && legacySecret) {
      return {
        authorizationHeader: `Basic ${Buffer.from(`${legacyId}:${legacySecret}`).toString("base64")}`,
      };
    }
  }

  return null;
}

export function isVectorizerConfigured(): boolean {
  return getVectorizerCredentials() !== null;
}

export type VectorizeImageInput = {
  buffer: Buffer;
  filename: string;
  contentType?: string;
  mode?: "production" | "preview" | "test" | "test_preview";
  /** Trazabilidad server-side — no se envía a Vectorizer.AI */
  audit?: {
    reason: string;
    logoSignature?: string;
    cached?: boolean;
  };
};

export async function vectorizeRasterBuffer(input: VectorizeImageInput): Promise<Buffer> {
  const creds = getVectorizerCredentials();
  if (!creds) throw new Error("vectorizer_not_configured");

  const reason = input.audit?.reason ?? "unspecified";
  const logoSignature = input.audit?.logoSignature ?? "—";
  const cached = input.audit?.cached ?? false;
  console.info(`[vectorize] called: reason=${reason} logoSignature=${logoSignature} cached=${cached}`);

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.buffer)], { type: input.contentType || "image/png" });
  form.append("image", blob, input.filename);
  form.append("mode", input.mode ?? "production");
  form.append("output.file_format", "svg");
  form.append("policy.retention_days", "0");

  const response = await fetch(VECTORIZE_URL, {
    method: "POST",
    headers: { Authorization: creds.authorizationHeader },
    body: form,
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`vectorizer_http_${response.status}:${detail || response.statusText}`);
  }

  const svg = Buffer.from(await response.arrayBuffer());
  if (!svg.length) throw new Error("vectorizer_empty_response");
  return svg;
}
