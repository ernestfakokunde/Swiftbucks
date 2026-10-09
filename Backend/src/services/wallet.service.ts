import { randomBytes } from "node:crypto";
import { db } from "../prisma/db.js";
import { hashPassword } from "../lib/password.js";
import {
  createTransferRecipient,
  initiateTransfer,
  PaystackError,
} from "../lib/paystack.js";
import { resolveBankAccount } from "./bank.service.js";
import { AppError } from "../lib/errors.js";
import { withdrawalFeeKobo, paystackTransferCostKobo, stampDutyKobo, totalDepositFeeKobo } from "../lib/fees.js";

export { AppError };

function isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error
        && (error as { code?: unknown }).code === "23505";
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
     if (amountKobo < 50_000n) throw new AppError(400, "Amount too small");
     const feeKobo = BigInt(totalDepositFeeKobo(Number(amountKobo)));
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
            const holding = await tx.orm.public.Account.where({
                kind:"SYSTEM_PAYSTACK_HOLDING"
            }).first();
            if (!holding) throw new Error("SYSTEM_PAYSTACK_HOLDING account is missing");
            const paystackFees = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYSTACK_FEES" }).first();
            const platformFees = await tx.orm.public.Account.where({ kind: "SYSTEM_PLATFORM_FEES" }).first();
            if (!paystackFees || !platformFees) throw new Error("Deposit fee system accounts are missing");
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
            amountKobo: amountKobo - feeKobo,
            });
            await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: paystackFees.id,
            amountKobo: 0n,
            });
            await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: platformFees.id,
            amountKobo: feeKobo,
            });
            return { transactionId: transaction.id, duplicate: false, feeKobo: feeKobo.toString() }
        })
 }

 export async function withdraw (userId:number, amountKobo: bigint, idempotencyKey: string, input: {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
 }){
    if (amountKobo < 50_000n || amountKobo > 10_000_000_000n) {
        throw new AppError(400, "Invalid withdrawal amount");
    }
    const feeKobo = BigInt(withdrawalFeeKobo(Number(amountKobo)));
    const estimatedCostKobo = BigInt(paystackTransferCostKobo(Number(amountKobo)) + stampDutyKobo(Number(amountKobo)));
    const wallet = await db.orm.public.Account.where({
        userId,
        kind: "USER_WALLET",
    }).first();
    if (!wallet) throw new AppError(404, 'wallet not found');

    const accountLast4 = input.accountNumber.slice(-4);
    const existing = await db.orm.public.Withdrawal.where({ userId, idempotencyKey }).first();
    if (existing) {
        if (
            BigInt(existing.amountKobo) !== amountKobo ||
            existing.bankCode !== input.bankCode ||
            existing.accountLast4 !== accountLast4
        ) {
            throw new AppError(409, "Idempotency key reused with different details");
        }
        return { transactionId: existing.transactionId, duplicate: true, status: existing.status };
    }

    const reference = `wd_${randomBytes(16).toString("hex")}`;
    let result: { transactionId: number; withdrawalId?: number; duplicate: boolean; status: string };
    try {
      result = await db.transaction(async (tx)=>{
        await tx.query(
            db.raw.sql`SELECT lock_key AS lock
                FROM (
                    SELECT hashtext(${idempotencyKey}) AS lock_key,
                           pg_advisory_xact_lock(hashtext(${idempotencyKey})) AS acquired
                ) advisory_lock`
            .returnsRow({ lock: "pg/int4@1" })
            .build(),
        );
        const lockedExisting = await tx.orm.public.Withdrawal.where({ userId, idempotencyKey }).first();
        if (lockedExisting) {
            if (
                BigInt(lockedExisting.amountKobo) !== amountKobo ||
                lockedExisting.bankCode !== input.bankCode ||
                lockedExisting.accountLast4 !== accountLast4
            ) {
                throw new AppError(409, "Idempotency key reused with different details");
            }
            return { transactionId: lockedExisting.transactionId, duplicate: true, status: lockedExisting.status };
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
        if (balance < amountKobo + feeKobo) {
            throw new AppError(400, "Insufficient funds");
}

        // Implementation for the withdrawal transaction
        const payoutHolding = await tx.orm.public.Account.where({
            kind:"SYSTEM_PAYOUT_HOLDING"
        }).first();
        if (!payoutHolding) throw new Error("SYSTEM_PAYOUT_HOLDING account is missing");
        const platformFees = await tx.orm.public.Account.where({
            kind:"SYSTEM_PLATFORM_FEES"
        }).first();
        if (!platformFees) throw new Error("SYSTEM_PLATFORM_FEES account is missing");

        const transaction = await tx.orm.public.Transaction.create({
            reference,
            type:"WITHDRAWAL",
            status: "PENDING"
        })

        await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: wallet.id,
            amountKobo: -(amountKobo + feeKobo),
        })

        await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: payoutHolding.id,
            amountKobo: BigInt(amountKobo),
        })
        await tx.orm.public.LedgerEntry.create({
            transactionId: transaction.id,
            accountId: platformFees.id,
            amountKobo: feeKobo,
        })

        const withdrawal = await tx.orm.public.Withdrawal.create({
            reference,
            transactionId: transaction.id,
            userId,
            amountKobo,
            feeKobo,
            estimatedCostKobo,
            bankCode: input.bankCode,
            accountNumber: null,
            bankName: input.bankName,
            accountLast4,
            accountName: input.accountName,
            idempotencyKey,
        });
        return { transactionId: transaction.id, withdrawalId: withdrawal.id, duplicate: false, status: "PENDING" as const };
      });
    } catch (error) {
        if (isUniqueViolation(error)) {
            const duplicate = await db.orm.public.Withdrawal.where({ userId, idempotencyKey }).first();
            if (duplicate) {
                if (
                    BigInt(duplicate.amountKobo) !== amountKobo ||
                    duplicate.bankCode !== input.bankCode ||
                    duplicate.accountLast4 !== accountLast4
                ) {
                    throw new AppError(409, "Idempotency key reused with different details");
                }
                return { transactionId: duplicate.transactionId, duplicate: true, status: duplicate.status };
            }
        }
        throw error;
    }

    if (result.duplicate) return result;

    let resolved: { account_name: string };
    try {
        resolved = await resolveBankAccount(input.accountNumber, input.bankCode);
    } catch (error) {
        await reverseWithdrawal(reference, "FAILED");
        throw error;
    }
    if (resolved.account_name !== input.accountName) {
        await reverseWithdrawal(reference, "FAILED");
        throw new AppError(409, "Bank account name changed. Please verify it again.");
    }
    await db.orm.public.Withdrawal.where({ id: result.withdrawalId }).update({
        accountName: resolved.account_name,
    });

    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) throw new Error("User missing for withdrawal " + reference);

    let recipient: { recipient_code: string };
    try {
        recipient = await createTransferRecipient({
            name: resolved.account_name,
            accountNumber: input.accountNumber,
            bankCode: input.bankCode,
        });
    } catch (error) {
        if (error instanceof PaystackError && error.definite) {
            await reverseWithdrawal(reference, "FAILED");
            console.error("Paystack rejected withdrawal recipient:", error);
            throw new AppError(502, "Paystack rejected this bank account. Your balance was restored.");
        }
        console.error("WITHDRAWAL_OUTCOME_UNKNOWN", reference, error);
        return result;
    }

    try {
        await db.orm.public.Withdrawal.where({ id: result.withdrawalId }).update({
            recipientCode: recipient.recipient_code,
        });
    } catch (error) {
        console.error("Could not save withdrawal recipient code:", error);
    }

    let transfer: { transfer_code: string; status?: string };
    try {
        transfer = await initiateTransfer({
            amountKobo,
            recipientCode: recipient.recipient_code,
            reference,
        });
    } catch (error) {
        if (error instanceof PaystackError && error.definite) {
            await reverseWithdrawal(reference, "FAILED");
            console.error("Paystack rejected withdrawal:", error);
            throw new AppError(502, "Paystack rejected this withdrawal. Your balance was restored.");
        }
        console.error("WITHDRAWAL_OUTCOME_UNKNOWN", reference, error);
        return result;
    }

    if (transfer.status === "otp") {
        console.error("WITHDRAWAL_OTP_REQUIRED", reference, "OTP must be disabled in the Paystack dashboard.");
        await reverseWithdrawal(reference, "FAILED");
        throw new AppError(502, "This withdrawal requires OTP. Disable OTP in Paystack before retrying.");
    }

    try {
        await db.orm.public.Withdrawal.where({ id: result.withdrawalId }).update({
            transferCode: transfer.transfer_code,
        });
    } catch (error) {
        console.error("Could not save withdrawal transfer code:", error);
    }
    return result;
}

