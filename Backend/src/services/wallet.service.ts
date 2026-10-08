import { db } from "../prisma/db.js";
import { hashPassword } from "../lib/password.js";
import { createTransferRecipient, initiateTransfer } from "../lib/paystack.js";


export class AppError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}
 

export async function createUserWithWallet(input: {
  email: string;
  username: string;
  password: string;
}) {
  
  const email = input.email.toLowerCase();
  const username = input.username.toLowerCase();

  const emailTaken = await db.orm.public.User.where({ email }).first();
  const usernameTaken = await db.orm.public.User.where({ username }).first();
  if (emailTaken || usernameTaken) {
    throw new AppError(409, "Email or username already in use");
  }

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const user = await tx.orm.public.User.create({ email, username, passwordHash });

    await tx.orm.public.Account.create({
      userId: user.id,
      kind: "USER_WALLET",
      currency: "NGN",
    });

    // only the safe fields: never the hash
    return { id: user.id, email: user.email, username: user.username };
  });
}

export async function getBalanceKobo (userId: number) {
    const wallet = await db.orm.public.Account.where({
        userId,
        kind: "USER_WALLET",
    }).first();

    if (!wallet){
        throw new AppError(404, "Wallet not found");
    }

    const entries = await db.orm.public.LedgerEntry.where({
        accountId: wallet.id,
    }).all();

    let total = BigInt(0);
    for (const entry of entries) {
        total += BigInt(entry.amountKobo);
    }
    return total;
}

//deposit and withdraw functions will be added here in the future
 export async function deposit (userId:number, amountKobo: bigint, reference: string){
    const wallet = await db.orm.public.Account.where({
        userId,
        kind: "USER_WALLET",
    }).first()

    if (!wallet) throw new AppError(404, 'wallet not found')

        const existing = await db.orm.public.Transaction.where({ reference}).first();

        if(existing){
            return { transactionId: existing.id, duplicate: true};
        }

        return db.transaction(async(tx)=>{
            let holding = await tx.orm.public.Account.where({
                kind:"SYSTEM_PAYSTACK_HOLDING"
            }).first();

                    if (!holding) {
            holding = await tx.orm.public.Account.create({
                kind: "SYSTEM_PAYSTACK_HOLDING",
                currency: "NGN",
            });
            }
            const transaction = await tx.orm.public.Transaction.create({
                reference,
                type:"DEPOSIT",
                status: "COMPLETED"
            });

            await tx.orm.public.LedgerEntry.create({
                transactionId: transaction.id,
                accountId: holding.id,
                amountKobo: BigInt(-amountKobo),
            })

            await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: wallet.id,
            amountKobo: BigInt(amountKobo),
            });
                return { transactionId: transaction.id, duplicate: false}
        })
 }

 export async function withdraw (userId:number, amountKobo: bigint, reference: string, input: {
    bankCode: string;
    accountNumber: string;
 }){
    const wallet = await db.orm.public.Account.where({
        userId,
        kind: "USER_WALLET",
    }).first();
    if (!wallet) throw new AppError(404, 'wallet not found');

     const existing = await db.orm.public.Transaction.where({ reference}).first();

        if(existing){
            return { transactionId: existing.id, duplicate: true, status: existing.status };
        }

     

    return db.transaction( async (tx)=>{
        await tx.query(
            db.raw.sql`SELECT pg_advisory_xact_lock(hashtext(${reference})) AS lock`
            .returnsRow({ lock: "pg/int8@1" })
            .build(),
        );
        const lockedExisting = await tx.orm.public.Transaction.where({ reference }).first();
        if (lockedExisting) {
            return { transactionId: lockedExisting.id, duplicate: true, status: lockedExisting.status };
        }

        //lock the wallet row to prevent race conditions

        await tx.query(
             db.raw.sql`SELECT id FROM "Account" WHERE id = ${wallet.id} FOR UPDATE`
            .returnsRow({ id: 'pg/int4@1' })
            .build()
        )

        //then check balance
                const entries = await tx.orm.public.LedgerEntry.where({
            accountId: wallet.id,
        }).all();

        let balance = BigInt(0);
        for (const entry of entries) {
            balance += BigInt(entry.amountKobo);
        }
        if (balance < amountKobo) {
            throw new AppError(400, "Insufficient funds");
}

        // Implementation for the withdrawal transaction
        let holding = await tx.orm.public.Account.where({
            kind:"SYSTEM_PAYSTACK_HOLDING"
        }).first();

        if (!holding) {
            holding = await tx.orm.public.Account.create({
                kind: "SYSTEM_PAYSTACK_HOLDING",
                currency: "NGN",
            });
        }

        const transaction = await tx.orm.public.Transaction.create({
            reference,
            type:"WITHDRAWAL",
            status: "PENDING"
        })

        await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: wallet.id,
            amountKobo: BigInt(-amountKobo),
        })

        await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: holding.id,
            amountKobo: BigInt(amountKobo),
        })

        const withdrawal = await tx.orm.public.Withdrawal.create({
            reference,
            transactionId: transaction.id,
            userId,
            amountKobo,
            bankCode: input.bankCode,
            accountNumber: input.accountNumber,
        });

        return { transactionId: transaction.id, withdrawalId: withdrawal.id, duplicate: false, status: "PENDING" }
    })
    .then(async (result) => {
        try {
            const user = await db.orm.public.User.where({ id: userId }).first();
            if (!user) throw new Error("User missing for withdrawal " + reference);
            const recipient = await createTransferRecipient({
                name: user.name ?? user.username,
                accountNumber: input.accountNumber,
                bankCode: input.bankCode,
            });
            await db.orm.public.Withdrawal.where({ id: result.withdrawalId }).update({
                recipientCode: recipient.recipient_code,
            });
            const transfer = await initiateTransfer({
                amountKobo,
                recipientCode: recipient.recipient_code,
                reference,
            });
            await db.orm.public.Withdrawal.where({ id: result.withdrawalId }).update({
                transferCode: transfer.transfer_code,
            });
            return result;
        } catch (error) {
            await reverseWithdrawal(reference, "FAILED");
            console.error("Paystack withdrawal failed:", error);
            throw new AppError(502, "Could not start the withdrawal. Your balance was restored.");
        }
    })
}

