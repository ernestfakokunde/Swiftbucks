import { createUserWithWallet, getBalanceKobo, deposit, withdraw, p2pTransfer, lookupUser } from "../services/wallet.service";
import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../services/wallet.service";

const createUserSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(20),
})

export async function createUser(req:Request, res:Response){
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input"})
    }
    
    try{
        const result = await createUserWithWallet(parsed.data);
        return res.status(201).json(result);
    } catch (error){
        console.error("Error creating user:", error);
        return res.status(500).json({ error: "Internal server error" })
    }
}

export async function getBalance( req:Request, res:Response){
const userid = Number(req.params.userId);
    if (!Number.isInteger(userid)){
        return res.status(400).json({ error: "Invalid Userid"})
    }
    try{
        const balance = await getBalanceKobo(userid);
        return res.status(200).json({
            balanceKobo: balance.toString(),
        })
    } catch(error){
            if (error instanceof AppError){
                return res.status(Number(error.status)).json({ error: error.message })
            }
        console.error("Error getting balance:", error);
        return res.status(500).json({ error: "server error getting balance" })
    }

}

//wallet deposit controller
/////////////////////////////

    const depositSchema = z.object({
        amountKobo: z.number().int().positive(),
        reference: z.string().min(1),
    });

export async function depositFunds(req:Request, res:Response){
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
return res.status(400).json({ error: "Invalid user id" });
}
    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }

    try{
        const result = await deposit(userId, BigInt(parsed.data.amountKobo), parsed.data.reference);
        return res.status(result.duplicate ? 200: 201).json(result);
    } catch(error){
        if (error instanceof AppError) {
            return res.status(Number(error.status)).json({ error: error.message });
        }
        console.error("Error depositing funds:", error);
        return res.status(500).json({ error: "Internal server error" });
    }

}

//wallet withdrawal controller
/////////////////////////////

const withdrawSchema = z.object({
    amountKobo: z.number().int().positive(),
    reference: z.string().min(1),
})

    export async function withdrawFunds(req:Request, res:Response){
        const userId = Number(req.params.userId);
        if(!Number.isInteger(userId) || userId <= 0){
            return res.status(400).json({ error: "Invalid user id"});
        }

        const parsed = withdrawSchema.safeParse(req.body);
        if (!parsed.success){
            return res.status(400).json({ error: "Invalid input"});
        }

        try{
            const result = await withdraw(userId, BigInt(parsed.data.amountKobo), parsed.data.reference);
            return res.status(result.duplicate ? 200 : 201).json(result);
        } catch(error){
            if (error instanceof AppError) {
                return res.status(Number(error.status)).json({ error: error.message });
            }
            console.error("Error withdrawing funds:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    //p2p withdrawal

    const p2pTransferSchema = z.object({
        receiverUsername: z.string().min(1),
        amountKobo: z.number().int().positive(),
        reference: z.string().min(1)
    })

    export async function transferFunds (req: Request, res:Response){
        const userId = Number(req.params.userId)
         if(!Number.isInteger(userId) || userId <= 0){
            return res.status(400).json({ error: "Invalid user id"});
        }

        const parsed =  p2pTransferSchema.safeParse(req.body);
        if (!parsed.success){
            return res.status(400).json({ error: "Invalid input"});
        }

        try {
            const result = await p2pTransfer(userId, parsed.data.receiverUsername, BigInt(parsed.data.amountKobo), parsed.data.reference);
            return res.status(result.duplicate ? 200 : 201).json(result);
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(Number(error.status)).json({ error: error.message });
            }
            console.error("Error transferring funds:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    //lookup user controller
    const lookupUserSchema = z.object({
        username: z.string().min(1)
    })

    export async function lookup(req: Request, res: Response){
        const parsed = lookupUserSchema.safeParse(req.query);
        if (!parsed.success){
            return res.status(400).json({ error: "Invalid input"});
        }
        try{
            const user = await lookupUser(parsed.data.username);
            return res.status(200).json(user);
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(Number(error.status)).json({ error: error.message });
            }
            console.error("Error looking up user:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }