"use client";

import type { DesignerPageState } from "../designer/DesignerNode";

export type InspirationLibraryItemKind = "designer-template" | "image" | "flow";

export type InspirationLibraryItem = {
  id: string;
  kind: InspirationLibraryItemKind;
  title: string;
  thumbUrl?: string;
  thumbS3Key?: string;
  pageCount?: number;
  imageUrl?: string;
  imageS3Key?: string;
  width?: number;
  height?: number;
  nodeCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type InspirationFlowPayload = {
  nodes: unknown[];
  edges: unknown[];
};

const LIBRARY_UPDATED_EVENT = "foldder-inspiration-library-updated";

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
  }
  return body;
}

export async function listInspirationLibrary(): Promise<InspirationLibraryItem[]> {
  const res = await fetch("/api/spaces/inspiration-library", { cache: "no-store" });
  const body = await parseJson<{ items: InspirationLibraryItem[] }>(res);
  return Array.isArray(body.items) ? body.items : [];
}

export async function fetchInspirationTemplatePages(id: string): Promise<DesignerPageState[]> {
  const res = await fetch(`/api/spaces/inspiration-library/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const body = await parseJson<{ pages: DesignerPageState[] }>(res);
  return Array.isArray(body.pages) ? body.pages : [];
}

export async function fetchInspirationFlow(id: string): Promise<InspirationFlowPayload> {
  const res = await fetch(`/api/spaces/inspiration-library/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const body = await parseJson<{ flow?: InspirationFlowPayload }>(res);
  return {
    nodes: Array.isArray(body.flow?.nodes) ? body.flow!.nodes : [],
    edges: Array.isArray(body.flow?.edges) ? body.flow!.edges : [],
  };
}

export async function addFlowToLibrary(input: {
  title: string;
  flow: InspirationFlowPayload;
  thumbUrl?: string;
  thumbS3Key?: string;
}): Promise<InspirationLibraryItem> {
  const res = await fetch("/api/spaces/inspiration-library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "flow", ...input }),
  });
  const body = await parseJson<{ item: InspirationLibraryItem }>(res);
  dispatchInspirationLibraryUpdated();
  return body.item;
}

export async function addDesignerTemplateToLibrary(input: {
  title: string;
  thumbUrl: string;
  thumbS3Key?: string;
  pages: DesignerPageState[];
}): Promise<InspirationLibraryItem> {
  const res = await fetch("/api/spaces/inspiration-library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "designer-template", ...input }),
  });
  const body = await parseJson<{ item: InspirationLibraryItem }>(res);
  dispatchInspirationLibraryUpdated();
  return body.item;
}

export async function addImageToLibrary(input: {
  title: string;
  thumbUrl: string;
  thumbS3Key?: string;
  imageUrl: string;
  imageS3Key?: string;
  width?: number;
  height?: number;
}): Promise<InspirationLibraryItem> {
  const res = await fetch("/api/spaces/inspiration-library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "image", ...input }),
  });
  const body = await parseJson<{ item: InspirationLibraryItem }>(res);
  dispatchInspirationLibraryUpdated();
  return body.item;
}

export async function deleteInspirationLibraryItem(id: string): Promise<void> {
  const res = await fetch(`/api/spaces/inspiration-library/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseJson<{ ok: boolean }>(res);
  dispatchInspirationLibraryUpdated();
}

export function dispatchInspirationLibraryUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIBRARY_UPDATED_EVENT));
}

export function subscribeInspirationLibraryUpdated(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LIBRARY_UPDATED_EVENT, callback);
  return () => window.removeEventListener(LIBRARY_UPDATED_EVENT, callback);
}