export async function settleWithdrawal(input: {
    reference: string;
    status: "SUCCESS" | "FAILED" | "REVERSED";
    amountKobo?: number | undefined;
    currency?: string | undefined;
    costKobo?: number | undefined;
}) {
    await db.transaction(async (tx) => {
        await tx.query(
            db.raw.sql`SELECT id FROM "Withdrawal" WHERE reference = ${input.reference} FOR UPDATE`
                .returnsRow({ id: "pg/int4@1" })
                .build(),
        );
        const withdrawal = await tx.orm.public.Withdrawal.where({ reference: input.reference }).first();
        if (!withdrawal) return;

        if (input.status === "SUCCESS") {
            if (withdrawal.status !== "PENDING") return;
            if (input.currency !== "NGN" || input.amountKobo !== Number(withdrawal.amountKobo)) {
                console.error("WITHDRAWAL_AMOUNT_MISMATCH", input.reference);
                return;
            }
            const paystackHolding = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYSTACK_HOLDING" }).first();
            const payoutHolding = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYOUT_HOLDING" }).first();
            const paystackFees = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYSTACK_FEES" }).first();
            if (!paystackHolding || !payoutHolding || !paystackFees) {
                throw new Error("Withdrawal settlement system accounts are missing");
            }
            const costKobo = input.costKobo ?? Number(withdrawal.estimatedCostKobo);
            if (input.costKobo === undefined) console.warn("WITHDRAWAL_COST_ESTIMATED", input.reference);
            if (!Number.isSafeInteger(costKobo) || costKobo < 0) {
                throw new Error(`Invalid withdrawal cost for ${input.reference}`);
            }
            const amount = BigInt(withdrawal.amountKobo);
            const cost = BigInt(costKobo);
            const settlementEntries = [amount + cost, -amount, -cost];
            if (settlementEntries.reduce((sum, value) => sum + value, 0n) !== 0n) {
                throw new Error(`Withdrawal settlement does not balance for ${input.reference}`);
            }
            const settlement = await tx.orm.public.Transaction.where({
                reference: `${input.reference}_settle`,
            }).first();
            if (!settlement) {
                const created = await tx.orm.public.Transaction.create({
                    reference: `${input.reference}_settle`,
                    type: "WITHDRAWAL_SETTLEMENT",
                    status: "COMPLETED",
                });
                await tx.orm.public.LedgerEntry.create({
                    transactionId: created.id,
                    accountId: paystackHolding.id,
                    amountKobo: settlementEntries[0]!,
                });
                await tx.orm.public.LedgerEntry.create({
                    transactionId: created.id,
                    accountId: payoutHolding.id,
                    amountKobo: settlementEntries[1]!,
                });
                await tx.orm.public.LedgerEntry.create({
                    transactionId: created.id,
                    accountId: paystackFees.id,
                    amountKobo: settlementEntries[2]!,
                });
            }
            const transaction = await tx.orm.public.Transaction.where({ id: withdrawal.transactionId }).first();
            if (!transaction) return;
            await tx.orm.public.Transaction.where({ id: transaction.id }).update({ status: "COMPLETED" });
            await tx.orm.public.Withdrawal.where({ id: withdrawal.id }).update({ status: "SUCCESS" });
            return;
        }

        if (input.status === "FAILED" && withdrawal.status !== "PENDING") return;
        if (input.status === "REVERSED" && withdrawal.status !== "PENDING" && withdrawal.status !== "SUCCESS") return;
        if (input.status === "REVERSED" && withdrawal.status === "SUCCESS") {
            console.error("WITHDRAWAL_REVERSED_AFTER_SUCCESS", input.reference);
        }

        const reversalReference = `${input.reference}_reversal`;
        const existingReversal = await tx.orm.public.Transaction.where({ reference: reversalReference }).first();
        if (existingReversal) return;
        const wallet = await tx.orm.public.Account.where({ userId: withdrawal.userId, kind: "USER_WALLET" }).first();
        const payoutHolding = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYOUT_HOLDING" }).first();
        const platformFees = await tx.orm.public.Account.where({ kind: "SYSTEM_PLATFORM_FEES" }).first();
        const paystackHolding = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYSTACK_HOLDING" }).first();
        const paystackFees = await tx.orm.public.Account.where({ kind: "SYSTEM_PAYSTACK_FEES" }).first();
        if (!wallet || !payoutHolding || !platformFees || !paystackHolding || !paystackFees) {
            throw new Error("Withdrawal system accounts missing for " + input.reference);
        }
        const amount = BigInt(withdrawal.amountKobo);
        const fee = BigInt(withdrawal.feeKobo);
        const reserveEntries = [amount + fee, -amount, -fee];
        const entries: Array<{ accountId: number; amountKobo: bigint }> = [
            { accountId: wallet.id, amountKobo: reserveEntries[0]! },
            { accountId: payoutHolding.id, amountKobo: reserveEntries[1]! },
            { accountId: platformFees.id, amountKobo: reserveEntries[2]! },
        ];
        const settlement = await tx.orm.public.Transaction.where({
            reference: `${input.reference}_settle`,
        }).first();
        if (settlement) {
            console.error("WITHDRAWAL_REVERSED_AFTER_SUCCESS", input.reference);
            const settlementEntries = await tx.orm.public.LedgerEntry.where({
                transactionId: settlement.id,
            }).all();
            const paystackFeeEntry = settlementEntries.find((entry) => entry.accountId === paystackFees.id);
            if (!paystackFeeEntry) throw new Error(`Withdrawal settlement fee entry missing for ${input.reference}`);
            const cost = -BigInt(paystackFeeEntry.amountKobo);
            entries.push(
                { accountId: paystackHolding.id, amountKobo: -(amount + cost) },
                { accountId: payoutHolding.id, amountKobo: amount },
                { accountId: paystackFees.id, amountKobo: cost },
            );
        }
        if (entries.reduce((sum, entry) => sum + entry.amountKobo, 0n) !== 0n) {
            throw new Error(`Withdrawal reversal does not balance for ${input.reference}`);
        }
        const reversal = await tx.orm.public.Transaction.create({
            reference: reversalReference,
            type: "WITHDRAWAL_REVERSAL",
            status: "COMPLETED",
        });
        for (const entry of entries) {
            await tx.orm.public.LedgerEntry.create({
                transactionId: reversal.id,
                accountId: entry.accountId,
                amountKobo: entry.amountKobo,
            });
        }
        await tx.orm.public.Withdrawal.where({ id: withdrawal.id }).update({ status: input.status });
    });
}

