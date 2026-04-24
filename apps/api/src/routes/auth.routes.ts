import { Router } from "express";
import { bootstrap, login, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

export const authRouter = Router();

authRouter.post("/bootstrap", bootstrap);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);
