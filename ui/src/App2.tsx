import * as anchor from "@coral-xyz/anchor";
import '@fontsource/inter';
import Button from '@mui/joy/Button';
import {
  AnchorProvider,
  Program,
} from '@project-serum/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import './App.css';
import idl from './idl/krunch.json';
import logo from './logo.svg';


const opts = {
  preflightCommitment: "processed"
}

const programID = new PublicKey(idl.metadata.address);

function App() {
  const walletState = useWalletModal();
  const wallet = useWallet();
  const getBalance = async () => {
    const provider = await getProvider();
    const balance = await provider.connection.getBalance(provider.wallet.publicKey);

    console.log("Wallet balance in SOL: ", balance / LAMPORTS_PER_SOL);

    const program = new Program(idl as any, programID as any, provider);
    const exchangeBuffer = Buffer.from("exchange");
    const [exchangeRef] =
      await anchor.web3.PublicKey.findProgramAddress(
        [exchangeBuffer],
        program.programId
      );

    try {
      const exchange: any = await program.account.exchange.fetch(exchangeRef);
      console.log("exchange tokenAmount is: ", exchange.basis.toNumber());

    } catch (err) {
      console.log("Transaction error: ", err);
      console.log('initialize exchange');
      const tx = await program.methods.initializeExchange().accounts({
        exchange: exchangeRef
      }).rpc();
      console.log("initializeExchange", tx);
    }

  }
  async function open() {
    walletState.setVisible(true);
  }
  async function disconnect() {
    try {
      await wallet.disconnect();
      console.log("Wallet disconnected");

    } catch (err) {
      console.error("Failed to disconnect wallet", err);
    }
  }
  async function getProvider() {
    /* create the provider and return it to the caller */
    /* network set to local network for now */
    const network = "http://127.0.0.1:8899";
    const connection = new Connection(network, opts.preflightCommitment as any);

    const provider = new AnchorProvider(
      connection, wallet as any, opts.preflightCommitment as any,
    );
    return provider;
  }

  async function calculate() {
    const provider = await getProvider()
    /* create the program interface combining the idl, program ID, and provider */
    const program = new Program(idl as any, programID as any, provider);
    try {
      const tx = await program.methods.calculate().accounts({
      }).view();
      console.log("calculate", tx.toNumber());
      //setValue(account.count.toString());
    } catch (err) {
      console.log("Transaction error: ", err);
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        {!wallet.connected &&
          <div>
            <Button onClick={open}>Open Wallet Chooser</Button>
          </div>
        }
        {wallet.connected &&
          <div>
            <Button onClick={disconnect}>Disconnect Wallet</Button>
            <Button variant="solid" onClick={calculate}>Interact with Program</Button>
          </div>
        }
        <p>
          Editss <code>src/App.tsx</code> and save to reload.
        </p>
        <Button variant="solid" onClick={getBalance}>Get Balance</Button>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
