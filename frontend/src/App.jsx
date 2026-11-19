import { useEffect, useState } from "react";
import { CONTRACT_ABI, CONTRACT_ADDRESS, HARDHAT_LOCAL_CHAIN } from "./contractConfig";
import { getWalletClient, publicClient } from "./viemClient";

export default function App() {
  const [account, setAccount] = useState("");
  const [totalCerts, setTotalCerts] = useState("0");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Recherche / Vérification
  const [searchMode, setSearchMode] = useState("studentId");
  const [searchValue, setSearchValue] = useState("");
  const [certResult, setCertResult] = useState(null);

  // Mes certificats (Étudiant connecté)
  const [myCertificates, setMyCertificates] = useState([]);

  // Formulaire d'émission (mintCertificate)
  const [mintForm, setMintForm] = useState({
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    studentName: "",
    studentId: "",
    diplomaTitle: "",
    issueDate: "2026-11-19",
    grade: "Très Bien",
  });

  // Révocation (revoke)
  const [revokeCertId, setRevokeCertId] = useState("");

  async function refreshTotalCertificates() {
    try {
      const total = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "totalCertificates",
      });
      setTotalCerts(total.toString());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadMyCertificates(holderAddress) {
    if (!holderAddress) {
      setMyCertificates([]);
      return;
    }
    try {
      const logs = await publicClient.getContractEvents({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        eventName: "CertificateMinted",
        args: { recipient: holderAddress },
        fromBlock: 0n,
        toBlock: "latest",
      });

      const list = await Promise.all(
        logs.map(async (log) => {
          const certId = log.args.certId;
          const cert = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: "getCertificate",
            args: [certId],
          });
          return { certId: certId.toString(), ...cert };
        })
      );
      setMyCertificates(list);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    refreshTotalCertificates();

    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        const nextAccount = accounts[0] || "";
        setAccount(nextAccount);
        loadMyCertificates(nextAccount);
      };
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, []);

  async function ensureHardhatNetwork() {
    const hexChainId = `0x${HARDHAT_LOCAL_CHAIN.id.toString(16)}`;
    const currentChainId = await window.ethereum.request({ method: "eth_chainId" });

    if (currentChainId !== hexChainId) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChainId,
                chainName: HARDHAT_LOCAL_CHAIN.name,
                nativeCurrency: HARDHAT_LOCAL_CHAIN.nativeCurrency,
                rpcUrls: HARDHAT_LOCAL_CHAIN.rpcUrls.default.http,
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }
  }

  async function connectWallet() {
    setErrorMessage("");
    setStatusMessage("");
    try {
      const walletClient = getWalletClient();
      await ensureHardhatNetwork();
      const [addr] = await walletClient.requestAddresses();
      setAccount(addr);
      await loadMyCertificates(addr);
      setStatusMessage("Wallet connecté au réseau Hardhat Local.");
    } catch (err) {
      setErrorMessage(err.shortMessage || err.message);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setCertResult(null);

    if (!searchValue.trim()) {
      setErrorMessage("Veuillez saisir un studentId ou un certId.");
      return;
    }

    setLoading(true);
    try {
      if (searchMode === "studentId") {
        const [certId, cert] = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "getCertificateByStudentId",
          args: [searchValue.trim()],
        });
        setCertResult({ certId: certId.toString(), ...cert });
      } else {
        const cert = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "getCertificate",
          args: [BigInt(searchValue.trim())],
        });
        setCertResult({ certId: searchValue.trim(), ...cert });
      }
    } catch (err) {
      setErrorMessage(err.shortMessage || err.message || "Diplôme introuvable.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMint(e) {
    e.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setLoading(true);

    try {
      const walletClient = getWalletClient();
      await ensureHardhatNetwork();
      const [activeAccount] = await walletClient.requestAddresses();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "mintCertificate",
        account: activeAccount,
        args: [
          mintForm.to.trim(),
          mintForm.studentName.trim(),
          mintForm.studentId.trim(),
          mintForm.diplomaTitle.trim(),
          mintForm.issueDate.trim(),
          mintForm.grade.trim(),
        ],
      });

      setStatusMessage(`Transaction envoyée (${hash}). Attente de confirmation...`);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatusMessage(`Diplôme émis avec succès pour ${mintForm.studentId} !`);
      await refreshTotalCertificates();
      if (account) await loadMyCertificates(account);
    } catch (err) {
      setErrorMessage(err.shortMessage || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(e) {
    e.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    if (revokeCertId === "") {
      setErrorMessage("Veuillez indiquer l'ID du certificat à révoquer.");
      return;
    }

    setLoading(true);
    try {
      const walletClient = getWalletClient();
      await ensureHardhatNetwork();
      const [activeAccount] = await walletClient.requestAddresses();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "revoke",
        account: activeAccount,
        args: [BigInt(revokeCertId.trim())],
      });

      setStatusMessage(`Révocation envoyée (${hash}). Attente de confirmation...`);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatusMessage(`Certificat #${revokeCertId} révoqué avec succès.`);
      if (account) await loadMyCertificates(account);
    } catch (err) {
      setErrorMessage(err.shortMessage || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 880, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>Registre Académique de Diplômes (Blockchain)</h1>
      <p>
        <strong>Contrat :</strong> <code>{CONTRACT_ADDRESS}</code> |{" "}
        <strong>Total diplômes :</strong> {totalCerts}
      </p>

      <div style={{ marginBottom: "1.5rem" }}>
        {account ? (
          <span>
            Connecté : <code>{account}</code>
          </span>
        ) : (
          <button onClick={connectWallet}>Connecter MetaMask</button>
        )}
      </div>

      {statusMessage && (
        <div style={{ padding: "0.75rem", background: "#e6f7ed", color: "#135200", marginBottom: "1rem" }}>
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{ padding: "0.75rem", background: "#fff1f0", color: "#cf1322", marginBottom: "1rem" }}>
          {errorMessage}
        </div>
      )}

      {/* Section Étudiant : Mes certificats */}
      {account && (
        <section style={{ border: "1px solid #ddd", padding: "1rem", borderRadius: 8, marginBottom: "2rem" }}>
          <h2>Mes certificats (Wallet connecté)</h2>
          {myCertificates.length === 0 ? (
            <p>Aucun diplôme associé à cette adresse.</p>
          ) : (
            myCertificates.map((c) => (
              <div key={c.certId} style={{ background: "#f9f9f9", padding: "0.8rem", borderRadius: 6, marginBottom: "0.6rem" }}>
                <strong>#{c.certId} — {c.diplomaTitle}</strong> ({c.studentName} | {c.studentId}) —{" "}
                <span style={{ color: c.revoked ? "#cf1322" : "#237804", fontWeight: "bold" }}>
                  {c.revoked ? "RÉVOQUÉ" : "VALIDE"}
                </span>
              </div>
            ))
          )}
        </section>
      )}

      {/* Section 1 : Vérification */}
      <section style={{ border: "1px solid #ddd", padding: "1rem", borderRadius: 8, marginBottom: "2rem" }}>
        <h2>Vérifier un diplôme</h2>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <select value={searchMode} onChange={(e) => setSearchMode(e.target.value)}>
            <option value="studentId">Par Student ID</option>
            <option value="certId">Par Cert ID (#)</option>
          </select>
          <input
            type="text"
            placeholder={searchMode === "studentId" ? "Ex: ETU-2026-001" : "Ex: 0"}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            style={{ flex: 1, padding: "0.4rem" }}
          />
          <button type="submit" disabled={loading}>
            Rechercher
          </button>
        </form>

        {certResult && (
          <div style={{ background: "#f9f9f9", padding: "1rem", borderRadius: 6 }}>
            <p>
              <strong>Statut :</strong>{" "}
              <span style={{ color: certResult.revoked ? "#cf1322" : "#237804", fontWeight: "bold" }}>
                {certResult.revoked ? "RÉVOQUÉ" : "VALIDE"}
              </span>
            </p>
            <p><strong>Cert ID :</strong> {certResult.certId}</p>
            <p><strong>Étudiant :</strong> {certResult.studentName} ({certResult.studentId})</p>
            <p><strong>Diplôme :</strong> {certResult.diplomaTitle}</p>
            <p><strong>Date d'émission :</strong> {certResult.issueDate}</p>
            <p><strong>Mention :</strong> {certResult.grade}</p>
            <p><strong>Destinataire :</strong> <code>{certResult.recipient}</code></p>
          </div>
        )}
      </section>

      {/* Section 2 : Émission Admin */}
      <section style={{ border: "1px solid #ddd", padding: "1rem", borderRadius: 8, marginBottom: "2rem" }}>
        <h2>Émettre un diplôme (Admin)</h2>
        <form onSubmit={handleMint} style={{ display: "grid", gap: "0.6rem" }}>
          <input
            type="text"
            placeholder="Adresse wallet destinataire (0x...)"
            value={mintForm.to}
            onChange={(e) => setMintForm({ ...mintForm, to: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Nom complet de l'étudiant"
            value={mintForm.studentName}
            onChange={(e) => setMintForm({ ...mintForm, studentName: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Identifiant étudiant unique (ex: ETU-2026-001)"
            value={mintForm.studentId}
            onChange={(e) => setMintForm({ ...mintForm, studentId: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Intitulé du diplôme (ex: Master IDIA)"
            value={mintForm.diplomaTitle}
            onChange={(e) => setMintForm({ ...mintForm, diplomaTitle: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Date d'émission (ex: 2026-11-19)"
            value={mintForm.issueDate}
            onChange={(e) => setMintForm({ ...mintForm, issueDate: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Mention (ex: Très Bien)"
            value={mintForm.grade}
            onChange={(e) => setMintForm({ ...mintForm, grade: e.target.value })}
            required
          />
          <button type="submit" disabled={loading}>
            Émettre le diplôme
          </button>
        </form>
      </section>

      {/* Section 3 : Révocation Admin */}
      <section style={{ border: "1px solid #ddd", padding: "1rem", borderRadius: 8 }}>
        <h2>Révoquer un certificat (Admin)</h2>
        <form onSubmit={handleRevoke} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="number"
            min="0"
            placeholder="Cert ID (ex: 0)"
            value={revokeCertId}
            onChange={(e) => setRevokeCertId(e.target.value)}
            style={{ padding: "0.4rem" }}
          />
          <button type="submit" disabled={loading}>
            Révoquer
          </button>
        </form>
      </section>
    </div>
  );
}