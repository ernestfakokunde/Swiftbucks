import { Router } from "express";
import { login, logout, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/login", loginLimiter, login);
router.use(requireAuth);
router.get("/me", me);
router.post("/logout", logout);

export default router;
