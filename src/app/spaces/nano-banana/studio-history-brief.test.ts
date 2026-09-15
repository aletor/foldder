import { describe, expect, it } from "vitest";
import {
  acceptedStudioHistory,
  createStudioCard,
  emptyStudioGlobal,
  findStudioHistoryBrief,
  studioAssetsEqual,
  studioBriefChangeCards,
} from "./studio-types";

describe("findStudioHistoryBrief", () => {
  const cards = [{ ...createStudioCard(0), description: "cambia el cielo" }];
  const first = {
    outputUrl: "out-1",
    baseUrl: "base-0",
    cards,
    global: emptyStudioGlobal(),
    rawOutputUrl: "raw-1",
  };
  const second = {
    outputUrl: "out-2",
    baseUrl: "out-1",
    cards: [{ ...createStudioCard(1), description: "cambia el suelo" }],
    global: emptyStudioGlobal(),
  };

  it("prioriza el encargo que produjo esa imagen", () => {
    const found = findStudioHistoryBrief([first, second], "out-1");
    expect(found?.outputUrl).toBe("out-1");
    expect(studioBriefChangeCards(found).map((c) => c.description)).toEqual(["cambia el cielo"]);
  });

  it("encuentra la generación cruda antes de integrar", () => {
    expect(findStudioHistoryBrief([first, second], "raw-1")?.outputUrl).toBe("out-1");
  });

  it("si es solo base, muestra el encargo que partió de ella", () => {
    expect(findStudioHistoryBrief([first, second], "base-0")?.outputUrl).toBe("out-1");
  });

  it("relaciona URLs firmadas distintas por su clave estable", () => {
    const stable = {
      ...first,
      outputUrl: "/api/spaces/s3-file?key=knowledge-files%2Fuser-assets%2Fa%2Fresult.png",
    };
    const signed = "https://bucket.example/knowledge-files/user-assets/a/result.png?X-Amz-Signature=new";
    expect(studioAssetsEqual(stable.outputUrl, signed)).toBe(true);
    expect(findStudioHistoryBrief([stable], signed)?.outputUrl).toBe(stable.outputUrl);
  });

  it("excluye candidatas no elegidas y ordena solo versiones aceptadas", () => {
    const accepted = acceptedStudioHistory({
      history: ["base-0", "orphan-variant", "out-1", "out-2"],
      briefs: [first, second],
      initialImage: "base-0",
      currentImage: "out-2",
    });
    expect(accepted).toEqual(["base-0", "out-1", "out-2"]);
  });
});
