
import { useEffect, useState } from 'react';

import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import idl from '../idl/krunch.json';

import {
    AnchorProvider,
    Program,
} from '@project-serum/anchor';
const opts = {
    preflightCommitment: "processed"
}

const programID = new PublicKey(idl.metadata.address);

const useProgram = () => {
    const [program, setProgram] = useState(undefined as Program | undefined);
    const [provider, setProvider] = useState(undefined as AnchorProvider | undefined);
    const wallet = useWallet();
    async function createProvider() {
        /* create the provider and return it to the caller */
        /* network set to local network for now */
        const network = "https://shiny-halibut-7vpx9xx4wj2x579-8899.app.github.dev/";
        const connection = new Connection(network, opts.preflightCommitment as any);

        const provider = new AnchorProvider(
            connection, wallet as any, opts.preflightCommitment as any,
        );
        return provider;
    }

    async function setupProgram() {
        if (program && provider) {
            return {
                program,
                provider
            }   
        } else {
            try {
                const _provider = await createProvider();
                const _program = new Program(idl as any, programID as any, _provider);
                setProgram(_program);
                setProvider(_provider);
                console.log('*********** program set up');
                return {
                    program: _program,
                    provider: _provider
                }
            } catch (x) {
                console.log('error setting up program', x);
                return {
                    program: undefined,
                    provider: undefined
                }
            }
        }
    }

    const getProgram = async () => {
        const result = await setupProgram();
        return result.program as Program
    }
    const getProvider = async () => {
        const result = await setupProgram();
        return result.provider as AnchorProvider
    }

    return {
        getProgram,
        getProvider,
        wallet
    };
};
export default useProgram;
