import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
export declare const findAddress: (program: any, args: Array<String | PublicKey | Number | any>) => Promise<anchor.web3.PublicKey>;
export declare const fetchOrCreateAccount: (program: any, name: string, seeds: Array<String | PublicKey | Number>, createMethod: string, args: Array<any>, additionalAccounts?: any) => Promise<any>;
export declare const fetchAccount: (program: any, name: string, seeds: Array<String | PublicKey | Number>) => Promise<any>;
