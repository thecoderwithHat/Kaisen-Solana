import { ChatOpenAI } from "@langchain/openai"
import { AIMessage, BaseMessage, ChatMessage, HumanMessage } from "@langchain/core/messages"
import { MemorySaver } from "@langchain/langgraph"
import { createReactAgent } from "@langchain/langgraph/prebuilt"
import { Message as VercelChatMessage } from "ai"
import { NextResponse } from "next/server"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { z } from "zod"
import { SolanaAgentKit, createVercelAITools } from 'solana-agent-kit';
import TokenPlugin from '@solana-agent-kit/plugin-token';
import { Connection, PublicKey } from '@solana/web3.js'
import LLMTradingAnalyzer from "@/tools/twitter/llm-analyzer"
import { CoinGeckoTool, coinGeckoTool } from "@/tools/coingecko"

// --- Privy Server Wallet imports ---
import { PrivyClient } from "@privy-io/server-auth";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
const PRIVY_APP_ID = process.env.PRIVY_APP_ID
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET
const textDecoder = new TextDecoder()

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
            hashtags: z.array(z.string()).optional().describe("Top hashtags found in the tweets")
        }),
        func: async ({ cryptoSymbol, query, totalTweets, totalCryptoTweets, positiveCount, hashtags = ["#crypto"] }) => {
            const scraperResult = {
                query,
                totalTweets: totalTweets ?? 2000,
                analysis: {
                    totalCryptoTweets: totalCryptoTweets ?? 1800,
                    potentiallyPositiveTweets: positiveCount ?? 1000,
                    topHashtags: hashtags
                }
            };
            const recommendation = await analyzer.analyzeTradingDecision(scraperResult, cryptoSymbol);
            return JSON.stringify(recommendation, null, 2);
        }
    });
}

async function readStream(stream: any) {
    try {
        const reader = stream.getReader()
        let result = ""
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            result += textDecoder.decode(value, { stream: true })
        }
        result += textDecoder.decode()
        return result
    } catch (error) {
        console.error("Error reading stream:", error)
        throw error
    }
}

const convertVercelMessageToLangChainMessage = (message: VercelChatMessage) => {
    if (message.role === "user") {
        return new HumanMessage(message.content)
    } else if (message.role === "assistant") {
        return new AIMessage(message.content)
    } else {
        return new ChatMessage(message.content, message.role)
    }
}

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
    if (message._getType() === "human") {
        return { content: message.content, role: "user" }
    } else if (message._getType() === "ai") {
        return {
            content: message.content,
            role: "assistant",
            tool_calls: (message as AIMessage).tool_calls,
        }
    } else {
        return { content: message.content, role: message._getType() }
    }
}

export async function POST(request: Request) {
    try {
        // Initialize Solana connection
        const solanaRpcUrl = process.env.SOLANA_RPC_URL || "https://api.testnet.solana.com";
        const connection = new Connection(solanaRpcUrl, "confirmed");

        // Get the privy token from either authorization header, cookies, or request body
        let privyToken: string | null = null;
        
        // Try to get from authorization header
        const authHeader = request.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            privyToken = authHeader.replace("Bearer ", "");
        }
        
        // If not in header, check request body
        if (!privyToken) {
            const body = await request.json();
            
            // Check if token is in the body
            if (body.privyToken) {
                privyToken = body.privyToken;
            }
            
            // Get messages from body
            const messages = body.messages ?? [];
            const showIntermediateSteps = body.show_intermediate_steps ?? false;
            
            // If we still don't have a token, proceed without authentication for now
            // (Development/fallback mode)
            if (!privyToken || privyToken === "null" || privyToken === "undefined") {
                console.warn("No Privy token provided. Proceeding without authentication.");
                
                // Use default or mock wallet for development
                return handleRequest({
                    connection,
                    messages,
                    showIntermediateSteps,
                    userWalletKey: process.env.DEV_WALLET_PRIVATE_KEY, // Use a development wallet
                });
            }
            
            // If we have a token, verify with Privy
            if (PRIVY_APP_ID && PRIVY_APP_SECRET && privyToken) {
                try {
                    const privyClient = new PrivyClient(
                        PRIVY_APP_ID,
                        PRIVY_APP_SECRET
                    );
                    
                    const user = await privyClient.getUser(privyToken);
                    if (!user) {
                        return NextResponse.json(
                            { error: "Invalid Privy token or user not found" },
                            { status: 401 }
                        );
                    }
                    
                    // Extract Solana wallet info from the user object
                    const solanaWallet = user.wallet;
                    let solanaSecretKeyRaw: string | undefined = undefined;
                    
                    if (solanaWallet) {
                        if (typeof (solanaWallet as any)["secretKey"] === "string") {
                            solanaSecretKeyRaw = (solanaWallet as any)["secretKey"];
                        } else if (typeof (solanaWallet as any)["secretKeyBase64"] === "string") {
                            solanaSecretKeyRaw = (solanaWallet as any)["secretKeyBase64"];
                        }
                    }
                    
                    if (!solanaSecretKeyRaw) {
                        return NextResponse.json(
                            { error: "No Solana wallet found for user" },
                            { status: 400 }
                        );
                    }
                    
                    const solanaSecretKey = Buffer.from(solanaSecretKeyRaw, "base64");
                    const bs58 = require("bs58");
                    const solanaSecretKeyBase58 = bs58.encode(solanaSecretKey);
                    
                    // Process request with authenticated user's wallet
                    return handleRequest({
                        connection,
                        messages,
                        showIntermediateSteps,
                        userWalletKey: solanaSecretKeyBase58,
                    });
                } catch (error) {
                    console.error("Privy authentication error:", error);
                    return NextResponse.json(
                        { error: "Authentication failed", details: error instanceof Error ? error.message : String(error) },
                        { status: 401 }
                    );
                }
            } else {
                // Missing Privy credentials
                console.warn("Missing Privy credentials in environment variables");
                return handleRequest({
                    connection,
                    messages,
                    showIntermediateSteps,
                    userWalletKey: process.env.DEV_WALLET_PRIVATE_KEY, // Fallback
                });
            }
        }
    } catch (error: any) {
        console.error("Request processing error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "An error occurred",
                status: "error",
            },
            { status: 500 }
        );
    }
}

