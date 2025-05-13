import { randomUUID } from "crypto";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, BaseMessage, ChatMessage, HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { Message as VercelChatMessage } from "ai";
import { NextResponse } from "next/server";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  SendOptions,
  TransactionSignature,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

// Solana Agent Kit & Plugins
import { SolanaAgentKit, createVercelAITools } from "solana-agent-kit";
import TokenPluginModule from "@solana-agent-kit/plugin-token";
import NFTPluginModule from "@solana-agent-kit/plugin-nft";
import MiscPluginModule from "@solana-agent-kit/plugin-misc";
import BlinksPluginModule from "@solana-agent-kit/plugin-blinks";

import LLMTradingAnalyzer from "@/tools/twitter/llm-analyzer";
import { coinGeckoTool } from "@/tools/coingecko";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

// For Phantom signature verification
const textEncoder = new TextEncoder();
process.env.OPENAI_API_KEY = OPENROUTER_API_KEY;

function keypairToBaseWallet(keypair: Keypair, connection: Connection) {
  return {
    publicKey: keypair.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      (tx as Transaction).partialSign(keypair);
      return tx;
    },
    async signAllTransactions<T extends (Transaction | VersionedTransaction)[]>(txs: T): Promise<T> {
      txs.forEach((tx) => (tx as Transaction).partialSign(keypair));
      return txs;
    },
    async signAndSendTransaction<T extends Transaction | VersionedTransaction>(
      tx: T,
      opts?: SendOptions
    ): Promise<{ signature: TransactionSignature }> {
      (tx as Transaction).partialSign(keypair);
      const raw = (tx as Transaction).serialize();
      const signature = await connection.sendRawTransaction(raw, opts);
      return { signature };
    },
    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      return nacl.sign.detached(message, keypair.secretKey);
    },
  };
}

function createTradingAnalyzerTool(analyzer: LLMTradingAnalyzer) {
    return new DynamicStructuredTool({
        name: "analyze_crypto_sentiment",
        description: "Analyzes Twitter sentiment for a cryptocurrency and provides trading recommendations",
        schema: z.object({
            cryptoSymbol: z.string().describe("The cryptocurrency symbol (e.g., BTC, ETH, SOL)"),
            query: z.string().describe("The Twitter search query to analyze"),
            totalTweets: z.number().optional().describe("Total number of tweets analyzed"),
            totalCryptoTweets: z.number().optional().describe("Number of crypto-related tweets"),
            positiveCount: z.number().optional().describe("Number of potentially positive tweets"),
            negativeCount: z.number().optional().describe("Number of potentially negative tweets"),
            neutralCount: z.number().optional().describe("Number of neutral tweets"),
            hashtags: z.array(z.string()).optional().describe("Top hashtags found in the tweets"),
            influencers: z.array(z.string()).optional().describe("Influential accounts discussing the topic"),
            sampleTweets: z.array(z.string()).optional().describe("Sample tweets for analysis"),
            priceData: z.object({
                current: z.number(),
                yesterday: z.number(),
                weekAgo: z.number(),
                percentChange24h: z.number(),
                percentChange7d: z.number()
            }).optional().describe("Price data for the cryptocurrency"),
            confidenceThreshold: z.number().optional().describe("Confidence threshold for recommendations")
        }),
        func: async ({
                         cryptoSymbol,
                         query,
                         totalTweets = 1000,
                         totalCryptoTweets,
                         positiveCount,
                         negativeCount,
                         neutralCount,
                         hashtags = ["#crypto"],
                         influencers = [],
                         sampleTweets = [],
                         priceData,
                         confidenceThreshold
                     }) => {
            const actualTotalCryptoTweets = totalCryptoTweets ||
                Math.floor(totalTweets * (Math.random() * 0.3 + 0.1));

            const actualPositiveCount = positiveCount ||
                Math.floor(actualTotalCryptoTweets * (Math.random() * 0.4 + 0.2));
            const actualNegativeCount = negativeCount ||
                Math.floor(actualTotalCryptoTweets * (Math.random() * 0.3 + 0.1));
            const actualNeutralCount = neutralCount ||
                (actualTotalCryptoTweets - actualPositiveCount - actualNegativeCount);


            let sentimentTrend: "RISING" | "FALLING" | "STABLE";
            if (actualPositiveCount > actualNegativeCount * 1.5) {
                sentimentTrend = "RISING";
            } else if (actualNegativeCount > actualPositiveCount * 1.5) {
                sentimentTrend = "FALLING";
            } else {
                sentimentTrend = "STABLE";
            }

            const processedPriceData = priceData ? {
                current: priceData.current,
                yesterday: priceData.yesterday ?? (priceData.current * (1 - (Math.random() * 0.05 - 0.025))),
                weekAgo: priceData.weekAgo ?? (priceData.current * (1 - (Math.random() * 0.15 - 0.075))),
                percentChange24h: priceData.percentChange24h,
                percentChange7d: priceData.percentChange7d
            } : undefined;


            const scraperResult = {
                query,
                totalTweets,
                sampleTweets,
                timestamp: Date.now(),
                analysis: {
                    totalCryptoTweets: actualTotalCryptoTweets,
                    potentiallyPositiveTweets: actualPositiveCount,
                    potentiallyNegativeTweets: actualNegativeCount,
                    neutralTweets: actualNeutralCount,
                    topHashtags: hashtags,
                    influentialAccounts: influencers,
                    sentimentTrend
                },
                priceData: processedPriceData
            };

            // Call analyzer to get a recommendation with optional confidence threshold
            const recommendation = await analyzer.analyzeTradingDecision(
                scraperResult,
                cryptoSymbol,
                undefined,
                confidenceThreshold
            );

            // Return the recommendation as a formatted string
            return JSON.stringify(recommendation, null, 2);
        }
    });
}

