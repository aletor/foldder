import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION?.trim() || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

const spacesTable = process.env.FOLDDER_SPACES_DDB_TABLE?.trim() || "foldder-prod-spaces";
const spacesListGsi =
  process.env.FOLDDER_SPACES_DDB_LIST_GSI?.trim() || "listPk-listSk-index";
const spacesOwnerGsi =
  process.env.FOLDDER_SPACES_DDB_OWNER_GSI?.trim() || "ownerPk-listSk-index";
const spacesProjectGsi =
  process.env.FOLDDER_SPACES_DDB_PROJECT_GSI?.trim() || "projectId-index";
const sharesTable =
  process.env.FOLDDER_PRESENTER_SHARES_DDB_TABLE?.trim() || "foldder-prod-presenter-shares";
const sharesDeckGsi =
  process.env.FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI?.trim() || "deckKey-createdAt-index";
const walletTable =
  process.env.FOLDDER_WALLET_DDB_TABLE?.trim() || "foldder-prod-wallet-ledger";
const walletWorkGsi =
  process.env.FOLDDER_WALLET_DDB_WORK_GSI?.trim() || "gsi1pk-gsi1sk-index";

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

async function ensureTable(params: {
  tableName: string;
  create: () => Promise<void>;
}): Promise<void> {
  try {
    const d = await client.send(new DescribeTableCommand({ TableName: params.tableName }));
    const status = d.Table?.TableStatus || "UNKNOWN";
    console.log(`[provision] table exists: ${params.tableName} (${status})`);
    return;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name !== "ResourceNotFoundException") throw error;
  }

  console.log(`[provision] creating table: ${params.tableName}`);
  await params.create();
  await waitUntilTableExists(
    { client, maxWaitTime: 180 },
    { TableName: params.tableName },
  );
  console.log(`[provision] table ready: ${params.tableName}`);
}

async function ensureSpacesTable(): Promise<void> {
  await ensureTable({
    tableName: spacesTable,
    create: async () => {
      await client.send(
        new CreateTableCommand({
          TableName: spacesTable,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      );
    },
  });

  await ensureSpacesGsi({
    indexName: spacesListGsi,
    label: "spaces list",
    attributeDefinitions: [
      { AttributeName: "listPk", AttributeType: "S" },
      { AttributeName: "listSk", AttributeType: "S" },
    ],
    keySchema: [
      { AttributeName: "listPk", KeyType: "HASH" },
      { AttributeName: "listSk", KeyType: "RANGE" },
    ],
  });

  await ensureSpacesGsi({
    indexName: spacesOwnerGsi,
    label: "spaces owner",
    attributeDefinitions: [
      { AttributeName: "ownerPk", AttributeType: "S" },
      { AttributeName: "listSk", AttributeType: "S" },
    ],
    keySchema: [
      { AttributeName: "ownerPk", KeyType: "HASH" },
      { AttributeName: "listSk", KeyType: "RANGE" },
    ],
  });

  await ensureSpacesGsi({
    indexName: spacesProjectGsi,
    label: "spaces project",
    attributeDefinitions: [{ AttributeName: "projectId", AttributeType: "S" }],
    keySchema: [{ AttributeName: "projectId", KeyType: "HASH" }],
  });
}

async function ensureSpacesGsi(params: {
  attributeDefinitions: Array<{ AttributeName: string; AttributeType: "S" | "N" | "B" }>;
  indexName: string;
  keySchema: Array<{ AttributeName: string; KeyType: "HASH" | "RANGE" }>;
  label: string;
}): Promise<void> {
  const describe = await client.send(new DescribeTableCommand({ TableName: spacesTable }));
  const current = describe.Table?.GlobalSecondaryIndexes?.find((gsi) => gsi.IndexName === params.indexName);

  if (current) {
    const status = current.IndexStatus ?? "UNKNOWN";
    console.log(`[provision] ${params.label} GSI exists: ${params.indexName} (${status})`);
    if (status !== "ACTIVE") {
      await waitForSpacesGsi(params.indexName, params.label);
    }
    return;
  }

  console.log(`[provision] adding ${params.label} GSI: ${params.indexName}`);
  await client.send(
    new UpdateTableCommand({
      TableName: spacesTable,
      AttributeDefinitions: params.attributeDefinitions,
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: params.indexName,
            KeySchema: params.keySchema,
            Projection: { ProjectionType: "ALL" },
          },
        },
      ],
    }),
  );
  await waitForSpacesGsi(params.indexName, params.label);
  console.log(`[provision] ${params.label} GSI ready: ${params.indexName}`);
}

async function waitForSpacesGsi(indexName: string, label: string): Promise<void> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const d = await client.send(new DescribeTableCommand({ TableName: spacesTable }));
    const gsi = d.Table?.GlobalSecondaryIndexes?.find((x) => x.IndexName === indexName);
    const status = gsi?.IndexStatus ?? "UNKNOWN";
    if (status === "ACTIVE") break;
    console.log(`[provision] waiting for ${label} GSI (${indexName}) status=${status}`);
  }
}

