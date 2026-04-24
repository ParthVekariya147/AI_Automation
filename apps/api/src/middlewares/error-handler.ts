import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, "Route not found"));
}

export function errorHandler(
  error: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.flatten().fieldErrors
    });
  }

  if ("code" in error && error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A record with this value already exists"
    });
  }

  const statusCode = error instanceof ApiError ? error.statusCode : error.statusCode ?? 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || "Internal server error"
  });
}
