# Swiftbucks Code Review Package

This document contains the requested current source files for review. It was generated from the working tree and intentionally excludes environment files, credentials, generated Prisma contract output, dependencies, and unrelated code.

## Review scope

- Backend deposit crediting, Paystack webhooks, wallet transfers, withdrawals, schema, server setup, authentication, and wallet routes/controllers.
- Frontend API client, Next.js API rewrite, authentication context, transfer/withdrawal hook, query client, wallet pages, and deposit completion page.

## `Backend/src/services/payment.service.ts`

```typescript
import { randomBytes } from "node:crypto";
import { db } from "../prisma/db.js";
import { initializePayment } from "../lib/paystack.js";
import { verifyTransaction } from "../lib/paystack.js";
import { AppError } from "./wallet.service.js";

export async function startDeposit(userId: number, amountKobo: number) {
  const user = await db.orm.public.User.where({ id: userId }).first();
  if (!user) throw new AppError(401, "Not logged in");

  const reference = `dep_${randomBytes(12).toString("hex")}`;

  await db.orm.public.paymentIntent.create({
    reference,
    userId,
    amountKobo: BigInt(amountKobo),
  });

  try {
    const data = await initializePayment({
      email: user.email,
      amountKobo,
      reference,
      callbackUrl: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/add-money/done`,
    });
    return { authorizationUrl: data.authorization_url, reference };
  } catch (err) {
    console.error("Paystack initialize failed:", err);
    throw new AppError(502, "Could not start the payment. Try again.");
  }
}

export async function depositStatus(userId: number, reference: string) {
  const intent = await db.orm.public.paymentIntent.where({ reference }).first();
  if (!intent || intent.userId !== userId) {
    throw new AppError(404, "Payment not found");
  }
  if (intent.status === "PENDING") {
    try {
      const payment = await verifyTransaction(reference);
      if (payment.status === "success") {
        await creditFromWebhook({
          event: "charge.success",
          data: { reference: payment.reference, amount: payment.amount, fees: payment.fees },
        });
      }
    } catch (error) {
      console.error("Paystack verification failed:", error);
    }
  }
  const current = await db.orm.public.paymentIntent.where({ reference }).first();
  return { status: current?.status ?? intent.status };
}

export async function creditFromWebhook(event: {
  event: string;
  data: { reference: string; amount: number; fees?: number | undefined };
}) {
  if (event.event !== "charge.success") return;

  const intent = await db.orm.public.paymentIntent.where({
    reference: event.data.reference,
  }).first();
  if (!intent) return;

  await db.transaction(async (tx) => {
    await tx.query(
      db.raw.sql`SELECT id FROM "paymentIntent" WHERE id = ${intent.id} FOR UPDATE`
        .returnsRow({ id: "pg/int4@1" })
        .build(),
    );

    const fresh = await tx.orm.public.paymentIntent.where({ id: intent.id }).first();
    if (!fresh || fresh.status !== "PENDING") return;

    if (BigInt(event.data.amount) !== BigInt(fresh.amountKobo)) {
      await tx.orm.public.paymentIntent.where({ id: fresh.id }).update({
        status: "MISMATCH",
      });
      console.error("Amount mismatch for", fresh.reference);
      return;
    }

    const wallet = await tx.orm.public.Account.where({
      userId: fresh.userId,
      kind: "USER_WALLET",
    }).first();
    if (!wallet) throw new Error("Wallet missing for intent " + fresh.reference);

    let holding = await tx.orm.public.Account.where({
      kind: "SYSTEM_PAYSTACK_HOLDING",
    }).first();
    if (!holding) {
      holding = await tx.orm.public.Account.create({
        kind: "SYSTEM_PAYSTACK_HOLDING",
        currency: "NGN",
      });
    }
    let fees = await tx.orm.public.Account.where({
      kind: "SYSTEM_PAYSTACK_FEES",
    }).first();
    if (!fees) {
      fees = await tx.orm.public.Account.create({
        kind: "SYSTEM_PAYSTACK_FEES",
        currency: "NGN",
      });
    }

    const transaction = await tx.orm.public.Transaction.create({
      reference: fresh.reference,
      type: "DEPOSIT",
      status: "COMPLETED",
    });

    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: holding.id,
      amountKobo: -BigInt(event.data.amount - (event.data.fees ?? 0)),
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: fees.id,
      amountKobo: -BigInt(event.data.fees ?? 0),
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: wallet.id,
      amountKobo: BigInt(fresh.amountKobo),
    });

    await tx.orm.public.paymentIntent.where({ id: fresh.id }).update({
      status: "SUCCESS",
    });
  });
}
```

## `Backend/src/controllers/payment.controller.ts`

```typescript
import type { Request, Response } from "express";
import { z } from "zod";
import { isValidSignature } from "../lib/paystack.js";
import {
  creditFromWebhook,
  depositStatus,
  startDeposit,
} from "../services/payment.service.js";
import { settleWithdrawal } from "../services/wallet.service.js";
import { getAuthenticatedUserId } from "../middleware/requireAuth.js";

