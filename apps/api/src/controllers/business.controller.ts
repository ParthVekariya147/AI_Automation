import type { Response } from "express";
import { z } from "zod";
import { BusinessModel } from "../models/Business.js";
import { MembershipModel } from "../models/Membership.js";
import { UserModel } from "../models/User.js";
import { createAuditLog } from "../services/audit.service.js";
import type { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { hashPassword } from "../utils/auth.js";
import { ApiError } from "../utils/api-error.js";

const createBusinessSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  timezone: z.string().default("Asia/Kolkata")
});

const addMemberSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(6, "Password must be at least 6 characters long")
});

export const listBusinesses = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const memberships = await MembershipModel.find({
    userId: req.user.id,
    status: "active"
  }).lean();

  const businesses = await BusinessModel.find({
    _id: { $in: memberships.map((membership) => membership.businessId) }
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: businesses });
});

export const createBusiness = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = createBusinessSchema.parse(req.body);
  const business = await BusinessModel.create(payload);

  await MembershipModel.create({
    businessId: business._id,
    userId: req.user.id,
    role: "admin",
    status: "active"
  });

  await createAuditLog({
    actorUserId: req.user.id,
    businessId: business.id,
    action: "business.created",
    entityType: "Business",
    entityId: business.id
  });

  res.status(201).json({ success: true, data: business });
});

export const addMember = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = addMemberSchema.parse(req.body);
  const business = await BusinessModel.findById(payload.businessId);

  if (!business) {
    throw new ApiError(404, "Business not found");
  }

  let user = await UserModel.findOne({ email: payload.email });

  if (!user) {
    if (!payload.password) {
      throw new ApiError(400, "Password is required when creating a new admin login");
    }

    user = await UserModel.create({
      name: payload.name,
      email: payload.email,
      passwordHash: await hashPassword(payload.password),
      globalRole: "admin"
    });
  } else {
    user.name = payload.name;
    user.globalRole = "admin";

    user.passwordHash = await hashPassword(payload.password);

    await user.save();
  }

  const membership = await MembershipModel.findOneAndUpdate(
    {
      businessId: payload.businessId,
      userId: user._id
    },
    {
      businessId: payload.businessId,
      userId: user._id,
      role: "admin",
      status: "active"
    },
    { upsert: true, new: true }
  );

  await createAuditLog({
    actorUserId: req.user.id,
    businessId: payload.businessId,
    action: "membership.upserted",
    entityType: "Membership",
    entityId: membership.id,
    metadata: { role: "admin", email: payload.email }
  });

  res.status(201).json({ success: true, data: membership });
});