async function reverseWithdrawal(reference: string, status: "FAILED" | "REVERSED") {
    await settleWithdrawal({ reference, status });
}

// P2p wallet serviceaddition for wallet to wallet transfers
 export async function p2pTransfer(senderId:number, receiverusername: string, amountKobo: bigint, reference: string){

    if (!Number.isInteger(senderId) || senderId <= 0) {
        throw new AppError(400, "Invalid sender id");
    }
     if (amountKobo < 100n || amountKobo > 10_000_000_000n) {
         throw new AppError(400, "Invalid transfer amount");
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
        const ownedEntry = await db.orm.public.LedgerEntry.where({
            transactionId: existing.id,
            accountId: senderWallet.id,
        }).first();
        if (!ownedEntry) {
            throw new AppError(409, "Reference belongs to another transaction");
        }
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

    try {
      return await db.transaction(async(tx)=>{
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
      });
    } catch (error) {
        if (isUniqueViolation(error)) {
            const duplicate = await db.orm.public.Transaction.where({ reference }).first();
            if (duplicate) {
                const ownedEntry = await db.orm.public.LedgerEntry.where({
                    transactionId: duplicate.id,
                    accountId: senderWallet.id,
                }).first();
                if (ownedEntry) return { transactionId: duplicate.id, duplicate: true };
                throw new AppError(409, "Reference belongs to another transaction");
            }
        }
        throw error;
    }
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
    const withdrawal = transaction.type === "WITHDRAWAL"
        ? await db.orm.public.Withdrawal.where({ transactionId: transaction.id }).first()
        : null;
    let title = "Transaction";

    if (transaction.type === "DEPOSIT") title = "Added money";
    else if (transaction.type === "WITHDRAWAL") title = "Withdrawal";
    else if (transaction.type === "WITHDRAWAL_REVERSAL") title = "Withdrawal reversed";
    else if (transaction.type === "TRANSFER") {
      const name = await otherPartyName(transaction.id, wallet.id);
      title = amount < BigInt(0) ? `Sent to ${name}` : `Received from ${name}`;
    }

    items.push({
      id: entry.id,
      title,
      type: transaction.type,
      status: transaction.status,
      amountKobo: withdrawal ? (-BigInt(withdrawal.amountKobo)).toString() : amount.toString(),
      feeKobo: withdrawal ? BigInt(withdrawal.feeKobo).toString() : undefined,
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