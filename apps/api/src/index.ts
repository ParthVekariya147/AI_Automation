import os from "node:os";
import net from "node:net";
import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function isExistingApiHealthy(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { success?: boolean };
    return Boolean(payload.success);
  } catch {
    return false;
  }
}

function canListenOnPort(port: number) {
  return new Promise<boolean>((resolve) => {
    const tester = net.createServer();

    tester.once("error", () => {
      resolve(false);
    });

    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, "0.0.0.0");
  });
}

async function findNextAvailablePort(startPort: number, maxChecks = 20) {
  for (let candidate = startPort; candidate < startPort + maxChecks; candidate += 1) {
    const available = await canListenOnPort(candidate);
    if (available) {
      return candidate;
    }
  }

  return null;
}

async function start() {
  console.log("Starting API bootstrap...");
  await connectDatabase();
  const interfaces = Object.values(os.networkInterfaces())
    .flat()
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);

  let activePort = env.PORT;
  const server = app.listen(activePort);

  server.on("listening", () => {
    const address = server.address();
    const listeningPort = typeof address === "object" && address ? address.port : activePort;

    console.log(`API listening on http://localhost:${listeningPort}`);
    interfaces.forEach((ipAddress) => {
      console.log(`API also available on http://${ipAddress}:${listeningPort}`);
    });
  });

  server.on("error", async (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      if (activePort === env.PORT) {
        console.log(`Port ${env.PORT} is already busy. Checking whether an API is already running...`);
        const healthy = await isExistingApiHealthy(env.PORT);

        if (!healthy) {
          console.error(
            `Port ${env.PORT} is already in use by another process. Stop that process or change PORT in apps/api/.env.`
          );
          process.exit(1);
        }

        const fallbackPort = await findNextAvailablePort(env.PORT + 1);
        if (!fallbackPort) {
          console.error(
            `API is already running on ${env.PORT}, but no fallback port was found nearby. Set PORT in apps/api/.env.`
          );
          process.exit(1);
        }

        activePort = fallbackPort;
        console.log(
          `API port ${env.PORT} is already used by an active API instance. Starting this process on fallback port ${activePort}.`
        );
        server.listen(activePort);
        return;
      }

      const nextPort = await findNextAvailablePort(activePort + 1);
      if (!nextPort) {
        console.error(
          `Fallback port ${activePort} is busy and no additional free port was found. Set PORT in apps/api/.env.`
        );
        process.exit(1);
      }

      activePort = nextPort;
      console.log(`Port is busy. Retrying startup on fallback port ${activePort}.`);
      server.listen(activePort);
      return;
    }

    console.error("Failed to start API server", error);
    process.exit(1);
  });
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
