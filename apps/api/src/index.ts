import os from "node:os";
import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function start() {
  await connectDatabase();

  app.listen(env.PORT, () => {
    const interfaces = Object.values(os.networkInterfaces())
      .flat()
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.family === "IPv4" && !item.internal)
      .map((item) => item.address);

    console.log(`API listening on http://localhost:${env.PORT}`);

    interfaces.forEach((address) => {
      console.log(`API also available on http://${address}:${env.PORT}`);
    });
  });
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