export async function settleWithdrawal(reference: string, status: "SUCCESS" | "FAILED") {
    const withdrawal = await db.orm.public.Withdrawal.where({ reference }).first();
    if (!withdrawal) return;
    if (withdrawal.status === status || withdrawal.status === "SUCCESS" || withdrawal.status === "FAILED") return;
    if (status === "FAILED") {
        await reverseWithdrawal(reference, status);
        return;
    }
    await db.transaction(async (tx) => {
        const transaction = await tx.orm.public.Transaction.where({ reference }).first();
        if (!transaction || transaction.status !== "PENDING") return;
        await tx.orm.public.Transaction.where({ id: transaction.id }).update({ status: "COMPLETED" });
        await tx.orm.public.Withdrawal.where({ id: withdrawal.id }).update({ status: "SUCCESS" });
    });
}

async function reverseWithdrawal(reference: string, status: "FAILED") {
    await db.transaction(async (tx) => {
        const transaction = await tx.orm.public.Transaction.where({ reference }).first();
        const withdrawal = await tx.orm.public.Withdrawal.where({ reference }).first();
        if (!transaction || !withdrawal || transaction.status !== "PENDING") return;
        const wallet = await tx.orm.public.Account.where({ userId: withdrawal.userId, kind: "USER_WALLET" }).first();
        const holding = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYSTACK_HOLDING" }).first();
        if (!wallet || !holding) throw new Error("Withdrawal accounts missing for " + reference);
        const reversal = await tx.orm.public.Transaction.create({
            reference: `${reference}_reversal`,
            type: "WITHDRAWAL_REVERSAL",
            status: "COMPLETED",
        });
        await tx.orm.public.LedgerEntry.create({
            transactionId: reversal.id, accountId: holding.id, amountKobo: -BigInt(withdrawal.amountKobo),
        });
        await tx.orm.public.LedgerEntry.create({
            transactionId: reversal.id, accountId: wallet.id, amountKobo: BigInt(withdrawal.amountKobo),
        });
        await tx.orm.public.Transaction.where({ id: transaction.id }).update({ status });
        await tx.orm.public.Withdrawal.where({ id: withdrawal.id }).update({ status });
    });
}

