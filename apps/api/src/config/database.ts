import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  console.log(`Connecting to MongoDB at ${env.MONGODB_URI}...`);

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log("MongoDB connection established.");
  } catch (error) {
    console.error("MongoDB connection failed.");
    throw error;
  }
}
