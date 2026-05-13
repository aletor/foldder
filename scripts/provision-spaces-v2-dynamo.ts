import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const region = process.env.AWS_REGION?.trim() || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

const spacesV2Table =
  process.env.FOLDDER_SPACES_V2_DDB_TABLE?.trim() || "foldder-prod-spaces-v2";
const spacesV2OwnerGsi =
  process.env.FOLDDER_SPACES_V2_OWNER_GSI?.trim() || "ownerPk-listSk-index";

const client = new DynamoDBClient({
  region,
  ...(accessKeyId && secretAccessKey
    ? {
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      }
    : {}),
});

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`[spaces-v2] table exists: ${tableName} (${response.Table?.TableStatus || "UNKNOWN"})`);
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ResourceNotFoundException") return false;
    throw error;
  }
}

async function waitForGsi(indexName: string): Promise<void> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const response = await client.send(new DescribeTableCommand({ TableName: spacesV2Table }));
    const gsi = response.Table?.GlobalSecondaryIndexes?.find((index) => index.IndexName === indexName);
    const status = gsi?.IndexStatus ?? "UNKNOWN";
    if (status === "ACTIVE") return;
    console.log(`[spaces-v2] waiting for GSI ${indexName} (${status})`);
  }
}

async function ensureOwnerGsi(): Promise<void> {
  const response = await client.send(new DescribeTableCommand({ TableName: spacesV2Table }));
  const current = response.Table?.GlobalSecondaryIndexes?.find(
    (index) => index.IndexName === spacesV2OwnerGsi,
  );
  if (current) {
    console.log(`[spaces-v2] owner GSI exists: ${spacesV2OwnerGsi} (${current.IndexStatus || "UNKNOWN"})`);
    if (current.IndexStatus !== "ACTIVE") await waitForGsi(spacesV2OwnerGsi);
    return;
  }

  console.log(`[spaces-v2] adding owner GSI: ${spacesV2OwnerGsi}`);
  await client.send(
    new UpdateTableCommand({
      TableName: spacesV2Table,
      AttributeDefinitions: [
        { AttributeName: "ownerPk", AttributeType: "S" },
        { AttributeName: "listSk", AttributeType: "S" },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: spacesV2OwnerGsi,
            KeySchema: [
              { AttributeName: "ownerPk", KeyType: "HASH" },
              { AttributeName: "listSk", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        },
      ],
    }),
  );
  await waitForGsi(spacesV2OwnerGsi);
  console.log(`[spaces-v2] owner GSI ready: ${spacesV2OwnerGsi}`);
}

async function ensureSpacesV2Table(): Promise<void> {
  if (await tableExists(spacesV2Table)) {
    await ensureOwnerGsi();
    return;
  }

  console.log(`[spaces-v2] creating table: ${spacesV2Table}`);
  await client.send(
    new CreateTableCommand({
      TableName: spacesV2Table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
        { AttributeName: "ownerPk", AttributeType: "S" },
        { AttributeName: "listSk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: spacesV2OwnerGsi,
          KeySchema: [
            { AttributeName: "ownerPk", KeyType: "HASH" },
            { AttributeName: "listSk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  );
  await waitUntilTableExists({ client, maxWaitTime: 180 }, { TableName: spacesV2Table });
  await waitForGsi(spacesV2OwnerGsi);
  console.log(`[spaces-v2] table ready: ${spacesV2Table}`);
}

async function main(): Promise<void> {
  console.log(`[spaces-v2] region: ${region}`);
  console.log(`[spaces-v2] table: ${spacesV2Table}`);
  console.log(`[spaces-v2] owner GSI: ${spacesV2OwnerGsi}`);
  await ensureSpacesV2Table();
  console.log("[spaces-v2] done");
  console.log(`[spaces-v2] set FOLDDER_SPACES_V2_DDB_TABLE=${spacesV2Table}`);
  console.log(`[spaces-v2] set FOLDDER_SPACES_V2_OWNER_GSI=${spacesV2OwnerGsi}`);
}

main().catch((error) => {
  console.error("[spaces-v2] failed:", error);
  process.exitCode = 1;
});
