import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const [walletClient] = await connection.viem.getWalletClients();

  console.log("Déploiement avec le compte :", walletClient.account.address);

  const contract = await connection.viem.deployContract("CertificateRegistry");

  console.log("CertificateRegistry déployé à l'adresse :", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});