import type { AccountAddress, Aptos, MoveStructId } from "@aptos-labs/ts-sdk"
import { AptosPriceServiceConnection } from "@pythnetwork/pyth-aptos-js"
import { priceFeed } from "./constants/price-feed"
import type { BaseSigner } from "./signers"
import {
	borrowToken,
	burnNFT,
	burnToken,
	claimReward,
	createToken,
	getBalance,
	getPoolDetails,
	getTokenDetails,
	getTokenPrice,
	getTransaction,
	getUserAllPositions,
	getUserPosition,
	lendToken,
	mintToken,
	repayToken,
	stakeTokens,
	transferNFT,
	transferTokens,
	unstakeTokens,
	withdrawToken,
} from "./tools"
import {
	borrowAriesToken,
	createAriesProfile,
	lendAriesToken,
	repayAriesToken,
	withdrawAriesToken,
} from "./tools/aries"
import {
	borrowTokenWithEchelon,
	lendTokenWithEchelon,
	repayTokenWithEchelon,
	withdrawTokenWithEchelon,
} from "./tools/echelon"
import { stakeTokenWithEcho, unstakeTokenWithEcho } from "./tools/echo"
import { addLiquidity, createPool, removeLiquidity, swap } from "./tools/liquidswap"
import {
	closePositionWithMerkleTrade,
	getPositionsWithMerkleTrade,
	placeLimitOrderWithMerkleTrade,
	placeMarketOrderWithMerkleTrade,
} from "./tools/merkletrade"
import { createImage } from "./tools/openai"
import { swapWithPanora } from "./tools/panora"
import {
	addLiquidityWithThala,
	createPoolWithThala,
	mintMODWithThala,
	redeemMODWithThala,
	removeLiquidityWithThala,
	stakeTokenWithThala,
	unstakeAPTWithThala,
} from "./tools/thala"
import { getTokenByTokenName } from "./utils/get-pool-address-by-token-name"
import { coinGeckoTool } from "./tools/coingecko";
export class AgentRuntime {
	public account: BaseSigner
	public aptos: Aptos
	public config: any

	constructor(account: BaseSigner, aptos: Aptos, config?: any) {
		this.account = account
		this.aptos = aptos
		this.config = config ? config : {}
	}

	async getPythData() {
		const connection = new AptosPriceServiceConnection("https://hermes.pyth.network")

		return await connection.getPriceFeedsUpdateData(priceFeed)
	}

	getBalance(mint?: string | MoveStructId) {
		return getBalance(this, mint)
	}

	getTokenDetails(token: string) {
		return getTokenDetails(token)
	}

	getTokenByTokenName(name: string) {
		return getTokenByTokenName(name)
	}

	getTokenPrice(query: string) {
		return getTokenPrice(query)
	}

	transferTokens(to: AccountAddress, amount: number, mint: string) {
		return transferTokens(this, to, amount, mint)
	}

	getTransaction(hash: string) {
		return getTransaction(this, hash)
	}

	burnToken(amount: number, mint: string) {
		return burnToken(this, amount, mint)
	}

	createToken(name: string, symbol: string, iconURI: string, projectURI: string) {
		return createToken(this, name, symbol, iconURI, projectURI)
	}

	mintToken(to: AccountAddress, mint: string, amount: number) {
		return mintToken(this, to, mint, amount)
	}

	stakeTokensWithAmnis(to: AccountAddress, amount: number) {
		return stakeTokens(this, to, amount)
	}

	withdrawStakeFromAmnis(to: AccountAddress, amount: number) {
		return unstakeTokens(this, to, amount)
	}

	transferNFT(to: AccountAddress, mint: AccountAddress) {
		return transferNFT(this, to, mint)
	}

	burnNFT(mint: AccountAddress) {
		return burnNFT(this, mint)
	}

	lendToken(amount: number, mint: MoveStructId, positionId: string, newPosition: boolean, fungibleAsset: boolean) {
		return lendToken(this, amount, mint, positionId, newPosition, fungibleAsset)
	}

	borrowToken(amount: number, mint: MoveStructId, positionId: string, fungibleAsset: boolean) {
		return borrowToken(this, amount, mint, positionId, fungibleAsset)
	}

	withdrawToken(amount: number, mint: MoveStructId, positionId: string, fungibleAsset: boolean) {
		return withdrawToken(this, amount, mint, positionId, fungibleAsset)
	}

	repayToken(amount: number, mint: MoveStructId, positionId: string, fungibleAsset: boolean) {
		return repayToken(this, amount, mint, positionId, fungibleAsset)
	}

	getUserPosition(userAddress: AccountAddress, positionId: string) {
		return getUserPosition(this, userAddress, positionId)
	}

	getUserAllPositions(userAddress: AccountAddress) {
		return getUserAllPositions(this, userAddress)
	}
	getPoolDetails(mint: string) {
		return getPoolDetails(this, mint)
	}

	addLiquidity(mintX: MoveStructId, mintY: MoveStructId, mintXAmount: number, mintYAmount: number) {
		return addLiquidity(this, mintX, mintY, mintXAmount, mintYAmount)
	}

	removeLiquidity(mintX: MoveStructId, mintY: MoveStructId, lpAmount: number, minMintX = 0, minMintY = 0) {
		return removeLiquidity(this, mintX, mintY, lpAmount, minMintX, minMintY)
	}

