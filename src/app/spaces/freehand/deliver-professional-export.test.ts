import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverProfessionalExportEntries } from "./deliver-professional-export";

describe("deliverProfessionalExportEntries", () => {
  const upload = vi.fn();

  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue({
      contentType: "image/png",
      s3Key: "exports/a.png",
      url: "https://cdn.test/a.png",
    });
  });

  it("descarga cada archivo y registra el evento sin URL de S3", async () => {
    const downloadBlob = vi.fn();
    const onFinalExport = vi.fn();
    const blobA = new Blob(["a"], { type: "image/png" });
    const blobB = new Blob(["b"], { type: "image/png" });

    await deliverProfessionalExportEntries({
      entries: [
        { blob: blobA, name: "deck-01.png", ext: "png", width: 10, height: 20 },
        { blob: blobB, name: "deck-02.png", ext: "png" },
      ],
      destination: "download",
      projectId: "p1",
      exportedFrom: "designer",
      downloadBlob,
      onFinalExport,
      upload,
    });

    expect(downloadBlob).toHaveBeenCalledTimes(2);
    expect(downloadBlob).toHaveBeenNthCalledWith(1, blobA, "deck-01.png");
    expect(downloadBlob).toHaveBeenNthCalledWith(2, blobB, "deck-02.png");
    expect(upload).not.toHaveBeenCalled();
    expect(onFinalExport).toHaveBeenCalledTimes(2);
    expect(onFinalExport.mock.calls[0]?.[0]).toMatchObject({
      name: "deck-01.png",
      extension: ".png",
      exportedFrom: "designer",
    });
    expect(onFinalExport.mock.calls[0]?.[0].fileUrl).toBeUndefined();
  });

  it("sube a Foldder y pasa fileUrl al evento", async () => {
    const downloadBlob = vi.fn();
    const onFinalExport = vi.fn();
    const blob = new Blob(["pdf"], { type: "application/pdf" });

    await deliverProfessionalExportEntries({
      entries: [{ blob, name: "deck.pdf", ext: "pdf" }],
      destination: "foldder",
      projectId: "proj_1",
      exportedFrom: "designer",
      downloadBlob,
      onFinalExport,
      extraMetadata: { pageCount: 3 },
      upload,
    });

    expect(downloadBlob).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    const file = upload.mock.calls[0]?.[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("deck.pdf");
    expect(upload.mock.calls[0]?.[1]).toMatchObject({
      projectId: "proj_1",
      policy: { preserveImageQuality: true },
    });
    expect(onFinalExport).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "deck.pdf",
        extension: ".pdf",
        fileUrl: "https://cdn.test/a.png",
        metadata: expect.objectContaining({
          s3Key: "exports/a.png",
          pageCount: 3,
          destination: "foldder",
        }),
      }),
    );
    expect(onFinalExport.mock.calls[0]?.[0].thumbnailUrl).toBeUndefined();
  });
});
