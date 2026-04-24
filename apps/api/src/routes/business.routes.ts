import { Router } from "express";
import { addMember, createBusiness, listBusinesses } from "../controllers/business.controller.js";
import { requireAuth, requireBusinessRole, requireGlobalRole } from "../middlewares/auth.js";

export const businessRouter = Router();

businessRouter.use(requireAuth);
businessRouter.get("/", listBusinesses);
businessRouter.post("/", requireGlobalRole("super_admin"), createBusiness);
businessRouter.post("/members", requireBusinessRole("admin", "super_admin"), addMember);