const initSchema = z.object({
  amountKobo: z.number().int().min(10_000).max(10_000_000_000),
});

export async function initializeDeposit(req: Request, res: Response) {
  const parsed = initSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const result = await startDeposit(
    getAuthenticatedUserId(req),
    parsed.data.amountKobo,
  );
  return res.status(201).json(result);
}

export async function getDepositStatus(req: Request, res: Response) {
  const reference = z.string().min(1).safeParse(req.query.reference);
  if (!reference.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  return res
    .status(200)
    .json(await depositStatus(getAuthenticatedUserId(req), reference.data));
}

export async function paystackWebhook(req: Request, res: Response) {
  const signature = req.header("x-paystack-signature");
  if (!req.rawBody || !isValidSignature(req.rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  if (
    req.body?.event === "transfer.success" ||
    req.body?.event === "transfer.failed" ||
    req.body?.event === "transfer.reversed"
  ) {
    const reference = req.body.data?.reference;
    if (typeof reference !== "string") return res.sendStatus(400);
    await settleWithdrawal(
      reference,
      req.body.event === "transfer.success" ? "SUCCESS" : "FAILED",
    );
    return res.sendStatus(200);
  }
  await creditFromWebhook(req.body);
  return res.sendStatus(200);
}
```

## `Backend/src/routes/webhook.routes.ts`

```typescript
import { Router } from "express";
import { paystackWebhook } from "../controllers/payment.controller.js";

const router = Router();

router.post("/paystack", paystackWebhook);

export default router;
```

## `Backend/src/lib/paystack.ts`

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.paystack.co";

function secret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

async function paystackRequest<T>(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack request failed: ${json?.message ?? res.status}`);
  }
  return json.data as T;
}

export async function initializePayment(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}) {
  return paystackRequest<{ authorization_url: string; reference: string }>(
    "/transaction/initialize",
    {
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
    },
  );
}

export function createTransferRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
}) {
  return paystackRequest<{ recipient_code: string }>("/transferrecipient", {
    type: "nuban",
    name: input.name,
    account_number: input.accountNumber,
    bank_code: input.bankCode,
    currency: "NGN",
  });
}

export function initiateTransfer(input: {
  amountKobo: bigint;
  recipientCode: string;
  reference: string;
}) {
  return paystackRequest<{ transfer_code: string }>("/transfer", {
    source: "balance",
    amount: input.amountKobo.toString(),
    recipient: input.recipientCode,
    reference: input.reference,
    reason: "Swiftbuck wallet withdrawal",
  });
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack verification failed: ${json?.message ?? res.status}`);
  }
  return json.data as { reference: string; amount: number; fees?: number; status: string };
}

export function isValidSignature(rawBody: Buffer, signature: string | undefined) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## `Backend/src/services/wallet.service.ts`

```typescript
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
            db.raw.sql`SELECT lock_key AS lock
                FROM (
                    SELECT hashtext(${reference}) AS lock_key,
                           pg_advisory_xact_lock(hashtext(${reference})) AS acquired
                ) advisory_lock`
            .returnsRow({ lock: "pg/int4@1" })
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
```

## `Backend/src/prisma/contract.prisma`

```prisma
// use prisma-8

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  username  String   @unique
  name      String?
  passwordHash  String?
  createdAt TimestamptzString @default(now())
  updatedAt temporal.updatedAtString()

  accounts  Account[]
  sessions  Session[]
  withdrawals Withdrawal[]
}

model Account {
  id        Int      @id @default(autoincrement())
  userId    Int?
  kind      String
  currency  String   @default("NGN")

  user      User?    @relation(fields: [userId], references:[id])
  entries   LedgerEntry[]

  createdAt TimestamptzString @default(now())

  @@unique([userId, currency])
  @@index([userId])
}

