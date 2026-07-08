import { describe, expect, it } from "vitest";
import {
  isAllowedKnowledgeUpload,
  normalizeKnowledgeMime,
  resolveKnowledgeContentType,
  sanitizeKnowledgeFilename,
} from "./knowledge-upload-policy";

describe("knowledge-upload-policy", () => {
  it("accepts pdf with charset suffix and generic binary mimes", () => {
    expect(isAllowedKnowledgeUpload("einf_2023_atresmedia.pdf", "application/pdf; charset=utf-8")).toBe(true);
    expect(isAllowedKnowledgeUpload("einf_2023_atresmedia.pdf", "binary/octet-stream")).toBe(true);
    expect(isAllowedKnowledgeUpload("einf_2023_atresmedia.pdf", "application/x-pdf")).toBe(true);
  });

  it("accepts png with empty browser mime", () => {
    expect(isAllowedKnowledgeUpload("logo-atresmedia.png", "")).toBe(true);
    expect(resolveKnowledgeContentType("logo-atresmedia.png", "")).toBe("image/png");
  });

  it("sanitizes names without losing allowed extension", () => {
    expect(sanitizeKnowledgeFilename("einf 2023 atresmedia.pdf")).toBe("einf_2023_atresmedia.pdf");
    expect(isAllowedKnowledgeUpload(sanitizeKnowledgeFilename("einf 2023 atresmedia.pdf"), "application/pdf")).toBe(true);
  });

  it("accepts avif brand references", () => {
    expect(isAllowedKnowledgeUpload("Quienes_somos_3.avif", "image/avif")).toBe(true);
    expect(resolveKnowledgeContentType("Quienes_somos_3.avif", "image/avif")).toBe("image/avif");
  });

  it("normalizes mime parameters", () => {
    expect(normalizeKnowledgeMime("application/pdf; charset=utf-8")).toBe("application/pdf");
  });
});
