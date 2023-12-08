import * as anchor from "@coral-xyz/anchor";
import '@fontsource/inter';
import { PublicKey } from "@solana/web3.js";
import Button from '@mui/joy/Button';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import '../App.css';
import useProgram from "../hooks/useProgram";
import useAccounts from "../hooks/useAccounts";
import Table from '@mui/joy/Table';
import { useState } from 'react';
import { getAssociatedTokenAddress, getMint } from "@solana/spl-token"
import Input from '@mui/joy/Input';
import { useKrunchStore } from "../hooks/useKrunchStore";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
const SOL_USD = "CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt"
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const CHAINLINK = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

export default function WalletTest() {
    const PRICE_DECIMALS = 10 ** 9;
    const FEE_DECIMALS = 10 ** 4;
    const MARKET_WEIGHT_DECIMALS = 10 ** 4;
    const AMOUNT_DECIMALS = 10 ** 9;
    const LEVERAGE_DECIMALS = 10 ** 4;
    const { getProgram, getProvider, wallet } = useProgram();
    const [_price, setPrice] = useState(10);
    const [_makerFee, setMakerFee] = useState(.1);
    const [_marketWeight, setMarketWeight] = useState(.1);
    const [_leverage, setLeverage] = useState(1);
    const [_takerFee, setTakerFee] = useState(.2);
    const [_marketIndex, setMarketIndex] = useState(1);
    const [_amount, setAmount] = useState(1)
    const [_bankAmount, setBankAmount] = useState(100)
    const [_userBalance, setUserBalance] = useState(0)
    const [_programBalance, setProgramBalance] = useState(0)

    const { findAddress, fetchOrCreateAccount, fetchAccount } = useAccounts();

    const [temp, setTemp] = useState({} as any);
    const getBalance = async () => {
        const provider = await getProvider();
        const balance = await provider.connection.getBalance(provider.wallet.publicKey);
        console.log("Wallet balance in SOL: ", (balance || 0) / LAMPORTS_PER_SOL);
        setTemp({ ...temp, balance: (balance || 0) / LAMPORTS_PER_SOL })
    }

    const initializeExchange = async () => {
        const exchange: any = await fetchOrCreateAccount('exchange', ['exchange'], 'initializeExchange', []);
        setTemp({ ...temp, exchange: exchange })
    }

    const createUserAccount = async () => {
        const provider = await getProvider();
        const exchange: any = await fetchOrCreateAccount('userAccount',
            ['user_account',
                provider.wallet.publicKey],
            'createUserAccount', []);
        console.log('createUserAccount', exchange)
        setTemp({ ...temp, user_account: exchange })
    }

    const getPrice = async () => {
        const program = await getProgram();
        const tx = await program.methods.getPrice().accounts({
            chainlinkFeed: "CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt",
            chainlinkProgram: "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
        }).view();
        console.log(tx)
        console.log(tx.round.toNumber() / (10 ** tx.decimals))
    }

    const createUserPosition = async (marketIndex: number) => {
        const provider = await getProvider();
        const exchange: any = await fetchOrCreateAccount('userPosition',
            ['user_position',
                provider.wallet.publicKey,
                marketIndex],
            'addUserPosition', [new anchor.BN(marketIndex)],
            {
                userAccount: await findAddress(['user_account', provider.wallet.publicKey]),
                market: await findAddress(['market', marketIndex]),
            });
        console.log('createUserPosition', exchange)
        setTemp({ ...temp, user_position: exchange })
    }

    const executeTrade = async (marketIndex: number, amount: number) => {
        const provider = await getProvider();
        try {
            const program = await getProgram();
            const tx = await program.methods.executeTrade(
                new anchor.BN(marketIndex),
                new anchor.BN(amount * AMOUNT_DECIMALS)
            ).accounts({
                exchange: await findAddress(['exchange']),
                market: await findAddress(['market', marketIndex]),
                userAccount: await findAddress(['user_account', provider.wallet.publicKey]),
                userPosition: await findAddress(['user_position', provider.wallet.publicKey, marketIndex]),
            }).rpc();
            console.log("executeTrade", tx);
            const acct: any = await fetchAccount('userPosition',
                ['user_position',
                    provider.wallet.publicKey,
                    marketIndex]);
            console.log('executeTrade', acct)
            setTemp({
                ...temp,
                user_position: acct
            })
        } catch (err) {
            console.log("Transaction error: ", err);
        }

    }

    const availableCollateral = async () => {
        const provider = await getProvider();
        try {
            const program = await getProgram();
            const tx = await program.methods.availableCollateral(_marketIndex).accounts({
                exchange: await findAddress(['exchange']),
                market: await findAddress(['market', _marketIndex]),
                userAccount: await findAddress(['user_account', provider.wallet.publicKey]),
                userPosition: await findAddress(['user_position', provider.wallet.publicKey, _marketIndex]),
            }).view();
            console.log("exchangeCollateralAvailable", `${renderItem(tx.exchangeCollateralAvailable)}`);
            console.log("marketCollateralAvailable", `${renderItem(tx.marketCollateralAvailable)}`);
            console.log("maxMarketCollateralAvailable", `${renderItem(tx.maxMarketCollateralAvailable)}`);
            console.log("userCollateralAvailable", `${renderItem(tx.userCollateralAvailable)}`);
        } catch (err) {
            console.log("availableCollateral error: ", err);
        }

    }

    const resetAccounts = async (marketIndex: number) => {
        const provider = await getProvider();
        try {
            const program = await getProgram();
            const tx = await program.methods.resetAccounts(new anchor.BN(marketIndex)).accounts({
                exchange: await findAddress(['exchange']),
                market: await findAddress(['market', marketIndex]),
                userAccount: await findAddress(['user_account', provider.wallet.publicKey]),
                userPosition: await findAddress(['user_position', provider.wallet.publicKey, marketIndex]),
            }).rpc();
            console.log("resetAccounts", tx);
            await getAccounts();
        } catch (err) {
            console.log("Transaction error: ", err);
        }

    }

    const updateMarket = async (marketIndex: number, price: number, makerFee: number, takerFee: number, leverage: number, marketWeight: number) => {
        try {
            const program = await getProgram();
            const tx = await program.methods.updateMarket(
                new anchor.BN(marketIndex),
                new anchor.BN(price * PRICE_DECIMALS),
                new anchor.BN(makerFee * FEE_DECIMALS),
                new anchor.BN(takerFee * FEE_DECIMALS),
                new anchor.BN(leverage * LEVERAGE_DECIMALS),
                new anchor.BN(marketWeight * MARKET_WEIGHT_DECIMALS),
            ).accounts({
                market: await findAddress(['market', marketIndex]),
                exchange: await findAddress(['exchange']),
            }).rpc();
            console.log("updateMarket", tx);
            const acct: any = await fetchAccount('market',
                ['market',
                    marketIndex]);
            console.log('updateMarket', acct)
            setTemp({
                ...temp,
                [`market_${marketIndex}`]: acct
            })
        } catch (err) {
            console.log("Transaction error: ", err);
        }
    }

    const deposit = async (amount: number) => {
        try {
            const program = await getProgram();
            const provider = await getProvider();
            const exchangeAddress = await findAddress(['exchange'])
            const escrowAccount = await findAddress([
                exchangeAddress,
                USDC_MINT])
            let usdcTokenAccount = await getAssociatedTokenAddress(
                USDC_MINT, //mint
                provider.wallet.publicKey, //owner
            )
            console.log('usdcTokenAccount', usdcTokenAccount.toString()    ) 
            let userBalance: any = await provider.connection.getTokenAccountBalance(usdcTokenAccount)
            console.log("usdcTokenAccount Before deposit", userBalance.value.amount);
       
            await program.methods.deposit(new anchor.BN(amount * AMOUNT_DECIMALS)).accounts({
                userTokenAccount:usdcTokenAccount,
                mint: USDC_MINT,
                exchange: exchangeAddress,
                escrowAccount: escrowAccount,
                userAccount: await findAddress(['user_account', provider.wallet.publicKey]),
                owner: provider.wallet.publicKey
            }).rpc();
            const acct: any = await fetchAccount('userAccount', ['user_account', provider.wallet.publicKey]);
            console.log('deposit', acct)
            setTemp({
                ...temp,
                user_account: acct
            })
        } catch (err) {
            console.log("Transaction error: ", err);
        }
    }

    const withdraw = async (amount: number) => {
        try {
            const program = await getProgram();
            const provider = await getProvider();
            const exchangeAddress = await findAddress(['exchange'])
            const escrowAccount = await findAddress([
                exchangeAddress,
                USDC_MINT])
            let usdcTokenAccount = await getAssociatedTokenAddress(
                USDC_MINT, //mint
                provider.wallet.publicKey, //owner
            )

            await program.methods.withdraw(new anchor.BN(amount * AMOUNT_DECIMALS)).accounts({
                userTokenAccount: new PublicKey(usdcTokenAccount),
                mint: USDC_MINT,
                exchange: exchangeAddress,
                escrowAccount: escrowAccount,
                userAccount: await findAddress(['user_account', provider.wallet.publicKey]),
                owner: provider.wallet.publicKey
            }).rpc();
            const acct: any = await fetchAccount('userAccount', ['user_account', provider.wallet.publicKey]);
            console.log('withdraw', acct)
            setTemp({
                ...temp,
                user_account: acct
            })
        } catch (err) {
            console.log("Transaction error: ", err);
        }
    }
    const addMarket = async (marketIndex: number) => {
        const exchange = await findAddress(['exchange']);
        const acct: any = await fetchOrCreateAccount(
            'market',
            ['market', marketIndex],
            'addMarket', [
            new anchor.BN(marketIndex),
            new anchor.BN(_takerFee * FEE_DECIMALS),
            new anchor.BN(_makerFee * FEE_DECIMALS),
            new anchor.BN(_leverage * LEVERAGE_DECIMALS),
            new anchor.BN(_marketWeight * MARKET_WEIGHT_DECIMALS)],
            {
                exchange
            });
        setTemp({ ...temp, [`market_${marketIndex}`]: acct })
    }

    const mintTokens = async () => {
        try {
            const provider = await getProvider();
            const mint = await getMint(provider.connection, new PublicKey(USDC))
            console.log("SUPPLY", mint.supply.toString())

        } catch (err) {
            console.log("Mint error: ", err);
        }
    }

    async function getAccounts() {
        try {
            const provider = await getProvider();
            setTemp({
                ...temp,
                exchange: await fetchAccount('exchange', ['exchange']),
                market_1: await fetchAccount('market', ['market', 1]),
                user_position: await fetchAccount('userPosition', ['user_position', provider.wallet.publicKey, 1]),
                user_account: await fetchAccount('userAccount', ['user_account', provider.wallet.publicKey]),
            })
        } catch (err) {
            console.log("getAccounts error: ", err);
        }
    }

    async function calculate() {
        try {
            const program = await getProgram();
            const tx = await program.methods.calculate().accounts({
            }).view();
            console.log(`calculate`, `${tx}`)
            setTemp({
                ...temp,
                calculate: tx.toNumber()
            })
        } catch (err) {
            console.log("Transaction error: ", err);
        }
    }

    async function getUSDCBalances() {
        const provider = await getProvider()
        const exchangeAddress = await findAddress(['exchange'])
        const escrowAccount = await findAddress([
            exchangeAddress,
            USDC_MINT])
        let programBalance: any = await provider.connection.getTokenAccountBalance(escrowAccount)
        console.log("programBalance Before deposit", programBalance.value.amount);
        setProgramBalance(programBalance.value.uiAmount);


        let usdcTokenAccount = await getAssociatedTokenAddress(
            USDC_MINT, //mint
            provider.wallet.publicKey, //owner
        )

        let userBalance: any = await provider.connection.getTokenAccountBalance(usdcTokenAccount)
        console.log("userBalance Before deposit", userBalance.value.amount);
        setUserBalance(userBalance.value.uiAmount);
    }

    async function calculateFee() {
        try {
            const program = await getProgram();

            const tx = await program.methods.calculateFee(
                new anchor.BN(100 * PRICE_DECIMALS),
                new anchor.BN(1 * AMOUNT_DECIMALS),
                new anchor.BN(0.2 * FEE_DECIMALS)).accounts({
                }).view();
            console.log(`calculateFee`, `${tx}`)
            setTemp({
                ...temp,
                calculate: tx.toNumber()
            })
        } catch (err) {
            console.log("Transaction error: ", err);
        }
    }

    const renderItem = (item: any, decimals = AMOUNT_DECIMALS) => {
        if (!item) {
            return ""
        } else if (item instanceof PublicKey) {
            return `${item.toString()}`
        } else if (item instanceof anchor.BN) {
            return `${(item.toNumber() / decimals).toFixed(3)}`
        } else if (typeof item === 'number') {
            return `${(item / decimals).toFixed(3)}`
        } else {
            return `${item.toString()}`
        }
    }

    const rows: any = []
    if (temp.exchange) {
        rows.push({ ...temp.exchange, name: 'exchange' })
    }
    if (temp.user_account) {
        rows.push({ ...temp.user_account, name: 'user_account' })
    }
    if (temp.market_1) {
        rows.push({ ...temp.market_1, name: 'market_1' })
    }
    if (temp.user_position) {
        rows.push({ ...temp.user_position, name: 'user_position' })
    }

    const bears = useKrunchStore(state => state.bears)
    const increasePopulation = useKrunchStore((state) => state.increase)
    return (
        <div>
            <h1>{bears} bears</h1>
            <Button onClick={()=>increasePopulation(1)}>Increment Bears</Button>
            {wallet.connected &&
                <div>
                    <Table>
                        <thead>
                            <tr>
                                <th style={{ width: '15%' }}>Account</th>
                                <th>market_index</th>
                                <th>market_weight</th>
                                <th>Total</th>
                                <th>Unrealized</th>
                                <th>basis</th>
                                <th>pnl</th>
                                <th>fees</th>
                                <th>margin_used</th>
                                <th>collateral_value</th>
                                <th>token_amount</th>
                                <th>current_price</th>
                                {/* <th>taker_fee</th> */}
                                {/* <th>maker_fee</th> */}
                                {/* <th>leverage</th> */}
                                {/* <th>number_of_markets</th> */}
                                {/* <th>owner</th> */}
                                {/* <th>admin</th> */}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row: any) => {

                                const total =
                                    (row.fees?.toNumber() || 0) +
                                    (row.pnl?.toNumber() || 0) +
                                    (row.collateralValue?.toNumber() || 0)
                                const currBasis = ((row.tokenAmount?.toNumber() || 0) * (Number(_price * PRICE_DECIMALS))) / PRICE_DECIMALS
                                const unrealized = row.tokenAmount && row.tokenAmount?.toNumber() !== 0 ? row.basis?.toNumber() + currBasis : 0

                                return <tr key={row.name}>
                                    <td>{renderItem(row.name)}</td>
                                    <td>{renderItem(row.marketIndex, 1)}</td>
                                    <td>{renderItem(row.marketWeight, MARKET_WEIGHT_DECIMALS)}</td>
                                    <td>{renderItem(total)}</td>
                                    <td>{renderItem(unrealized)}</td>
                                    <td>{renderItem(row.basis)}</td>
                                    <td>{renderItem(row.pnl)}</td>
                                    <td>{renderItem(row.fees)}</td>
                                    <td>{renderItem(row.marginUsed)}</td>
                                    <td>{renderItem(row.collateralValue)}</td>
                                    <td>{renderItem(row.tokenAmount)}</td>
                                    <td>{renderItem(row.currentPrice, PRICE_DECIMALS)}</td>
                                    {/* <td>{renderItem(row.takerFee, FEE_DECIMALS)}</td> */}
                                    {/* <td>{renderItem(row.makerFee, FEE_DECIMALS)}</td> */}
                                    {/* <td>{renderItem(row.leverage, LEVERAGE_DECIMALS)}</td> */}
                                    {/* <td>{renderItem(row.numberOfMarkets)}</td> */}
                                    {/* <td>{renderItem(row.owner)}</td> */}
                                    {/* <td>{renderItem(row.admin)}</td> */}

                                </tr>
                            })}
                        </tbody>
                    </Table>
                    <Table>
                        <thead>
                            <tr>
                                <th style={{ width: '15%' }}>Function</th>
                                <th style={{ width: '15%' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>USDC Balance</td>
                                <td>
                                    <div>User: {`${_userBalance}`}</div>
                                    <div>Program: {`${_programBalance}`}</div>
                                    <Button size="sm" variant="soft" onClick={() => getUSDCBalances()}>Get Balances</Button></td>
                            </tr>
                            <tr>
                                <td>Market Index</td>
                                <td><Input value={`${_marketIndex}`} onChange={(e) => setMarketIndex(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Price </td>
                                <td><Input value={`${_price}`} onChange={(e) => setPrice(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Amount</td>
                                <td><Input value={`${_amount}`} onChange={(e) => setAmount(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Bank Amount</td>
                                <td><Input value={`${_bankAmount}`} onChange={(e) => setBankAmount(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Maker Fee %</td>
                                <td><Input value={`${_makerFee}`} onChange={(e) => setMakerFee(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Taker Fee %</td>
                                <td><Input value={`${_takerFee}`} onChange={(e) => setTakerFee(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Leverage</td>
                                <td><Input value={`${_leverage}`} onChange={(e) => setLeverage(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Market Weight %</td>
                                <td><Input value={`${_marketWeight}`} onChange={(e) => setMarketWeight(Number(e.target.value))} /></td>
                            </tr>
                            <tr>
                                <td>Refresh Accounts</td>
                                <td><Button size="sm" variant="soft" onClick={getAccounts}>Refresh Accounts</Button></td>
                            </tr>
                            <tr>
                                <td>Reset Accounts</td>
                                <td><Button size="sm" variant="soft" onClick={() => resetAccounts(1)}>Reset Accounts</Button></td>
                            </tr>

                            <tr>
                                <td>Execute Trade</td>
                                <td>
                                    <Button size="sm" variant="soft" onClick={() => executeTrade(_marketIndex, _amount)}>Trade</Button>

                                </td>
                            </tr>
                            <tr>
                                <td>Update Market</td>
                                <td>
                                    <Button size="sm" variant="soft" onClick={() => updateMarket(_marketIndex, _price, _makerFee, _takerFee, _leverage, _marketWeight)}>Update Market</Button>

                                </td>
                            </tr>
                            <tr>
                                <td>Depsoit</td>
                                <td><Button size="sm" variant="soft" onClick={() => deposit(_bankAmount)}>deposit</Button></td>
                            </tr>
                            <tr>
                                <td>Withdraw</td>
                                <td><Button size="sm" variant="soft" onClick={() => withdraw(_bankAmount)}>withdraw</Button></td>
                            </tr>
                            <tr>
                                <td>Calculate Fee</td>
                                <td><Button size="sm" variant="soft" onClick={calculateFee}>Calculate Fee</Button></td>
                            </tr>
                            <tr>
                                <td>calculate</td>
                                <td><Button size="sm" variant="soft" onClick={calculate}>Calculate</Button></td>
                            </tr>
                            <tr>
                                <td>availableCollateral</td>
                                <td><Button size="sm" variant="soft" onClick={availableCollateral}>availableCollateral</Button></td>
                            </tr>
                            <tr>
                                <td>initializeExchange</td>
                                <td><Button size="sm" variant="soft" onClick={initializeExchange}>initializeExchange</Button></td>
                            </tr>
                            <tr>
                                <td>CreateUserAccount</td>
                                <td><Button size="sm" variant="soft" onClick={createUserAccount}>createUserAccount</Button></td>
                            </tr>

                            <tr>
                                <td>CreateUserPosition</td>
                                <td><Button size="sm" variant="soft" onClick={() => createUserPosition(_marketIndex)}>createUserPosition</Button></td>
                            </tr>

                            <tr>
                                <td>getBalance</td>
                                <td><Button size="sm" variant="soft" onClick={getBalance}>Get Balance</Button></td>
                            </tr>
                            <tr>
                                <td>Get Price</td>
                                <td><Button size="sm" variant="soft" onClick={getPrice}>Get Price</Button></td>
                            </tr>
                            <tr>
                                <td>Add Market</td>
                                <td><Button size="sm" variant="soft" onClick={() => addMarket(_marketIndex)}>Add Market</Button></td>
                            </tr>
                            <tr>
                                <td>Mint Tokens</td>
                                <td><Button size="sm" variant="soft" onClick={() => mintTokens()}>Mint Tokens</Button></td>
                            </tr>


                        </tbody>
                    </Table>
                </div>
            }
        </div>
    );
}