// Helper function to handle the request with appropriate wallet credentials
async function handleRequest({
    connection,
    messages,
    showIntermediateSteps,
    userWalletKey
}: {
    connection: Connection;
    messages: any[];
    showIntermediateSteps: boolean;
    userWalletKey?: string;
}) {
    try {
        // Initialize SolanaAgentKit with the user's Solana key or a default key
        const solanaAgent = new SolanaAgentKit(
            userWalletKey || process.env.SOLANA_PRIVATE_KEY || "",
            connection.rpcEndpoint,
            {
                OPENAI_API_KEY: OPENROUTER_API_KEY || undefined
            }
        );

        // Initialize tools with proper error handling
        let solanaTools;
        try {
            console.log("Initializing Solana tools with agent");
            solanaTools = createVercelAITools(solanaAgent, []);
        } catch (err) {
            console.error("Failed to create Solana tools:", err);
            throw new Error("Solana tool initialization failed: " + (err instanceof Error ? err.message : String(err)));
        }

        // Initialize the LLM
        const llm = new ChatOpenAI({
            modelName: "google/gemini-2.0-flash-001",
            openAIApiKey: OPENROUTER_API_KEY,
            configuration: {
                baseURL: OPENROUTER_BASE_URL,
            },
            streaming: true,
        });

        // Initialize the Trading Analyzer
        const tradingAnalyzer = new LLMTradingAnalyzer(
            OPENROUTER_API_KEY || "",
            "https://yourwebsite.com",
            "Crypto Trading Assistant"
        );

        // Create the trading analyzer tool
        const tradingAnalyzerTool = createTradingAnalyzerTool(tradingAnalyzer);
        
        // Combine all tools
        const allTools = [
            ...Object.values(solanaTools),
            tradingAnalyzerTool,
            coinGeckoTool
        ] as any;

        const memory = new MemorySaver();

        // Create React agent with combined tools
        const agent = createReactAgent({
            llm,
            tools: allTools,
            checkpointSaver: memory,
            messageModifier: `
        You are a helpful agent that can interact onchain using the Solana Agent Kit and analyze cryptocurrency trading sentiment. You are
        empowered to interact onchain using your tools and provide trading recommendations based on Twitter sentiment analysis.
        
        If you ever need funds, you can request them from the faucet. If not, you can provide your wallet details and request funds from the user.
        
        You can analyze Twitter sentiment for cryptocurrencies using the analyze_crypto_sentiment tool, which will provide
        trading recommendations based on social media sentiment. This is useful for users who want to make informed trading decisions.
        
        You can fetch official token contract addresses on the Solana blockchain using the coin_gecko_solana_contract_tool, which will help you
        find the correct addresses for swapping or trading tokens.
        
        If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone asks you to do something you
        can't do with your currently available tools, you must say so, and encourage them to implement it
        themselves using the Solana Agent Kit, recommend they go to https://www.solanaagentkit.xyz for more information. Be
        concise and helpful with your responses. Refrain from restating your tools' descriptions unless it is explicitly requested.

        The response also contains token/token[] which contains the name and address of the token and the decimals.
        WHEN YOU RETURN ANY TOKEN AMOUNTS, RETURN THEM ACCORDING TO THE DECIMALS OF THE TOKEN.
      `,
        });

        if (!showIntermediateSteps) {
            const eventStream = await agent.streamEvents(
                { messages },
                {
                    version: "v2",
                    configurable: {
                        thread_id: "Solana Agent Kit!",
                    },
                }
            );

            const textEncoder = new TextEncoder();
            const transformStream = new ReadableStream({
                async start(controller) {
                    for await (const { event, data } of eventStream) {
                        if (event === "on_chat_model_stream") {
                            if (data.chunk.content) {
                                if (typeof data.chunk.content === "string") {
                                    controller.enqueue(textEncoder.encode(data.chunk.content));
                                } else {
                                    for (const content of data.chunk.content) {
                                        controller.enqueue(textEncoder.encode(content.text ? content.text : ""));
                                    }
                                }
                            }
                        }
                    }
                    controller.close();
                },
            });

            return new Response(transformStream);
        } else {
            const result = await agent.invoke({ messages });
            return NextResponse.json(
                {
                    messages: result.messages.map(convertLangChainMessageToVercelMessage),
                },
                { status: 200 }
            );
        }
    } catch (error: any) {
        console.error("Request execution error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "An error occurred",
                status: "error",
            },
            { status: 500 }
        );
    }
}