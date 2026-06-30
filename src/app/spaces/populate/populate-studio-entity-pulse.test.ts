import { describe, expect, it } from "vitest";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  diffPopulateContentFingerprints,
  populatePulseObjectIdsForEntity,
  resolvePopulateContentBlinkRootIds,
} from "./populate-studio-entity-pulse";

describe("populatePulseObjectIdsForEntity", () => {
  it("returns groupContainer id for named folder entity", () => {
    const objects = [
      {
        id: "folder-1",
        type: "groupContainer",
        name: "jugador1",
        x: 0,
        y: 0,
        width: 100,
        height: 200,
        visible: true,
        children: [],
      } as FreehandObject,
    ];
    const labels = new Map([["jugador1", "Jugador 1"]]);
    expect(populatePulseObjectIdsForEntity(objects, labels, "jugador1")).toEqual(new Set(["folder-1"]));
  });

  it("returns empty set when nothing selected", () => {
    expect(populatePulseObjectIdsForEntity([], new Map(), null)).toEqual(new Set());
  });

  it("detects changed text and image fingerprints", () => {
    const prev = new Map([
      ["t1", "t:Old"],
      ["i1", "i:https://a.png"],
    ]);
    const next = new Map([
      ["t1", "t:New"],
      ["i1", "i:https://b.png"],
    ]);
    expect(diffPopulateContentFingerprints(prev, next)).toEqual(new Set(["t1", "i1"]));
    expect(diffPopulateContentFingerprints(prev, prev)).toEqual(new Set());
  });

  it("maps changed inner layers to entity folder for blink", () => {
    const objects = [
      {
        id: "folder-1",
        type: "groupContainer",
        name: "jugador1",
        x: 0,
        y: 0,
        width: 100,
        height: 200,
        visible: true,
        children: [
          {
            id: "text-1",
            type: "text",
            text: "A",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            visible: true,
          } as FreehandObject,
        ],
      } as FreehandObject,
    ];
    const labels = new Map([["jugador1", "Jugador 1"]]);
    expect(resolvePopulateContentBlinkRootIds(objects, labels, ["text-1"])).toEqual(new Set(["folder-1"]));
  });
});
