import type { Request, Response } from "express";
import { z } from "zod";
import { MembershipModel } from "../models/Membership.js";
import { UserModel } from "../models/User.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { comparePassword, hashPassword, signToken } from "../utils/auth.js";

const bootstrapSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(6, "Password must be at least 6 characters long")
});

const loginSchema = bootstrapSchema.pick({
  email: true,
  password: true
});

export const bootstrap = asyncHandler(async (req: Request, res: Response) => {
  const existingUserCount = await UserModel.countDocuments();

  if (existingUserCount > 0) {
    throw new ApiError(403, "Bootstrap is already complete");
  }

  const payload = bootstrapSchema.parse(req.body);
  const passwordHash = await hashPassword(payload.password);

  const user = await UserModel.create({
    name: payload.name,
    email: payload.email,
    passwordHash,
    globalRole: "super_admin"
  });

  const token = signToken({
    id: user.id,
    email: user.email,
    globalRole: user.globalRole
  });

  res.status(201).json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        globalRole: user.globalRole
      }
    }
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const payload = loginSchema.parse(req.body);
  const user = await UserModel.findOne({ email: payload.email });

  if (!user || !(await comparePassword(payload.password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }

  const memberships = await MembershipModel.find({
    userId: user._id,
    status: "active"
  })
    .populate("businessId", "name slug timezone")
    .lean();

  const token = signToken({
    id: user.id,
    email: user.email,
    globalRole: user.globalRole
  });

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        globalRole: user.globalRole
      },
      memberships
    }
  });
});

export const me = asyncHandler(async (req: Request & { user?: { id: string } }, res: Response) => {
  if (!req.user?.id) {
    throw new ApiError(401, "Authentication required");
  }

  const user = await UserModel.findById(req.user.id).select("-passwordHash");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const memberships = await MembershipModel.find({
    userId: user._id,
    status: "active"
  })
    .populate("businessId", "name slug timezone")
    .lean();

  res.json({
    success: true,
    data: {
      user,
      memberships
    }
  });
});
