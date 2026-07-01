import { describe, expect, it } from "vitest";

import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { ProjectRecord } from "@/lib/spaces-dynamo-store";
import { planProjectS3Deletes } from "./project-s3-delete-plan";

const SHARED_KEY =
  "knowledge-files/project-media/user/ownerhash/project-a/img_pose1.jpg";
const ONLY_DAMA_KEY =
  "knowledge-files/project-media/user/ownerhash/dama/local-only.jpg";

function project(id: string, spaces: ProjectRecord["spaces"]): ProjectRecord {
  return {
    id,
    name: id,
    ownerUserEmail: "user@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    rootSpaceId: "root",
    spaces: spaces ?? {},
  };
}

function datasetWithImageUrl(url: string): Dataset {
  return {
    id: "ds-1",
    name: "Players",
    scope: "global",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    constants: { fields: [], values: {} },
    lists: [
      {
        id: "list-1",
        name: "Main",
        key: "main",
        schema: [{ id: "f1", key: "FOTO", type: "image", label: "Foto" }],
        cards: [
          {
            id: "card-1",
            values: {
              f1: {
                type: "image",
                assetId: "img-1",
                url: `/api/spaces/s3-file?key=${encodeURIComponent(url)}`,
              },
            },
          },
        ],
      },
    ],
  };
}

describe("planProjectS3Deletes", () => {
  it("keeps S3 objects still referenced by another local project", () => {
    const original = project("project-a", {
      root: {
        id: "root",
        name: "Root",
        nodes: [
          {
            id: "dataset-1",
            type: "dataset",
            data: {
              dataset: datasetWithImageUrl(SHARED_KEY),
            },
          },
        ],
      },
    });
    const dama = project("dama", {
      root: {
        id: "root",
        name: "Root",
        nodes: [
          {
            id: "dataset-2",
            type: "dataset",
            data: {
              dataset: datasetWithImageUrl(SHARED_KEY),
            },
          },
        ],
      },
    });

    const plan = planProjectS3Deletes({
      projectToDelete: dama,
      otherProjects: [original, dama],
      globalDatasets: [],
    });

    expect(plan.candidateKeys).toEqual([SHARED_KEY]);
    expect(plan.retainedKeys).toEqual([SHARED_KEY]);
    expect(plan.deleteKeys).toEqual([]);
  });

  it("keeps S3 objects still referenced by a global dataset catalog entry", () => {
    const dama = project("dama", {
      root: {
        id: "root",
        name: "Root",
        nodes: [
          {
            id: "designer-1",
            type: "designer",
            data: {
              pages: [
                {
                  objects: [
                    {
                      isImageFrame: true,
                      imageFrameContent: {
                        src: `/api/spaces/s3-file?key=${encodeURIComponent(SHARED_KEY)}`,
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    });

    const plan = planProjectS3Deletes({
      projectToDelete: dama,
      otherProjects: [dama],
      globalDatasets: [datasetWithImageUrl(SHARED_KEY)],
    });

    expect(plan.retainedKeys).toEqual([SHARED_KEY]);
    expect(plan.deleteKeys).toEqual([]);
  });

  it("deletes keys that are exclusive to the project being removed", () => {
    const dama = project("dama", {
      root: {
        id: "root",
        name: "Root",
        nodes: [
          {
            id: "dataset-1",
            type: "dataset",
            data: {
              dataset: datasetWithImageUrl(ONLY_DAMA_KEY),
            },
          },
        ],
      },
    });

    const plan = planProjectS3Deletes({
      projectToDelete: dama,
      otherProjects: [dama],
      globalDatasets: [],
    });

    expect(plan.deleteKeys).toEqual([ONLY_DAMA_KEY]);
    expect(plan.retainedKeys).toEqual([]);
  });
});
