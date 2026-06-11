import { connectDatabase } from "./config/database.js";
import { app } from "./app.js";

let dbConnected = false;

async function ensureDb() {
  if (!dbConnected) {
    await connectDatabase();
    dbConnected = true;
  }
}

export default async function handler(req: any, res: any) {
  await ensureDb();
  return app(req, res);
}
