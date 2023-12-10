import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
export declare const fetchOrCreateAccount: (program: any, name: string, seeds: Array<any>, createMethod: string, args: Array<any>, additionalAccounts?: any) => Promise<any>;
export declare const fetchAccount: (program: any, name: string, seeds: Array<String | PublicKey | Number>) => Promise<any>;
export declare const findAddress: (program: any, args: any) => Promise<anchor.web3.PublicKey>;
