import { describe, expect, it } from "vitest";
import type { KnowledgeDocumentEntry } from "@/app/spaces/project-assets-metadata";
import {
  isKnowledgeUrlAlreadyIngested,
  normalizeKnowledgeUrlKey,
  normalizeKnowledgeUrlsFromDocuments,
} from "./brain-knowledge-urls";

describe("brain-knowledge-urls", () => {
  it("normalizes URL keys ignoring hash and trailing slash differences", () => {
    expect(normalizeKnowledgeUrlKey("https://example.com/path/")).toBe(
      normalizeKnowledgeUrlKey("https://example.com/path"),
    );
    expect(normalizeKnowledgeUrlKey("https://example.com/page#section")).toBe(
      normalizeKnowledgeUrlKey("https://example.com/page"),
    );
  });

  it("dedupes urls from documents and legacy list", () => {
    const documents = [
      {
        id: "1",
        name: "[URL] Example",
        format: "url",
        originalSourceUrl: "https://example.com/about/",
      },
    ] as KnowledgeDocumentEntry[];
    const urls = normalizeKnowledgeUrlsFromDocuments(documents, ["https://example.com/about"]);
    expect(urls).toHaveLength(1);
  });

  it("detects duplicate ingestion across documents and legacy urls", () => {
    const documents = [
      {
        id: "1",
        name: "[URL] Example",
        format: "url",
        originalSourceUrl: "https://example.com/about/",
      },
    ] as KnowledgeDocumentEntry[];
    expect(isKnowledgeUrlAlreadyIngested("https://example.com/about", documents, [])).toBe(true);
    expect(isKnowledgeUrlAlreadyIngested("https://other.com", documents, [])).toBe(false);
  });
});
