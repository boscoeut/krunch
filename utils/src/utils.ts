import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";


export const fetchOrCreateAccount = async (program: any,
    name: string,
    seeds: Array<any>,
    createMethod: string,
    args: Array<any>,
    additionalAccounts?: any) => {
    const address = await findAddress(program, seeds);
    try {
        const acct = await program.account[name].fetch(address);
        return acct;
    } catch (err) {
        console.log(`Account not found: ${name} Address: ${address} `);
        console.log('Initializing ' + name);
        const accounts = { [name]: address, ...(additionalAccounts || {}), }
        console.log('Initializing accounts ' + JSON.stringify(accounts));
        const tx = await program?.methods[createMethod](...args).accounts(accounts).rpc();
        console.log("fetchOrCreateAccount", tx);
        return await program.account[name].fetch(address);
    }
}

export const fetchAccount = async (program: any, name: string, seeds: Array<String | PublicKey | Number>) => {
    const address = await findAddress(program, seeds);
    console.log('fetchAccount', name)
    const acct = await program.account[name].fetch(address);
    return acct;
}


export const findAddress = async (program: any, args: any) => {
    console.log('findAddress args',args)
    const buffer = args.map((arg:any) => {
        if (typeof arg === 'string') {
            return Buffer.from(arg)
        } else if (arg.toBuffer) {
            return arg.toBuffer()
        } else if (typeof arg === 'number') {
            return new anchor.BN(arg.toString()).toArrayLike(Buffer, "le", 2)
        } else {

            console.log("invalid type", arg)
            throw new Error("invalid type")
        }
    });
    const [account] =
        await anchor.web3.PublicKey.findProgramAddress(
            buffer,
            program.programId as any
        );
    console.log(`findAddress ${args[0]} ${account.toString()}`)
    return account
}