import { beforeEach, describe, expect, it, vi } from "vitest";

type DynamoItem = Record<string, unknown> & { pk: string; sk: string };

const dynamoMock = vi.hoisted(() => {
  const table = new Map<string, DynamoItem>();
  const keyFor = (key: { pk: string; sk: string }) => `${key.pk}\u0000${key.sk}`;
  const conditionalConflict = () => {
    const error = new Error("Conditional check failed");
    error.name = "ConditionalCheckFailedException";
    return error;
  };

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function queryItems(input: Record<string, unknown>): DynamoItem[] {
    const values = input.ExpressionAttributeValues as Record<string, unknown>;
    const pk = values?.[":pk"];
    const ownerPk = values?.[":ownerPk"];
    const listSk = values?.[":listSk"];
    let items = [...table.values()];
    if (typeof pk === "string") items = items.filter((item) => item.pk === pk);
    if (typeof ownerPk === "string") items = items.filter((item) => item.ownerPk === ownerPk);
    if (typeof listSk === "string") items = items.filter((item) => item.listSk === listSk);
    if (input.ScanIndexForward === false) {
      items.sort((a, b) => String(b.listSk ?? "").localeCompare(String(a.listSk ?? "")));
    }
    return clone(items);
  }

  async function send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
    const { input } = command;
    switch (command.constructor.name) {
      case "GetCommand": {
        const key = input.Key as { pk: string; sk: string };
        return { Item: clone(table.get(keyFor(key)) ?? null) };
      }
      case "PutCommand": {
        const item = input.Item as DynamoItem;
        const existing = table.get(keyFor(item));
        const condition = typeof input.ConditionExpression === "string" ? input.ConditionExpression : "";
        if (condition.includes("attribute_not_exists") && existing) throw conditionalConflict();
        if (condition.includes("#revision = :expectedRevision")) {
          const expected = (input.ExpressionAttributeValues as Record<string, unknown>)?.[":expectedRevision"];
          if (!existing || existing.revision !== expected) throw conditionalConflict();
        }
        table.set(keyFor(item), clone(item));
        return {};
      }
      case "QueryCommand":
        return { Items: queryItems(input) };
      case "ScanCommand": {
        const values = input.ExpressionAttributeValues as Record<string, unknown>;
        const entityType = values?.[":meta"];
        const items = [...table.values()].filter((item) =>
          typeof entityType === "string" ? item.entityType === entityType : true,
        );
        return { Items: clone(items) };
      }
      case "BatchWriteCommand": {
        const requestItems = input.RequestItems as Record<string, Array<{ DeleteRequest?: { Key: { pk: string; sk: string } } }>>;
        for (const requests of Object.values(requestItems)) {
          for (const request of requests) {
            if (request.DeleteRequest?.Key) table.delete(keyFor(request.DeleteRequest.Key));
          }
        }
        return {};
      }
      default:
        throw new Error(`Unhandled Dynamo command: ${command.constructor.name}`);
    }
  }

  return {
    clear: () => table.clear(),
    items: () => [...table.values()].map(clone),
    send: vi.fn(send),
    setItem: (item: DynamoItem) => table.set(keyFor(item), clone(item)),
  };
});

vi.mock("@/lib/dynamo-utils", () => ({
  ddbClient: { send: dynamoMock.send },
}));

import {
  readAllSpacesV2Projects,
  readSpacesV2ProjectById,
  readSpacesV2ProjectMediaRefByOwnerKey,
  readSpacesV2ProjectsMetaForOwner,
  SpacesV2IntegrityError,
  SpacesV2RevisionConflictError,
  updateSpacesV2ProjectUi,
  upsertSpacesV2Project,
} from "./spaces-v2-store";
import type { ProjectRecord } from "./spaces-dynamo-store";

