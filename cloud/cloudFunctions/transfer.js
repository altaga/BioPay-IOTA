const functions = require("@google-cloud/functions-framework");
const Firestore = require("@google-cloud/firestore");
const { loadDID } = require("./util.js");
const { IotaDID } = require("@iota/identity-wasm/node/index.js");
const { getFullnodeUrl, IotaClient } = require("@iota/iota-sdk/client");
const { decodeIotaPrivateKey } = require("@iota/iota-sdk/cryptography");
const { Ed25519Keypair } = require("@iota/iota-sdk/keypairs/ed25519");
const { Transaction } = require("@iota/iota-sdk/transactions");

const db = new Firestore({
  projectId: "bio",
  keyFilename: "credential.json",
});

const rpcUrl = getFullnodeUrl("testnet");
const client = new IotaClient({ url: rpcUrl });

functions.http("helloHttp", async (req, res) => {
  try {
    if( req.body.card){
      const { card, amount, to, coin } = req.body;
      const Accounts = db.collection("bioPayCard");
      const query = await Accounts.where("card", "==", card).get();
      if (query.empty) {
        throw "Query Empty";
      }
      const holderJSON = query.docs[0].data();
      const { publicKey, privateKey } = holderJSON;
      console.log(holderJSON)
      const privateKeyBuffer = decodeIotaPrivateKey(privateKey);
      const signer = Ed25519Keypair.fromSecretKey(privateKeyBuffer.secretKey);
      const transaction = await createTx({
        publicKey,
        amount: epsilonRound(parseFloat(amount), 9) * Math.pow(10, 9),
        to,
        coin,
      });
      const result = await client.signAndExecuteTransaction({
        signer,
        transaction,
      });
      const receipt = await client.waitForTransaction({ digest: result.digest });
      res.send(
        JSON.stringify({
          digest: receipt.digest
        })
      );
      }
    else{
      const { did, amount, to, coin } = req.body;
      const Accounts = db.collection("bioPayDID");
      const query = await Accounts.where("did", "==", did).get();
      if (query.empty) {
        throw "Query Empty";
      }
      const holderJSON = query.docs[0].data();
      const { keyId, publicKeyJwk, document, id } = holderJSON;
      const { identityClient } = await loadDID({
        keyId,
        publicKeyJwk,
        document,
        id,
      });
      const loadedDID = IotaDID.fromJSON(did);
      await identityClient.resolveDid(loadedDID);
      const { publicKey, privateKey } = holderJSON;
      const privateKeyBuffer = decodeIotaPrivateKey(privateKey);
      const signer = Ed25519Keypair.fromSecretKey(privateKeyBuffer.secretKey);
      const transaction = await createTx({
        publicKey,
        amount: epsilonRound(parseFloat(amount), 9) * Math.pow(10, 9),
        to,
        coin,
      });
      const result = await client.signAndExecuteTransaction({
        signer,
        transaction,
      });
      const receipt = await client.waitForTransaction({ digest: result.digest });
      res.send(
        JSON.stringify({
          digest: receipt.digest
        })
      );
      }
  } catch (e) {
    console.log(e);
    res.send(
      JSON.stringify({
        res: "BAD REQUEST",
      })
    );
  }
});

// Utils

async function createTx(transaction) {
  const tx = new Transaction();
  let coinToSplit;
  if (transaction.coin === "0x2::iota::IOTA") {
    coinToSplit = tx.gas;
  } else {
    const coins = await client.getAllCoins({
      owner: transaction.publicKey,
    });
    const [primaryCoin, ...mergeCoins] = coins.data.filter(
      (coin) => coin.coinType === transaction.coin
    );
    const primaryCoinInput = tx.object(primaryCoin.coinObjectId);
    if (mergeCoins.length) {
      tx.mergeCoins(
        primaryCoinInput,
        mergeCoins.map((coin) => tx.object(coin.coinObjectId))
      );
    }
    coinToSplit = primaryCoinInput;
  }
  const [coin] = tx.splitCoins(coinToSplit, [parseInt(transaction.amount)]); // Split coins for the transaction
  tx.transferObjects([coin], transaction.to); // Set the recipient address
  return tx;
}

function epsilonRound(number, decimalPlaces = 2) {
  const factor = 10 ** decimalPlaces;
  return Math.round((number + Number.EPSILON) * factor) / factor;
}