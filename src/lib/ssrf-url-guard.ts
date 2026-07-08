import dns from "node:dns/promises";

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export class SsrfBlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedUrlError";
  }
}

function assertAllowedPort(url: URL): void {
  const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) {
    throw new SsrfBlockedUrlError("Puerto no permitido");
  }
}

/** Valida URL http(s) pública antes de fetch server-side (crawl, proxy, etc.). */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfBlockedUrlError("URL inválida");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedUrlError("Solo http(s)");
  }
  if (url.username || url.password) {
    throw new SsrfBlockedUrlError("Credenciales en URL no permitidas");
  }
  if (!url.hostname || !url.hostname.includes(".")) {
    throw new SsrfBlockedUrlError("Hostname inválido");
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    throw new SsrfBlockedUrlError("Hostname privado o local");
  }

  assertAllowedPort(url);

  const records = await dns.lookup(url.hostname, { all: true }).catch(() => null);
  if (records?.length) {
    for (const record of records) {
      if (isPrivateOrLocalHostname(record.address)) {
        throw new SsrfBlockedUrlError("DNS resuelve a red privada");
      }
    }
  }

  return url;
}