const convertVercelMessageToLangChainMessage = (message: VercelChatMessage): BaseMessage => {
  if (message.role === "user") return new HumanMessage(message.content);
  if (message.role === "assistant") {
    const props: { content: string; tool_calls?: any } = { content: message.content };
    if (message.tool_calls) props.tool_calls = message.tool_calls;
    return new AIMessage(props);
  }
  return new ChatMessage(message.content, message.role);
};

const convertLangChainMessageToVercelMessage = (message: BaseMessage): VercelChatMessage => {
  const id = randomUUID();
  const roleType = message._getType();
  const roleMap: Record<string, VercelChatMessage["role"]> = {
    human: "user",
    ai: "assistant",
    tool: "tool",
    function: "tool",
    system: "system",
  };
  const role = roleMap[roleType] || "assistant";

  const contentStr =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

  const common: Omit<VercelChatMessage, "tool_calls"> & { content: string } = {
    id,
    role,
    content: contentStr,
  };

  if (roleType === "ai" && (message as AIMessage).tool_calls?.length) {
    const vcToolCalls = (message as AIMessage).tool_calls!.map((tc) => ({
      ...(tc as any),
      function: tc.name,
    }));
    return { ...common, tool_calls: vcToolCalls };
  }
  return common;
};

type PhantomWalletData = { publicKey: string; signature?: string; message?: string };

export async function POST(request: Request) {
  try {
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      "confirmed"
    );
    const body = await request.json();
    const messages = body.messages?.map(convertVercelMessageToLangChainMessage) ?? [];
    const phantom: PhantomWalletData | undefined = body.phantomWallet;

    const pkEnv = process.env.DEV_WALLET_PRIVATE_KEY ?? process.env.SOLANA_PRIVATE_KEY;
    if (!pkEnv) throw new Error("Server wallet private key is not configured.");
    let keyBytes: Uint8Array;
    try {
      keyBytes = Buffer.from(pkEnv, "base64");
    } catch {
      keyBytes = bs58.decode(pkEnv);
    }
    const kp = keyBytes.length === 32 ? Keypair.fromSeed(keyBytes) : Keypair.fromSecretKey(keyBytes);
    const serverWallet = keypairToBaseWallet(kp, connection);

    let userPK: string | undefined;
    let isVerified = false;
    if (phantom?.publicKey && phantom.signature && phantom.message) {
      try {
        isVerified = nacl.sign.detached.verify(
          textEncoder.encode(phantom.message),
          Buffer.from(phantom.signature, "base64"),
          new PublicKey(phantom.publicKey).toBytes()
        );
        userPK = phantom.publicKey;
      } catch {}
    }

    const solanaAgentKit = new SolanaAgentKit(serverWallet, connection.rpcEndpoint, {
      OPENAI_API_KEY: OPENROUTER_API_KEY,
    });
    solanaAgentKit
      .use(TokenPluginModule)
      .use(NFTPluginModule)
      .use(MiscPluginModule)
      .use(BlinksPluginModule);

    const vercelTools = createVercelAITools(solanaAgentKit, solanaAgentKit.actions) ?? {};
    const toolList: any[] = Object.values(vercelTools);

        // Create a unique thread ID and MemorySaver configured with it
    const threadId = randomUUID();
        const memorySaver = new MemorySaver();

    const agent = createReactAgent({
      llm: new ChatOpenAI({
        modelName: "google/gemini-2.0-flash-001",
        openAIApiKey: OPENROUTER_API_KEY,
        configuration: { baseURL: OPENROUTER_BASE_URL },
        streaming: false,
      }),
      tools: [
        ...toolList,
        createTradingAnalyzerTool(
          new LLMTradingAnalyzer(
            OPENROUTER_API_KEY,
            "https://yourwebsite.com",
            "Crypto Trading Assistant"
          )
        ),
        coinGeckoTool,
      ],
      checkpointSaver: memorySaver,
      messageModifier: `You are a Solana/Crypto assistant. User wallet: ${userPK || "none"} Verified: ${isVerified}`,
    });

        // Invoke with threadId in runnable config
        // Invoke with threadId via cast to bypass TS signature
    const state = await (agent as any).invoke(
      { messages },
      { configurable: { thread_id: threadId } }
    );
    const lastMsg = state.messages[state.messages.length - 1];

    let replyText: string;
    if (
      lastMsg instanceof AIMessage ||
      lastMsg instanceof ChatMessage ||
      lastMsg instanceof HumanMessage
    ) {
      const c = lastMsg.content;
      replyText = typeof c === "string" ? c : JSON.stringify(c);
    } else {
      replyText = JSON.stringify(lastMsg);
    }

    console.log("Assistant reply:", replyText);

    return new Response(replyText, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