model Transaction {
  id           Int               @id @default(autoincrement())
  reference    String            @unique
  type         String
  status       String            @default("PENDING")
  createdAt    TimestamptzString @default(now())
  updatedAt    temporal.updatedAtString()

  entries      LedgerEntry[]
  withdrawal   Withdrawal?
}

model LedgerEntry {
   id            Int               @id @default(autoincrement())
  transactionId Int
  accountId     Int
  amountKobo    BigInt
  createdAt     TimestamptzString @default(now())

  transaction   Transaction       @relation(fields: [transactionId], references: [id])
  account       Account           @relation(fields: [accountId], references: [id])

  @@index([transactionId])
  @@index([accountId])
}


model Session {
  id        Int               @id @default(autoincrement())
  tokenHash String            @unique
  userId    Int
  expiresAt TimestamptzString
  createdAt TimestamptzString @default(now())

  user      User              @relation(fields: [userId], references: [id])

  @@index([userId])
}

 model paymentIntent {
  id         Int               @id @default(autoincrement())
  reference  String            @unique
  userId     Int
  amountKobo BigInt
  status     String            @default("PENDING")
  createdAt  TimestamptzString @default(now())
  updatedAt  temporal.updatedAtString()

  user       User              @relation(fields: [userId], references: [id])

  @@index([userId])
}

model Withdrawal {
  id            Int      @id @default(autoincrement())
  reference     String   @unique
  transactionId Int      @unique
  userId        Int
  amountKobo    BigInt
  bankCode      String
  accountNumber String
  recipientCode String?
  transferCode  String?
  status        String   @default("PENDING")
  createdAt     TimestamptzString @default(now())
  updatedAt     temporal.updatedAtString()

  transaction Transaction @relation(fields: [transactionId], references: [id])
  user        User        @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([transferCode])
}
```

## `Backend/server.ts`

```typescript
import "dotenv/config";
import type { Request } from "express";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { db } from "./src/prisma/db.js";
import walletRoutes from "./src/routes/wallet.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import webhookRoutes from "./src/routes/webhook.routes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const app = express();
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

 app.use(express.json({
  limit: "10kb",
  verify: (req, _res, buf) => { (req as Request).rawBody = buf; },
}));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Hello Swiftbuck api at your service");
});
app.get("/health", (req, res) => {
  res.send("Swiftbuck api is healthy");
});

app.use("/api/auth", authRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api", walletRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

await db.connect();
app.listen(PORT, () => {
  console.log("Server is running quieltly on port " + PORT);
});
```

## `Backend/src/middleware/requireAuth.ts`

```typescript
import type { NextFunction, Request, Response } from "express";
import { db } from "../prisma/db.js";
import { hashToken } from "../services/auth.service.js";
import { AppError } from "../services/wallet.service.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      rawBody?: Buffer;
    }
  }
}

export function getAuthenticatedUserId(req: Request): number {
  if (req.userId === undefined) {
    throw new AppError(401, "Not logged in");
  }
  return req.userId;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.sid;
  if (!token) {
    throw new AppError(401, "Not logged in");
  }

  const session = await db.orm.public.Session.where({
    tokenHash: hashToken(token),
  }).first();

  if (!session) {
    throw new AppError(401, "Not logged in");
  }

  if (new Date(session.expiresAt) < new Date()) {
    await db.orm.public.Session.where({ id: session.id }).delete();
    throw new AppError(401, "Not logged in");
  }

  req.userId = session.userId;
  next();
}
```

## `Backend/src/routes/wallet.routes.ts`

```typescript
import { Router } from "express";
import {
  createUser,
  depositFunds,
  getBalance,
  getTransactionHistory,
  lookup,
  transferFunds,
  withdrawFunds,
} from "../controllers/wallet.controller.js";
import {
  getDepositStatus,
  initializeDeposit,
} from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  lookupLimiter,
  signupLimiter,
  walletPostLimiter,
} from "../middleware/rateLimit.js";

const router = Router();

router.post("/users", signupLimiter, createUser);
router.use(requireAuth);
router.get("/wallet/balance", getBalance);
router.get("/wallet/transactions", getTransactionHistory);
router.post("/wallet/deposit", walletPostLimiter, depositFunds);
router.post(
  "/wallet/deposit/initialize",
  walletPostLimiter,
  initializeDeposit,
);
router.get("/wallet/deposit/status", getDepositStatus);
router.post("/wallet/withdraw", walletPostLimiter, withdrawFunds);
router.post("/wallet/transfer", walletPostLimiter, transferFunds);
router.get("/users/lookup", lookupLimiter, lookup);

