import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import { apiRouter } from "./routes/index.js";

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      const isLocalDevOrigin =
        env.NODE_ENV !== "production" &&
        Boolean(
          origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        );

      const isLanDevOrigin =
        env.NODE_ENV !== "production" &&
        Boolean(
          origin &&
            /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
              origin
            )
        );

      if (!origin || env.corsOrigins.includes(origin) || isLocalDevOrigin || isLanDevOrigin) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/uploads", express.static(uploadDir));

app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
