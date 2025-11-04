const CROSSMINT_SERVER_API_KEY = Deno.env.get("CROSSMINT_SERVER_API_KEY") ?? "";

if (!CROSSMINT_SERVER_API_KEY) {
  throw new Error("CROSSMINT_SERVER_API_KEY is not set");
}

const COLLECTION_ID = Deno.env.get("COLLECTION_ID") ?? "";

if (!COLLECTION_ID) {
  throw new Error("COLLECTION_ID is not set");
}

const CROSSMINT_BASE_URL = CROSSMINT_SERVER_API_KEY.includes("staging")
  ? "https://staging.crossmint.com/api/2022-06-09/"
  : "https://www.crossmint.com/api/2022-06-09/";

// attributes for the NFT
type MetadataAttribute = {
  display_type?: string;
  trait_type: string;
  value: string;
};

type NFTMetadata = {
  name: string;
  image: string;
  description: string;
  animation_url?: string;
  attributes?: MetadataAttribute[];
};

type MintParams = {
  id: string; // idempotency key, must be unique for each NFT
  metadata: NFTMetadata;
  recipient: string; // wallet or email address
  reuploadLinkedFiles: boolean; // whether to reupload images to our own IPFS gateway
};

type MintResponse = {
  id: string;
  onChain: {
    status: string;
    chain: string;
    contractAddress: string;
  };
  actionId: string;
};

export type AirdropItem = {
  walletAddress: string;
  metadata: NFTMetadata;
  id: string; // unique NFT id for idempotency
};

export const readAirdropData = async (): Promise<AirdropItem[]> => {
  const filePath = "airdrop.json";
  try {
    const fileContent = await Deno.readTextFile("airdrop.json");
    const data = JSON.parse(fileContent) as AirdropItem[];

    if (!Array.isArray(data)) {
      throw new Error("JSON file must contain an array");
    }

    return data;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    }
    throw error;
  }
};

export const mint = async (params: MintParams): Promise<MintResponse> => {
  const url =
    `${CROSSMINT_BASE_URL}collections/${COLLECTION_ID}/nfts/${params.id}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": CROSSMINT_SERVER_API_KEY,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Mint failed with status: ${response.status} and error: ${
        JSON.stringify(error)
      }`,
    );
  }

  return response.json();
};

// load existing results
const loadResults = async (): Promise<Map<string, MintResponse>> => {
  try {
    const content = await Deno.readTextFile("results.json");
    const results = JSON.parse(content) as MintResponse[];
    return new Map(results.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
};

const saveResults = async (
  results: Map<string, MintResponse>,
): Promise<void> => {
  await Deno.writeTextFile(
    "results.json",
    JSON.stringify(Array.from(results.values()), null, 2),
  );
};

// sleep utility
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// mint with retry and exponential backoff
const mintWithRetry = async (
  item: AirdropItem,
  reuploadLinkedFiles: boolean,
  maxRetries = 3,
): Promise<MintResponse> => {
  let backoffMs = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const params: MintParams = {
        id: item.id,
        metadata: item.metadata,
        recipient: item.walletAddress,
        reuploadLinkedFiles,
      };

      return await mint(params);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      await sleep(backoffMs);
      backoffMs *= 2;
    }
  }

  throw new Error("Max retries exceeded");
};

export const mintBatch = async (
  items: AirdropItem[],
  reuploadLinkedFiles = false,
  batchSize = 10,
): Promise<void> => {
  const results = await loadResults();
  const processedIds = new Set(results.keys());

  const itemsToProcess = items.filter((item) => !processedIds.has(item.id));

  console.log(
    `Processing ${itemsToProcess.length} items (${
      items.length - itemsToProcess.length
    } already completed)`,
  );

  for (let i = 0; i < itemsToProcess.length; i += batchSize) {
    const batch = itemsToProcess.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(itemsToProcess.length / batchSize);

    console.log(`Processing batch ${batchNumber}/${totalBatches}`);

    const promises = batch.map(async (item) => {
      try {
        return await mintWithRetry(item, reuploadLinkedFiles);
      } catch (error) {
        console.error(`Failed to mint ${item.id}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(promises);

    // save results after each batch
    for (const result of batchResults) {
      if (result) {
        results.set(result.id, result);
      }
    }
    await saveResults(results);

    if (i + batchSize < itemsToProcess.length) {
      await sleep(500);
    }
  }
};

if (import.meta.main) {
  try {
    console.log("Reading airdrop data...");
    const airdropData = await readAirdropData();
    console.log(`Found ${airdropData.length} items to process`);

    console.log("Starting batch mint...");
    await mintBatch(airdropData, false);

    const results = await loadResults();
    console.log("\n=== Batch Mint Complete ===");
    console.log(`Successfully minted: ${results.size}`);
    console.log("Results saved to results.json");
  } catch (error) {
    console.error("Error during batch mint:", error);
    Deno.exit(1);
  }
}