async function ensureSharesTable(): Promise<void> {
  await ensureTable({
    tableName: sharesTable,
    create: async () => {
      await client.send(
        new CreateTableCommand({
          TableName: sharesTable,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "token", AttributeType: "S" },
            { AttributeName: "deckKey", AttributeType: "S" },
            { AttributeName: "createdAt", AttributeType: "S" },
          ],
          KeySchema: [{ AttributeName: "token", KeyType: "HASH" }],
          GlobalSecondaryIndexes: [
            {
              IndexName: sharesDeckGsi,
              KeySchema: [
                { AttributeName: "deckKey", KeyType: "HASH" },
                { AttributeName: "createdAt", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
        }),
      );
    },
  });
}

async function ensureWalletTable(): Promise<void> {
  await ensureTable({
    tableName: walletTable,
    create: async () => {
      await client.send(
        new CreateTableCommand({
          TableName: walletTable,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
            { AttributeName: "gsi1pk", AttributeType: "S" },
            { AttributeName: "gsi1sk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: walletWorkGsi,
              KeySchema: [
                { AttributeName: "gsi1pk", KeyType: "HASH" },
                { AttributeName: "gsi1sk", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
        }),
      );
    },
  });

  await ensureWalletWorkGsi();
}

async function ensureWalletWorkGsi(): Promise<void> {
  const describe = await client.send(new DescribeTableCommand({ TableName: walletTable }));
  const current = describe.Table?.GlobalSecondaryIndexes?.find((gsi) => gsi.IndexName === walletWorkGsi);

  if (current) {
    const status = current.IndexStatus ?? "UNKNOWN";
    console.log(`[provision] wallet work GSI exists: ${walletWorkGsi} (${status})`);
    if (status !== "ACTIVE") await waitForWalletGsi();
    return;
  }

  console.log(`[provision] adding wallet work GSI: ${walletWorkGsi}`);
  await client.send(
    new UpdateTableCommand({
      TableName: walletTable,
      AttributeDefinitions: [
        { AttributeName: "gsi1pk", AttributeType: "S" },
        { AttributeName: "gsi1sk", AttributeType: "S" },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: walletWorkGsi,
            KeySchema: [
              { AttributeName: "gsi1pk", KeyType: "HASH" },
              { AttributeName: "gsi1sk", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        },
      ],
    }),
  );
  await waitForWalletGsi();
  console.log(`[provision] wallet work GSI ready: ${walletWorkGsi}`);
}

async function waitForWalletGsi(): Promise<void> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const d = await client.send(new DescribeTableCommand({ TableName: walletTable }));
    const gsi = d.Table?.GlobalSecondaryIndexes?.find((x) => x.IndexName === walletWorkGsi);
    const status = gsi?.IndexStatus ?? "UNKNOWN";
    if (status === "ACTIVE") break;
    console.log(`[provision] waiting for wallet work GSI (${walletWorkGsi}) status=${status}`);
  }
}

async function main(): Promise<void> {
  console.log(`[provision] region: ${region}`);
  console.log(`[provision] spaces table: ${spacesTable}`);
  console.log(`[provision] spaces list GSI: ${spacesListGsi}`);
  console.log(`[provision] spaces owner GSI: ${spacesOwnerGsi}`);
  console.log(`[provision] spaces project GSI: ${spacesProjectGsi}`);
  console.log(`[provision] presenter table: ${sharesTable}`);
  console.log(`[provision] presenter GSI: ${sharesDeckGsi}`);
  console.log(`[provision] wallet table: ${walletTable}`);
  console.log(`[provision] wallet work GSI: ${walletWorkGsi}`);

  await ensureSpacesTable();
  await ensureSharesTable();
  await ensureWalletTable();

  console.log("[provision] done");
  console.log(`[provision] export FOLDDER_SPACES_DDB_TABLE=${spacesTable}`);
  console.log(`[provision] export FOLDDER_SPACES_DDB_LIST_GSI=${spacesListGsi}`);
  console.log(`[provision] export FOLDDER_SPACES_DDB_OWNER_GSI=${spacesOwnerGsi}`);
  console.log(`[provision] export FOLDDER_SPACES_DDB_PROJECT_GSI=${spacesProjectGsi}`);
  console.log(`[provision] export FOLDDER_PRESENTER_SHARES_DDB_TABLE=${sharesTable}`);
  console.log(`[provision] export FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI=${sharesDeckGsi}`);
  console.log(`[provision] export FOLDDER_WALLET_DDB_TABLE=${walletTable}`);
  console.log(`[provision] export FOLDDER_WALLET_DDB_WORK_GSI=${walletWorkGsi}`);
}

main().catch((error) => {
  console.error("[provision] failed:", error);
  process.exitCode = 1;
});