export default router;
```

## `Backend/src/controllers/wallet.controller.ts`

```typescript
import type { Request, Response } from "express";
import { z } from "zod";
import {
  createUserWithWallet,
  deposit,
  getBalanceKobo,
  getTransactions,
  lookupUser,
  p2pTransfer,
  withdraw,
  AppError,
} from "../services/wallet.service.js";
import { getAuthenticatedUserId } from "../middleware/requireAuth.js";

const createUserSchema = z.object({
  email: z.email(),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
  password: z.string().min(8).max(128),
});

const moneySchema = z.object({
  amountKobo: z.number().int().positive().max(10_000_000_000),
  reference: z.string().min(1).max(100),
});

const withdrawalSchema = moneySchema.extend({
  bankCode: z.string().regex(/^\d{3,6}$/),
  accountNumber: z.string().regex(/^\d{10}$/),
});

const transferSchema = moneySchema.extend({
  receiverUsername: z.string().min(1),
});

const lookupUserSchema = z.object({
  username: z.string().min(1),
});

export async function createUser(req: Request, res: Response) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await createUserWithWallet(parsed.data);
  return res.status(201).json(result);
}

export async function getBalance(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const balance = await getBalanceKobo(userId);
  return res.status(200).json({ balanceKobo: balance.toString() });
}

