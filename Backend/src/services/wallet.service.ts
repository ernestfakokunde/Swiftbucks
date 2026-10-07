import { db } from "../prisma/db";


export class AppError extends Error {
    constructor(public status: Number, message: string) {
        super(message);
    }
}

export async function createUserWithWallet(input: {
    email: string;
    username: string;
}){
    return db.transaction(async (tx) => {
        const user = await tx.orm.public.User.create(input);

        const wallet = await tx.orm.public.Account.create({
            userId: user.id,
            kind: "USER_WALLET",
            currency: "NGN",
        })
        return { user, wallet};
    })
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

 export async function withdraw (userId:number, amountKobo: bigint, reference: string){
    const wallet = await db.orm.public.Account.where({
        userId,
        kind: "USER_WALLET",
    }).first();
    if (!wallet) throw new AppError(404, 'wallet not found');

     const existing = await db.orm.public.Transaction.where({ reference}).first();

        if(existing){
            return { transactionId: existing.id, duplicate: true};
        }

     

    return db.transaction( async (tx)=>{

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
            status: "COMPLETED"
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

        return { transactionId: transaction.id, duplicate: false}
    })
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

            const receiver = await db.orm.public.User.where({ username: receiverusername }).first();
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
        username
    }).first();
    if (!user) throw new AppError(404, "user not found")
        return{
    username: user.username, displayName: user.name || user.username}
}