	swap(mintX: MoveStructId, mintY: MoveStructId, swapAmount: number, minCoinOut?: number) {
		return swap(this, mintX, mintY, swapAmount, minCoinOut)
	}

	createPool(mintX: MoveStructId, mintY: MoveStructId) {
		return createPool(this, mintX, mintY)
	}

	claimReward(rewardCoinType: MoveStructId | string) {
		return claimReward(this, rewardCoinType)
	}

	// Aries

	createAriesProfile() {
		return createAriesProfile(this)
	}

	lendAriesToken(mintType: MoveStructId, amount: number) {
		return lendAriesToken(this, mintType, amount)
	}

	borrowAriesToken(mintType: MoveStructId, amount: number) {
		return borrowAriesToken(this, mintType, amount)
	}

	withdrawAriesToken(mintType: MoveStructId, amount: number) {
		return withdrawAriesToken(this, mintType, amount)
	}

	repayAriesToken(mintType: MoveStructId, amount: number) {
		return repayAriesToken(this, mintType, amount)
	}

	// Thala

	stakeTokensWithThala(amount: number) {
		return stakeTokenWithThala(this, amount)
	}

	unstakeTokensWithThala(amount: number) {
		return unstakeAPTWithThala(this, amount)
	}

	mintMODWithThala(mintType: MoveStructId, amount: number) {
		return mintMODWithThala(this, mintType, amount)
	}

	redeemMODWithThala(mintType: MoveStructId, amount: number) {
		return redeemMODWithThala(this, mintType, amount)
	}

	addLiquidityWithThala(mintX: MoveStructId, mintY: MoveStructId, mintXAmount: number, mintYAmount: number) {
		return addLiquidityWithThala(this, mintX, mintY, mintXAmount, mintYAmount)
	}

	removeLiquidityWithThala(mintX: MoveStructId, mintY: MoveStructId, lpAmount: number) {
		return removeLiquidityWithThala(this, mintX, mintY, lpAmount)
	}

	createPoolWithThala(
		mintX: MoveStructId | string,
		mintY: MoveStructId | string,
		amountX: number,
		amountY: number,
		feeTier: number,
		amplificationFactor: number
	) {
		return createPoolWithThala(this, mintX, mintY, amountX, amountY, feeTier, amplificationFactor)
	}

	// panora

	swapWithPanora(fromToken: string, toToken: string, swapAmount: number, toWalletAddress?: string) {
		return swapWithPanora(this, fromToken, toToken, swapAmount, toWalletAddress)
	}

	// openai

	createImageWithOpenAI(prompt: string, size: "256x256" | "512x512" | "1024x1024", n: number) {
		return createImage(this, prompt, size, n)
	}

	// Echo

	stakeTokenWithEcho(amount: number) {
		return stakeTokenWithEcho(this, amount)
	}

	unstakeTokenWithEcho(amount: number) {
		return unstakeTokenWithEcho(this, amount)
	}

	// Echelon

	lendTokenWithEchelon(mintType: MoveStructId, amount: number, poolAddress: string, fungibleAsset: boolean) {
		return lendTokenWithEchelon(this, mintType, amount, poolAddress, fungibleAsset)
	}

	withdrawTokenWithEchelon(mintType: MoveStructId, amount: number, poolAddress: string, fungibleAsset: boolean) {
		return withdrawTokenWithEchelon(this, mintType, amount, poolAddress, fungibleAsset)
	}

	repayTokenWithEchelon(mintType: MoveStructId, amount: number, poolAddress: string, fungibleAsset: boolean) {
		return repayTokenWithEchelon(this, mintType, amount, poolAddress, fungibleAsset)
	}

	borrowTokenWithEchelon(mintType: MoveStructId, amount: number, poolAddress: string, fungibleAsset: boolean) {
		return borrowTokenWithEchelon(this, mintType, amount, poolAddress, fungibleAsset)
	}

	// MerkleTrade

	placeMarketOrderWithMerkleTrade(pair: string, isLong: boolean, sizeDelta: number, collateralDelta: number) {
		return placeMarketOrderWithMerkleTrade(this, pair, isLong, sizeDelta, collateralDelta)
	}

	placeLimitOrderWithMerkleTrade(
		pair: string,
		isLong: boolean,
		sizeDelta: number,
		collateralDelta: number,
		price: number
	) {
		return placeLimitOrderWithMerkleTrade(this, pair, isLong, sizeDelta, collateralDelta, price)
	}

	closePositionWithMerkleTrade(pair: string, isLong: boolean) {
		return closePositionWithMerkleTrade(this, pair, isLong)
	}

	getPositionsWithMerkleTrade() {
		return getPositionsWithMerkleTrade(this)
	}

	// Add this method to your AgentRuntime class
	async getTokenContractAddress(tokenName: string) {
		// The coinGeckoTool.func returns a Promise<string> with a JSON string
		const resultJson = await coinGeckoTool.func({ tokenName });
		// Parse the JSON string to get the actual data
		const result = JSON.parse(resultJson);
		
		if (result.success) {
		// If it's a single token, return the address
		if (result.address) {
			return result.address;
		} 
		// If it's multiple tokens, return the first one's address
		else if (result.tokens && result.tokens.length > 0) {
			return result.tokens[0].address;
		}
		}
		
		// Return null or throw an error if no token found
		return null;
	}

}