export async function depositFunds(req: Request, res: Response) {
  if (process.env.ALLOW_FAKE_DEPOSIT !== "true") {
    return res.status(404).json({ error: "Not found" });
  }

  const userId = getAuthenticatedUserId(req);
  const parsed = moneySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await deposit(
    userId,
    BigInt(parsed.data.amountKobo),
    parsed.data.reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function withdrawFunds(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const parsed = withdrawalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await withdraw(
    userId,
    BigInt(parsed.data.amountKobo),
    parsed.data.reference,
    { bankCode: parsed.data.bankCode, accountNumber: parsed.data.accountNumber },
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function transferFunds(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await p2pTransfer(
    userId,
    parsed.data.receiverUsername,
    BigInt(parsed.data.amountKobo),
    parsed.data.reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function lookup(req: Request, res: Response) {
  const parsed = lookupUserSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const user = await lookupUser(parsed.data.username);
  return res.status(200).json(user);
}

export async function getTransactionHistory(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const transactions = await getTransactions(userId);
  return res.status(200).json(transactions);
}
```

## `Backend/src/services/auth.service.ts`

```typescript
import { randomBytes, createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { db } from "../prisma/db.js";
import { AppError } from "./wallet.service.js";

export const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// a real hash of a throwaway password, used to keep timing the same
// when the email doesn't exist (see below)
const DUMMY_HASH = await hashPassword("not-a-real-password");

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function loginUser(emailInput: string, password: string) {
  const email = emailInput.toLowerCase();
  const user = await db.orm.public.User.where({ email }).first();

  // always run one verification, even for unknown emails
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);

  if (!user || !user.passwordHash || !ok) {
    throw new AppError(401, "Invalid email or password");
  }

  const token = randomBytes(32).toString("hex");

  await db.orm.public.Session.create({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
  });

  return {
    token,
    user: { id: user.id, email: user.email, username: user.username },
  };
}

export async function logoutUser(token: string) {
  const session = await db.orm.public.Session.where({
    tokenHash: hashToken(token),
  }).first();

  if (session) {
    await db.orm.public.Session.where({ id: session.id }).delete();
  }
}

export async function getMe(userId: number) {
  const user = await db.orm.public.User.where({ id: userId }).first();
  if (!user) {
    throw new AppError(401, "Not logged in");
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
  };
}
```

## `Backend/src/controllers/auth.controller.ts`

```typescript
import type { Request, Response } from "express";
import { z } from "zod";
import {
  getMe,
  loginUser,
  logoutUser,
  SESSION_COOKIE_OPTIONS,
  SESSION_MS,
} from "../services/auth.service.js";
import { AppError } from "../services/wallet.service.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const { token, user } = await loginUser(
    parsed.data.email,
    parsed.data.password,
  );

  res.cookie("sid", token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_MS,
  });

  return res.status(200).json(user);
}

export async function me(req: Request, res: Response) {
  if (req.userId === undefined) {
    throw new AppError(401, "Not logged in");
  }

  return res.status(200).json(await getMe(req.userId));
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.sid;
  if (token) await logoutUser(token);
  res.clearCookie("sid", SESSION_COOKIE_OPTIONS);

  return res.status(204).send();
}
```

## `frontend/src/lib/api.ts`

```typescript
import { queryClient } from "@/lib/queryClient";

export type User = {
  id: number;
  email: string;
  username: string;
  name?: string | null;
};

export type Balance = { balanceKobo: string };
export type MoneyResult = { transactionId: number; duplicate: boolean };
export type UserLookup = { username: string; displayName: string };
export type DepositInitialization = {
  authorizationUrl: string;
  reference: string;
};
export type DepositStatus = "PENDING" | "SUCCESS" | "MISMATCH";

export type ActivityItem = {
  id: number;
  title: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER";
  status: string;
  amountKobo: string;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function handleUnauthorized(path: string) {
  if (typeof window === "undefined") return;
  const currentPath = window.location.pathname;
  const isPublicAuthPage = currentPath === "/login" || currentPath === "/signup";
  const isMeCheck = path === "/auth/me";
  if (isPublicAuthPage && isMeCheck) return;
  if (isPublicAuthPage) return;

  queryClient.clear();
  const next = encodeURIComponent(
    safeNextPath(`${window.location.pathname}${window.location.search}`),
  );
  // The API layer has no router instance; force a full navigation after clearing auth state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${next}`);
}

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    response = await fetch(path, {
      ...options,
      signal: options?.signal ?? controller.signal,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "The request took too long. Please try again.");
    }
    throw new ApiError(
      0,
      "Can't reach Swiftbuck. Check your connection and try again.",
    );
  } finally {
    window.clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(path);
    throw new ApiError(
      response.status,
      data?.error ?? "Something went wrong. Try again.",
    );
  }
  return data as T;
}

export function getMe() {
  return request<User>("/api/auth/me");
}

export function login(email: string, password: string) {
  return request<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function createUser(
  email: string,
  username: string,
  password: string,
) {
  return request<User>("/api/users", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export function getBalance() {
  return request<Balance>("/api/wallet/balance");
}

export function lookupUser(username: string) {
  return request<UserLookup>(
    `/api/users/lookup?username=${encodeURIComponent(username)}`,
  );
}

export function transfer(
  receiverUsername: string,
  amountKobo: number,
  reference: string,
) {
  return request<MoneyResult>("/api/wallet/transfer", {
    method: "POST",
    body: JSON.stringify({ receiverUsername, amountKobo, reference }),
  });
}

export function withdraw(
  amountKobo: number,
  reference: string,
  bankCode: string,
  accountNumber: string,
) {
  return request<MoneyResult>("/api/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify({ amountKobo, reference, bankCode, accountNumber }),
  });
}

export function initializeDeposit(amountKobo: number) {
  return request<DepositInitialization>("/api/wallet/deposit/initialize", {
    method: "POST",
    body: JSON.stringify({ amountKobo }),
  });
}

export function getDepositStatus(reference: string) {
  return request<{ status: DepositStatus }>(
    `/api/wallet/deposit/status?reference=${encodeURIComponent(reference)}`,
  );
}

export function getTransactions() {
  return request<ActivityItem[]>("/api/wallet/transactions");
}
```

## `frontend/next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_ORIGIN ?? "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" },
      ],
    }];
  },
};

export default nextConfig;
```

## `frontend/src/context/AuthContext.tsx`

```tsx
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getMe, logout as logoutRequest, type User } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

type AuthContextValue = {
  user: User | undefined;
  isLoading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    retry: false,
  });
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!me.isLoading && me.data && (pathname === "/login" || pathname === "/signup")) {
      router.replace("/");
    }
  }, [me.data, me.isLoading, pathname, router]);
  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.clear();
      router.push("/login");
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: me.data,
        isLoading: me.isLoading,
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
```

## `frontend/src/hooks/useMoney.ts`

```tsx
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { withdraw, transfer } from "@/lib/api";
import { nairaToKobo } from "@/lib/money";
import { useReference } from "./useReference";

function toKobo(amount: string) {
  const kobo = nairaToKobo(amount);
  if (kobo === null || kobo <= 0) throw new Error("Enter a valid amount");
  return kobo;
}

