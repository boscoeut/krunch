import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

async function sendToken(connection: Connection, 
    sender: PublicKey, 
    recipient: PublicKey, 
    amount: number, 
    tokenMint: PublicKey,
     senderTokenAccount: PublicKey) {
    // Create a transaction
    const transaction = new Transaction();

    // Create the instruction to transfer the token
    const transferInstruction = Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        senderTokenAccount, // Sender's token account
        recipient,          // Recipient's token account
        sender,             // Sender's public key
        [],                 // Multi-signature accounts (if any)
        amount              // Amount to send
    );

    // Add the instruction to the transaction
    transaction.add(transferInstruction);

    // Send and confirm the transaction
    const signature = await sendAndConfirmTransaction(connection, transaction,[]);
    console.log('Transaction successful with signature:', signature);
}

// Example usage
(async () => {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const sender = new PublicKey('YOUR_SENDER_PUBLIC_KEY');
    const recipient = new PublicKey('RECIPIENT_PUBLIC_KEY');
    const amount = 100; // Amount of tokens to send
    const tokenMint = new PublicKey('TOKEN_MINT_ADDRESS'); // The mint address of the token
    const senderTokenAccount = new PublicKey('SENDER_TOKEN_ACCOUNT_ADDRESS'); // The sender's token account

    await sendToken(connection, sender, recipient, amount, tokenMint, senderTokenAccount);
})();