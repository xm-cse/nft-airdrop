# Crossmint NFT Airdrop

Simple batch NFT minting tool using the [Crossmint Mint NFT with ID API](https://docs.crossmint.com/api-reference/minting/nfts/mint-nft-idempotent).

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   - `CROSSMINT_SERVER_API_KEY` - Your Crossmint server API key
   - `COLLECTION_ID` - Your collection ID (e.g., `default-polygon` or a custom collection ID)

2. Your API key must have these scopes:
   - `nfts.create`
   - `nfts.update`
   - `nfts.read`

## Airdrop Data

Edit `airdrop.json` with your NFT data. Each item requires:
- `id` - Unique idempotency key for each NFT
- `walletAddress` - Recipient in Crossmint format: `chain:address` or `email:address:chain`
  - Examples: `polygon:0x1234...`, `email:user@example.com:polygon`
  - See [Crossmint docs](https://docs.crossmint.com/api-reference/minting/nfts/mint-nft-idempotent) for all formats
- `metadata` - NFT metadata (name, image, description, attributes, etc.)

## Configuration

The script uses `reuploadLinkedFiles: false` by default. When `true`, any URLs in the metadata object will be resolved and reuploaded to IPFS. Set to `true` in the code if you want to reupload.

## Running

This project uses [Deno](https://deno.com/). Install Deno if needed, then run:

```bash
deno task airdrop
```

The script will:
- Process items in batches of 10
- Retry failed mints with exponential backoff
- Save results to `results.json` after each batch
- Resume from previous runs (skips already completed items)

