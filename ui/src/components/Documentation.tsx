import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import Link from '@mui/joy/Link';
import KSheet from './KSheet';
import AppTitle from './AppTitle';
import PageHeader from './PageHeader';
import {useKrunchStore} from '../hooks/useKrunchStore';

export default function Documentation() {
    const { appInfo} = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))

    const leverage = appInfo.leverage;

    const docs = {
        "Overview": [
            <>
                <div>Welcome to the documentation for the <AppTitle variant={"doc"} /> (DeFi) protocol. <AppTitle variant={"doc"} /> provides a secure and efficient way for traders to trade both long and short positions with unique features:</div>
                <ul>
                    <li><strong>No Liquidations:</strong> Unlike other DeFi trading protocols, <AppTitle variant={"doc"} /> does not liquidate positions, so you do not have to constantly monitor your positions or fear sudden volatility.</li>
                    <li><strong>No Funding Rates: </strong><AppTitle variant={"doc"} /> eliminates funding rates, allowing you to keep your positions open without worrying about volatile funding rates that can eat into your profits.</li>
                    <li><strong>Low Trading Fees:</strong> We strive to provide trading fees that are on the low side of DeFi trading protocols, so you can keep more of your profits.</li>
                    <li><strong>Variety of Trading Opportunities:</strong> Crypto, Equities or Forex trading opportunities.</li>
                </ul>
                <div><AppTitle variant={"doc"} /> is targeted towards traders who want to trade long and short positions while reducing risk to momentary fluctuations in price or volatility. With our unique features, you can trade without worrying about liquidations and focus on your trading strategy.</div>
            </>],
        "How It Works": [
            <>
                <div><AppTitle variant={"doc"} /> eliminates liquidation events and funding rates by placing all trades against a funding pool. The funding pool assumes the counterparty risk to user trades, and funding pool recipients are rewarded in one of two ways:</div>
                <ul>
                    <li><strong>Trading Fees:</strong> Funding pool participants receive 100% of all trading fees.</li>
                    <li><strong>Profits:</strong> The funding pool takes the opposite side of all user-based trades. If the aggregate of all trades results in a net loss, the funding pool becomes worth more than the initial investment that was placed into the pool. Conversely, if the aggregate of all trades results in a net gain, the funding pool becomes worth less than the initial investment. However, this event is somewhat mitigated by the trading fees that the pool receives for each transaction. Additionally, the funding pool limits the opening of excess long or short positions to maintain a balanced pool of trades.</li>
                </ul>
            </>
        ],

        "How to Use": [<>
            <div>There are two ways for users to interact with {appInfo.docAppReference}:</div>
            <ul>
                <li><strong>Opening a long or short position:</strong> Users can open a long or short position, betting that the price action of the underlying trade will move in their favor.</li>
                <li><strong>Depositing into the Pool:</strong> Users can deposit money into the pool with the expectation that the combination of trading fees and aggregate trades will result in a positive return.</li>
            </ul>
        </>],
        "Risks": [<>
            <div>The following risks exist in {appInfo.docAppReference}:</div>
            <ul>
                <li>
                    <div>For Users Opening Positions:</div>
                    <ul>
                        <li><strong>Price Action:</strong> If the price moves against your position, you will be exposed to losses.</li>
                        <li><strong>Pool Liquidity:</strong> If there is not enough liquidity in the pool, new positions will not be able to be opened. In the event that the pool is substantially valued less than the opposite positions due to a sudden change in price, it might not be possible to close a position due to a lack of liquidity in the pool. This risk is mitigated by (1) enforcing an over-collateralized pool and (2) enforcing both long and short positions. However, it is possible that if an asset&apos;s price moves dramatically, the pool could hold less value than the opposite user positions.</li>
                    </ul>
                </li>
                <li>
                    <div>For Users Depositing into the Pool:</div>
                    <ul>
                        <li><strong>Pool Liquidity:</strong> In the event that the pool is valued less than the opposite positions due to an aggregate value of user positions, it is possible to lose a portion of your pool investment. This risk is mitigated by diverting 100% of user fees into the pool and enforcing long and short positions against the pool to be balanced.</li>
                    </ul>
                </li>
                <li>
                    <div>For All Users:</div>
                    <ul>
                        <li><strong>Smart Contract Risks:</strong> If a bug is found in the protocol, the protocol has the potential of being exploited. While every effort has been made to develop a secure application, this risk is present for every DeFi protocol.</li>
                        <li><strong>Blockchain Risks:</strong> If the underlying protocol is exploited, then the smart contract as a whole is at risk.</li>
                    </ul>
                </li>
            </ul>
        </>],
        "Leveraged Trading": [<>Each account can open positions up to <AppTitle variant={"message"} message={`${leverage}x`} />  leverage.</>],
        "Account Funding": [<><AppTitle variant={"doc"} /> only supports deposits and withdrawals made using {appInfo.stableCoin}.</>],
        "Price Feeds": [<><AppTitle variant={"doc"} /> relies on <Link href="https://docs.chain.link/data-feeds/price-feeds" target="_blank">ChainLink Oracles</Link> for all price feeds.</>],
        "Conclusion": [<>
            <div>The {appInfo.appTitle} protocol was created by developers who love DeFi but have been burned too many times by hacks, exploits, and rug pulls. We hope users appreciate the following:</div>
            <ul>
                <li><strong>No Protocol Token:</strong> There is no governance token, trading token, or collateral token. Users can only deposit and withdraw {appInfo.stableCoin}.</li>
                <li><strong>Immutable Smart Contract:</strong> The contract is immutable and cannot be upgraded. Once deployed, the only functions available to the admin are:
                    <ul>
                        <li>Adding a new trading asset</li>
                        <li>Disabling an asset from opening new positions against it. This may be necessary if the price feed is no longer supported for the asset.</li>
                        <li>Adjusting the trading fee for an asset</li>
                        <li>Changing the admin address to a new address</li>
                    </ul>
                 </li>
                <li><strong>All Trading Fees go to the Pool:</strong> The authors of the protocol use the protocol the same as every other user. Everyone is playing by the same rules, and all trading fees go to the pool.</li>
            </ul>
        </>]
    }
    return (
        <Box
            sx={{
                flex: 1,
                width: '100%',
                p: 0,
            }}
        >
            <KSheet>
                <Typography level="title-lg">Table of Contents</Typography>
                <ol>
                    {Object.keys(docs).map((key: any) => {
                        return <li key={key}><Link href={`#${key}`}>{key}</Link></li>
                    })}
                </ol>

                {Object.entries(docs).map(([key, value], i) => {
                    return <Box key={i}>
                        <Typography id={key} sx={{ mb: 1, mt: 1 }} level="title-md">{i + 1}. {key}</Typography>
                        <Box key={i} sx={{ marginLeft: 2 }}>
                            {value.map((v: any, i: any) => {
                                return <div key={i}>{v}</div>
                            })}
                        </Box>
                    </Box>
                })}

            </KSheet>
        </Box>
    )
} 