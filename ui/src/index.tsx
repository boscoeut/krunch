import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { MathWalletAdapter, PhantomWalletAdapter, SafePalWalletAdapter, SolflareWalletAdapter, SolongWalletAdapter, } from '@solana/wallet-adapter-wallets';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import './index.css';
import reportWebVitals from './reportWebVitals';
import { NETWORK_URL } from 'utils/dist/constants';
require('@solana/wallet-adapter-react-ui/styles.css');
const wallets = [
  /* view list of available wallets at https://github.com/solana-labs/wallet-adapter#wallets */
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  new SafePalWalletAdapter(),
  new SolongWalletAdapter(),
  new MathWalletAdapter(),
]


const network = NETWORK_URL;
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Router>
            <App />
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode >
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
