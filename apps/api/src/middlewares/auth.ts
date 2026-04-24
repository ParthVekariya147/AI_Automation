import type { NextFunction, Response } from "express";
import { MembershipModel } from "../models/Membership.js";
import type { AuthedRequest, Role } from "../types.js";
import { verifyToken } from "../utils/auth.js";
import { ApiError } from "../utils/api-error.js";

export async function requireAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return next(new ApiError(401, "Authentication token is required"));
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      globalRole: payload.globalRole
    };
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

export function requireGlobalRole(...roles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    if (!roles.includes(req.user.globalRole)) {
      return next(new ApiError(403, "Insufficient permissions"));
    }

    next();
  };
}

export function requireBusinessRole(...roles: Role[]) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    if (req.user.globalRole === "super_admin") {
      req.membershipRole = "super_admin";
      return next();
    }

    const businessId =
      req.params.businessId ||
      req.body.businessId ||
      req.query.businessId?.toString();

    if (!businessId) {
      return next(new ApiError(400, "businessId is required"));
    }

    const membership = await MembershipModel.findOne({
      businessId,
      userId: req.user.id,
      status: "active"
    }).lean();

    if (!membership || !roles.includes(membership.role)) {
      return next(new ApiError(403, "Business access denied"));
    }

    req.membershipRole = membership.role;
    req.businessId = businessId;
    next();
  };
}