function useMoneyAction<V>(
  prefix: string,
  call: (v: V, reference: string) => Promise<unknown>,
) {
  const ref = useReference(prefix);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (v: V) => call(v, ref.get()),
    onSuccess: () => {
      ref.reset();
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    // on error we do NOT reset, so a retry reuses the same reference
  });

  return { ...mutation, resetReference: ref.reset };
}

export const useTransfer = () =>
  useMoneyAction<{ username: string; amount: string }>(
    "tr",
    (v, reference) => transfer(v.username, toKobo(v.amount), reference),
  );

export const useWithdraw = () =>
  useMoneyAction<{ amount: string; bankCode: string; accountNumber: string }>("wd", (v, reference) =>
    withdraw(toKobo(v.amount), reference, v.bankCode, v.accountNumber),
  );
```

## `frontend/src/lib/queryClient.ts`

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();
```

## `frontend/src/app/add-money/page.tsx`

```tsx
import { FlowForm } from "@/components/FlowForm";
import { LayoutShell } from "@/components/LayoutShell";

export default function AddMoneyPage() {
  return (
    <LayoutShell>
      <FlowForm mode="add" />
    </LayoutShell>
  );
}
```

## `frontend/src/app/send/page.tsx`

```tsx
import { FlowForm } from "@/components/FlowForm";
import { LayoutShell } from "@/components/LayoutShell";

export default function SendPage() {
  return (
    <LayoutShell>
      <FlowForm mode="send" />
    </LayoutShell>
  );
}
```

## `frontend/src/app/withdraw/page.tsx`

```tsx
import { FlowForm } from "@/components/FlowForm";
import { LayoutShell } from "@/components/LayoutShell";

export default function WithdrawPage() {
  return (
    <LayoutShell>
      <FlowForm mode="withdraw" />
    </LayoutShell>
  );
}
```

## `frontend/src/app/add-money/done/page.tsx`

```tsx
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { getDepositStatus, ApiError } from "@/lib/api";
import { LayoutShell } from "@/components/LayoutShell";
import { Loader } from "@/components/Loader";
import { Button } from "@/components/Button";

function DoneContent() {
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const reference = search.get("reference") ?? search.get("trxref") ?? (typeof window !== "undefined" ? sessionStorage.getItem("swiftbuck-deposit-reference") : null);
  const status = useQuery({
    queryKey: ["deposit-status", reference],
    queryFn: () => getDepositStatus(reference as string),
    enabled: Boolean(reference) && !hidden && !timedOut,
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ||
      (query.state.data === undefined && query.state.error === null)
        ? 2_000
        : false,
    retry: false,
  });
  useEffect(() => {
    if (status.data?.status === "SUCCESS") {
      sessionStorage.removeItem("swiftbuck-deposit-reference");
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  }, [queryClient, status.data?.status]);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!reference || status.data?.status !== undefined) return;
    const timer = window.setTimeout(() => setTimedOut(true), 60_000);
    return () => window.clearTimeout(timer);
  }, [reference, status.data?.status]);
  const message = !reference ? "Payment reference not found." :
    status.error instanceof ApiError && status.error.status === 404 ? "Payment not found." :
    timedOut ? "Still processing. Your balance will update when the payment is confirmed." :
    status.error ? status.error.message :
    status.data?.status === "SUCCESS" ? "Payment added to your wallet." :
    status.data?.status === "MISMATCH" ? "We couldn't confirm this payment. Contact support." :
    "Waiting for confirmation";
  const waiting = !timedOut && !status.error &&
    (!status.data || status.data.status === "PENDING");
  return (
    <LayoutShell>
      <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
        {waiting ? <Loader /> : status.data?.status === "SUCCESS" ? (
          <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-orange text-4xl text-orange" aria-hidden="true">
            ✓
          </div>
        ) : null}
        <h1 className="mt-5 font-display text-xl font-bold" aria-live="polite">{message}</h1>
        <p className="mt-2 text-sm text-muted">
          {waiting
            ? "We only mark the payment complete after Paystack confirms it."
            : status.data?.status === "SUCCESS"
              ? "Your balance has been updated."
              : "You can return home while we finish processing this payment."}
        </p>
        <Button className="mt-6" type="button" onClick={() => router.push("/")}>Home</Button>
      </div>
    </LayoutShell>
  );
}

export default function DepositDonePage() {
  return <Suspense fallback={<Loader />}><DoneContent /></Suspense>;
}
```