// P2p wallet serviceaddition for wallet to wallet transfers
 export async function p2pTransfer(senderId:number, receiverusername: string, amountKobo: bigint, reference: string){

    if (!Number.isInteger(senderId) || senderId <= 0) {
        throw new AppError(400, "Invalid sender id");
    }

    const senderWallet = await db.orm.public.Account.where({
        userId: senderId,
        kind:"USER_WALLET"
    }).first()
    //confirm receiver wallet 
    if (!senderWallet) {
        throw new AppError(404, "Sender wallet not found");
    }

    //check for existing transaction with the same reference
    const existing = await db.orm.public.Transaction.where({ reference}).first();

    if(existing){
        return { transactionId: existing.id, duplicate: true};
    }

        const receiver = await db.orm.public.User.where({
            username: receiverusername.toLowerCase(),
        }).first();
        if (!receiver) throw new AppError(404, "Receiver not found");

        const receiverWallet = await db.orm.public.Account.where({
            userId: receiver.id,
            kind: "USER_WALLET",
        }).first();
        if (!receiverWallet) throw new AppError(404, "Receiver wallet not found");

    //compare sender and receiver to ensure they are not the same
    if (senderWallet.id === receiverWallet.id) {
        throw new AppError(400, "Sender and receiver cannot be the same");
    }

    return db.transaction(async(tx)=>{
        //lock the sender wallet row to prevent race conditions
        //we want to have a ordered lock on the smaller id so there
        //is no deadlock
        
        const lockOrder = [senderWallet.id, receiverWallet.id].sort((a,b)=> a-b);
        for (const id of lockOrder) {
            await tx.query(
                db.raw.sql`SELECT id FROM "Account" WHERE id = ${id} FOR UPDATE`
                .returnsRow({ id: 'pg/int4@1' })
                .build()
            )
        }

        //check sender wallet balance
        const entries = await tx.orm.public.LedgerEntry.where({
            accountId: senderWallet.id,
        }).all();

        let balance = BigInt(0);
        for (const entry of entries) {
            balance += BigInt(entry.amountKobo);
        }
        if (balance < amountKobo) {
            throw new AppError(400, "Insufficient funds");
}
        const transaction = await tx.orm.public.Transaction.create({
            reference,
            type:"TRANSFER",
            status: "COMPLETED"
        })

        await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: senderWallet.id,
            amountKobo: BigInt(-amountKobo),
        })

        await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: receiverWallet.id,
            amountKobo: BigInt(amountKobo)
        })

        return { transactionId: transaction.id, duplicate: false}
    })
}

//lookup user function to get user by username

export async function lookupUser(username: string){
    const user = await db.orm.public.User.where({
          username: username.toLowerCase(),
    }).first();
    if (!user) throw new AppError(404, "user not found")
        return{
    username: user.username, displayName: user.name || user.username}
}

//get transaction history
 export async function getTransactions(userId: number) {
  const wallet = await db.orm.public.Account.where({
    userId,
    kind: "USER_WALLET",
  }).first();

  if (!wallet) throw new AppError(404, "Wallet not found");

  const entries = await db.orm.public.LedgerEntry.where({
    accountId: wallet.id,
  }).all();

  // newest first (ids only go up over time), keep the latest 20
  const latest = entries.sort((a, b) => b.id - a.id).slice(0, 20);

  const items = [];
  for (const entry of latest) {
    const transaction = await db.orm.public.Transaction.where({
      id: entry.transactionId,
    }).first();
    if (!transaction) continue;

    const amount = BigInt(entry.amountKobo);
    let title = "Transaction";

    if (transaction.type === "DEPOSIT") title = "Added money";
    else if (transaction.type === "WITHDRAWAL") title = "Withdrawal";
    else if (transaction.type === "TRANSFER") {
      const name = await otherPartyName(transaction.id, wallet.id);
      title = amount < BigInt(0) ? `Sent to ${name}` : `Received from ${name}`;
    }

    items.push({
      id: entry.id,
      title,
      type: transaction.type,
      status: transaction.status,
      amountKobo: amount.toString(),
      createdAt: entry.createdAt,
    });
  }
  return items;
}

async function otherPartyName(transactionId: number, myWalletId: number) {
  const entries = await db.orm.public.LedgerEntry.where({ transactionId }).all();
  const other = entries.find((e) => e.accountId !== myWalletId);
  if (!other) return "someone";

  const account = await db.orm.public.Account.where({ id: other.accountId }).first();
  if (!account?.userId) return "someone";

  const user = await db.orm.public.User.where({ id: account.userId }).first();
  return user ? user.name || user.username : "someone";
}