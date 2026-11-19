import { createPublicClient, createWalletClient, custom, http } from "viem";
import { HARDHAT_LOCAL_CHAIN } from "./contractConfig";

export const publicClient = createPublicClient({
  chain: HARDHAT_LOCAL_CHAIN,
  transport: http("http://127.0.0.1:8545"),
});

export function getWalletClient() {
  if (!window.ethereum) {
    throw new Error("MetaMask n'est pas installé dans ce navigateur.");
  }

  return createWalletClient({
    chain: HARDHAT_LOCAL_CHAIN,
    transport: custom(window.ethereum),
  });
}