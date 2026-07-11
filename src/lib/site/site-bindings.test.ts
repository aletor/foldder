import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { MediaListOutput } from "@/app/spaces/media-list-output";
import type { CollectionContent } from "./site-types";
import { createEmptySiteProject } from "./site-defaults";
import { createFactorySection } from "./site-presets";
import { getActiveSitePage, updateActiveSitePage } from "./site-project";
import {
  applySiteGraphBindings,
  buildSiteGraphConnectionStatus,
  datasetToCollectionItems,
  graphBindingsPending,
  mediaListToCollectionItems,
  moveSiteSection,
  reorderSiteSections,
} from "./site-bindings";

function projectWithSections(sections: ReturnType<typeof createFactorySection>[]) {
  const base = createEmptySiteProject();
  return updateActiveSitePage(base, { sections });
}

function demoDataset(): Dataset {
  return {
    id: "ds1",
    name: "Productos",
    scope: "local",
    lists: [
      {
        id: "list1",
        name: "Galería",
        key: "gallery",
        schema: [
          { id: "f_img", key: "photo", label: "Foto", type: "image", required: false },
        ],
        cards: [
          {
            id: "c1",
            values: {
              f_img: { type: "image", assetId: "a1", url: "https://example.com/1.jpg" },
            },
          },
          {
            id: "c2",
            values: {
              f_img: { type: "image", assetId: "a2", url: "https://example.com/2.jpg" },
            },
          },
        ],
      },
    ],
    constants: { fields: [], values: {} },
    createdAt: "",
    updatedAt: "",
    version: 1,
  };
}

describe("site-bindings", () => {
  it("maps dataset image column to collection items", () => {
    const items = datasetToCollectionItems(demoDataset());
    expect(items).toHaveLength(2);
    expect(items[0]?.src).toBe("https://example.com/1.jpg");
  });

  it("maps populate media list to collection items", () => {
    const mediaList: MediaListOutput = {
      kind: "media_list",
      sourceNodeId: "pop1",
      sourceNodeType: "populate",
      title: "Slides",
      status: "frames_ready",
      items: [
        { id: "i1", order: 0, title: "A", mediaType: "image", url: "https://x/a.png", status: "generated" },
      ],
      metadata: {},
    };
    expect(mediaListToCollectionItems(mediaList)).toEqual([{ src: "https://x/a.png", caption: "A" }]);
  });

  it("applySiteGraphBindings fills gallery from dataset", () => {
    const gallery = createFactorySection("gallery");
    const project = projectWithSections([gallery]);
    const bound = applySiteGraphBindings(project, {
      dataset: demoDataset(),
      contentMediaList: null,
      mediaUrl: null,
    });
    const content = getActiveSitePage(bound).sections[0]?.content as CollectionContent;
    expect(content.items[0]?.src).toBe("https://example.com/1.jpg");
  });

  it("applySiteGraphBindings prefers populate over dataset for collections", () => {
    const gallery = createFactorySection("gallery");
    const project = projectWithSections([gallery]);
    const bound = applySiteGraphBindings(project, {
      dataset: demoDataset(),
      contentMediaList: {
        kind: "media_list",
        sourceNodeId: "pop1",
        sourceNodeType: "populate",
        title: "Populate",
        status: "frames_ready",
        items: [
          { id: "i1", order: 0, title: "P", mediaType: "image", url: "https://populate/img.jpg", status: "generated" },
        ],
        metadata: {},
      },
      mediaUrl: null,
    });
    const content = getActiveSitePage(bound).sections[0]?.content as CollectionContent;
    expect(content.items[0]?.src).toBe("https://populate/img.jpg");
  });

  it("applySiteGraphBindings respects collection binding listId", () => {
    const gallery = createFactorySection("gallery");
    const content = gallery.content as CollectionContent;
    gallery.content = {
      ...content,
      binding: { listId: "list2", map: { src: "cover" } },
    };

    const dataset = demoDataset();
    dataset.lists.push({
      id: "list2",
      name: "Portadas",
      key: "covers",
      schema: [{ id: "f_cover", key: "cover", label: "Cover", type: "image", required: false }],
      cards: [
        {
          id: "c9",
          values: {
            f_cover: { type: "image", assetId: "a9", url: "https://example.com/cover.jpg" },
          },
        },
      ],
    });

    const project = projectWithSections([gallery]);
    const bound = applySiteGraphBindings(project, {
      dataset,
      contentMediaList: null,
      mediaUrl: null,
    });
    const next = getActiveSitePage(bound).sections[0]?.content as CollectionContent;
    expect(next.items[0]?.src).toBe("https://example.com/cover.jpg");
  });

  it("graphBindingsPending detects preview drift", () => {
    const gallery = createFactorySection("gallery");
    const project = projectWithSections([gallery]);
    const preview = applySiteGraphBindings(project, {
      dataset: demoDataset(),
      contentMediaList: null,
      mediaUrl: null,
    });
    const status = buildSiteGraphConnectionStatus({
      dataset: demoDataset(),
      datasetConnected: true,
      contentMediaList: null,
      contentConnected: false,
      mediaUrl: null,
      mediaConnected: false,
    });
    expect(graphBindingsPending(project, preview, status)).toBe(true);
    expect(graphBindingsPending(preview, preview, status)).toBe(false);
  });

  it("reorderSiteSections moves drag target to drop index", () => {
    const a = createFactorySection("hero");
    const b = createFactorySection("manifesto");
    const c = createFactorySection("footer");
    const reordered = reorderSiteSections([a, b, c], c.id, a.id);
    expect(reordered.map((section) => section.id)).toEqual([c.id, a.id, b.id]);
  });
});
