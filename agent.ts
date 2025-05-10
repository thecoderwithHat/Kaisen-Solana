import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { SolanaAgentKit } from "solana-agent-kit";
import { coinGeckoTool } from "./tools/coingecko";

// SolanaAgentRuntime class to replace AgentRuntime
export class SolanaAgentRuntime {
    public keypair: Keypair;
    public connection: Connection;
    public solanaAgent: SolanaAgentKit;
    public config: any;

    constructor(secretKey: Uint8Array, rpcUrl: string, config?: any) {
        this.keypair = Keypair.fromSecretKey(secretKey);
        this.connection = new Connection(rpcUrl, "confirmed");
        // Convert secretKey Uint8Array to base58 string for SolanaAgentKit
        const bs58 = require("bs58");
        const secretKeyString = bs58.encode(secretKey);
        this.solanaAgent = new SolanaAgentKit(secretKeyString, rpcUrl, this.config?.openai_api_key ?? null);
        this.config = config ? config : {};
    }

    async getBalance(pubkey?: string) {
        const address = pubkey ? new PublicKey(pubkey) : this.keypair.publicKey;
        return await this.connection.getBalance(address);
    }

    async transferSOL(to: string, lamports: number) {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: this.keypair.publicKey,
                toPubkey: new PublicKey(to),
                lamports,
            })
        );
        const signature = await this.connection.sendTransaction(transaction, [this.keypair]);
        return signature;
    }

    async getTokenPrice(tokenSymbol: string) {
        return coinGeckoTool.func({ tokenName: tokenSymbol });
    }

    // Add more Solana-specific methods as needed, e.g., SPL token transfers, NFT minting, etc.

    // Example: Get SPL token balance
    async getSPLTokenBalance(tokenMint: string, owner?: string) {
        const ownerPubkey = owner ? new PublicKey(owner) : this.keypair.publicKey;
        const accounts = await this.connection.getParsedTokenAccountsByOwner(ownerPubkey, {
            mint: new PublicKey(tokenMint),
        });
        if (accounts.value.length > 0) {
            return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        }
        return 0;
    }

    // Example: Get token contract address from CoinGecko
    async getTokenContractAddress(tokenName: string) {
        const resultJson = await coinGeckoTool.func({ tokenName });
        const result = JSON.parse(resultJson);
        if (result.success) {
            if (result.address) {
                return result.address;
            } else if (result.tokens && result.tokens.length > 0) {
                return result.tokens[0].address;
            }
        }
        return null;
    }
}
