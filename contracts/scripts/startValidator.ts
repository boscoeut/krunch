import * as constants from 'utils/src/constants'
import { exec as execCb, spawn } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execCb);
console.log('start validator')

const tokens = ["USDC_MINT", "SOL_MINT", "USDT_MINT", "BTC_MINT", "ETH_MINT",
    "SOL_USD_FEED", "USDC_USD_FEED", "USDT_USD_FEED", "ETH_USD_FEED", "BTC_USD_FEED"]

async function runCommands() {
    let args = ""
    for (const token of tokens) {
        const tokenAddress = constants[token].toString()
        args += ` --account ${tokenAddress} ./cloned_accounts/${token}.json`
        console.log(token, constants[token].toString())
        const cmd = `solana account -u m ${tokenAddress} --output-file ./cloned_accounts/${token}.json --output json-compact`
        console.log(cmd)
        const result = await exec(cmd)
        console.log(result)

        if (token.endsWith("MINT")) {
            const pcmd = `python3 -c "import base64;import base58;import json;usdc = json.load(open('./cloned_accounts/${token}.json'));data = bytearray(base64.b64decode(usdc['account']['data'][0]));data[4:4+32] = base58.b58decode('${constants.ADMIN_ADDRESS}');print(base64.b64encode(data));usdc['account']['data'][0] = base64.b64encode(data).decode('utf8');json.dump(usdc, open('./cloned_accounts/${token}.json', 'w'))"`
            const presult = await exec(pcmd)
            console.log(presult)
        }
    }

    const dump = await exec(`solana program dump -u m ${constants.CHAINLINK_PROGRAM} ./cloned_accounts/chainlink.so`)
    console.log(dump)
    const startCmd = `-r --bpf-program ${constants.CHAINLINK_PROGRAM} ./cloned_accounts/chainlink.so ${args}`
    console.log(startCmd)
    const ls = spawn(`solana-test-validator ${startCmd}`,[],{shell:true});
    ls.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    ls.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    ls.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
    console.log('done')
}
(async () => {
    await runCommands()
})();