const TABLE = "spaces-v2-test";

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    createdAt: "2026-05-14T08:00:00.000Z",
    id: "project-1",
    metadata: {
      coverKey: "knowledge-files/project-media/user/ownerhash/project-1/cover.webp",
      notes: "ok",
    },
    name: "Big Production",
    ownerUserEmail: "creator@example.com",
    ownerUserImage: null,
    ownerUserName: "Creator",
    rootSpaceId: "root",
    spaces: {
      root: {
        id: "root",
        name: "Main Space",
        nodes: [
          {
            id: "node-1",
            type: "assetNode",
            data: {
              s3Key: "knowledge-files/project-media/user/ownerhash/project-1/asset.webp",
              text: "x".repeat(360_000),
            },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    },
    updatedAt: "2026-05-14T08:00:00.000Z",
    ...overrides,
  };
}

describe("spaces-v2-store integration over mocked Dynamo", () => {
  beforeEach(() => {
    dynamoMock.clear();
    dynamoMock.send.mockClear();
  });

  it("writes a large project as chunks and reads it back with owner meta and media refs", async () => {
    const project = makeProject();
    const write = await upsertSpacesV2Project(TABLE, project, { expectedRevision: 0 });

    expect(write.revision).toBe(1);
    expect(write.telemetry.chunkCount).toBeGreaterThan(1);
    expect(write.telemetry.mediaKeyCount).toBe(2);

    const loaded = await readSpacesV2ProjectById(TABLE, project.id);
    expect(loaded?.name).toBe(project.name);
    expect(String(loaded?.spaces.root.nodes?.[0]?.data && (loaded.spaces.root.nodes[0].data as { text?: string }).text)).toHaveLength(360_000);

    const meta = await readSpacesV2ProjectsMetaForOwner(TABLE, "creator@example.com");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toMatchObject({ id: project.id, name: project.name, revision: 1 });

    const mediaRef = await readSpacesV2ProjectMediaRefByOwnerKey(
      TABLE,
      "creator@example.com",
      "knowledge-files/project-media/user/ownerhash/project-1/asset.webp",
    );
    expect(mediaRef).toEqual({
      projectId: project.id,
      s3Key: "knowledge-files/project-media/user/ownerhash/project-1/asset.webp",
    });

    const all = await readAllSpacesV2Projects(TABLE);
    expect(all.map((row) => row.id)).toEqual([project.id]);
  });

  it("rejects stale expected revisions and keeps the previous committed project intact", async () => {
    const project = makeProject();
    await upsertSpacesV2Project(TABLE, project, { expectedRevision: 0 });

    await expect(
      upsertSpacesV2Project(TABLE, { ...project, name: "Stale Save" }, { expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(SpacesV2RevisionConflictError);

    const loaded = await readSpacesV2ProjectById(TABLE, project.id);
    expect(loaded?.name).toBe("Big Production");
    expect(loaded?.revision).toBe(1);
  });

  it("updates UI metadata without rewriting project chunks or bumping revision", async () => {
    const project = makeProject();
    await upsertSpacesV2Project(TABLE, project, { expectedRevision: 0 });
    const chunksBefore = dynamoMock.items().filter((item) => item.entityType === "spaces-v2-project-chunk");

    const result = await updateSpacesV2ProjectUi(TABLE, {
      ownerEmail: "creator@example.com",
      projectId: project.id,
      ui: {
        activeSpaceId: "root",
        viewport: { x: 10, y: -20, zoom: 0.5 },
        workspaceViewMode: "pro",
      },
    });

    expect(result).toEqual({ revision: 1 });
    const chunksAfter = dynamoMock.items().filter((item) => item.entityType === "spaces-v2-project-chunk");
    expect(chunksAfter).toEqual(chunksBefore);

    const loaded = await readSpacesV2ProjectById(TABLE, project.id);
    expect(loaded?.revision).toBe(1);
    expect(loaded?.metadata.ui).toEqual({
      activeSpaceId: "root",
      viewport: { x: 10, y: -20, zoom: 0.5 },
      workspaceViewMode: "pro",
    });
  });

  it("detects chunk hash corruption instead of loading a broken project", async () => {
    const project = makeProject();
    await upsertSpacesV2Project(TABLE, project, { expectedRevision: 0 });
    const chunk = dynamoMock.items().find((item) => item.entityType === "spaces-v2-project-chunk" && item.chunkIndex === 0);
    expect(chunk).toBeTruthy();
    dynamoMock.setItem({
      ...(chunk as DynamoItem),
      chunkData: `${String(chunk?.chunkData).slice(0, -4)}AAAA`,
    });

    await expect(readSpacesV2ProjectById(TABLE, project.id)).rejects.toMatchObject({
      code: "CHUNK_HASH_MISMATCH",
    } satisfies Partial<SpacesV2IntegrityError>);
  });
});
