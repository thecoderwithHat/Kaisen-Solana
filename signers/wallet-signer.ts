import { type Account, AccountAddress, type AnyRawTransaction, Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import type { AptosSignMessageInput, InputTransactionData, WalletContextState } from "@aptos-labs/wallet-adapter-react"
import type { SignedTransactionResponse } from "../types"
import { BaseSigner } from "./base-signer"

export class WalletSigner extends BaseSigner {
	constructor(
		account: Account,
		private readonly wallet: WalletContextState,
		network: Network = Network.DEVNET
	) {
		const config = new AptosConfig({ network })
		const aptos = new Aptos(config)
		super(account, aptos)
	}

	public override getAddress(): AccountAddress {
		const walletAddress = this.wallet?.account?.address
		return walletAddress ? AccountAddress.fromString(walletAddress.toString()) : this.account.accountAddress
	}

	async signTransaction(transaction: AnyRawTransaction): Promise<SignedTransactionResponse> {
		const senderAuthenticator = await this.wallet.signTransaction({
			transactionOrPayload: transaction,
		})
		return {
			senderAuthenticator: senderAuthenticator.authenticator,
		}
	}

	async sendTransaction(transaction: InputTransactionData): Promise<string> {
		const txHash = await this.wallet.signAndSubmitTransaction(transaction)

		return txHash.hash
	}

	async signMessage(message: AptosSignMessageInput) {
		return this.wallet.signMessage(message)
	}
}
