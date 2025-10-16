import { WalletContextState } from '@solana/wallet-adapter-react';
import { Connection} from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { generateSigner, percentAmount, transactionBuilder } from '@metaplex-foundation/umi';
import { createV1, mintV1, mplTokenMetadata, TokenStandard } from '@metaplex-foundation/mpl-token-metadata'
import { createAssociatedToken, mintTokensTo, mplToolbox } from '@metaplex-foundation/mpl-toolbox';
type Metadata = {
  name: string,
  symbol: string,
  uri: string,
}
export const createToken = async (metadata: Metadata, connection: Connection, userWallet: WalletContextState) => {
  const umi = createUmi(connection).use(walletAdapterIdentity(userWallet)).use(mplTokenMetadata()).use(mplToolbox())
  const mint = generateSigner(umi);

  console.log("Creating token with metadata:", metadata);
  const builder = transactionBuilder()
    .add(
      createV1(umi, {
        mint,
        authority: umi.identity,
        payer: umi.identity,
        updateAuthority: umi.identity,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        sellerFeeBasisPoints: percentAmount(5.5),
        tokenStandard: TokenStandard.Fungible,
      })
    )
    .add(
      createAssociatedToken(umi, {
        mint: mint.publicKey,
        owner: umi.identity.publicKey,
      })
    )
    .add(
      mintV1(umi, {
        mint: mint.publicKey,
        authority: umi.identity,
        amount: BigInt(1_000_000 * 1e9), // 1,000,000 tokens with 9 decimals
        tokenOwner: umi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
      })
    ).sendAndConfirm(umi).then(()=>{
        return mint.publicKey;
    })
    return "";
}