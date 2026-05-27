import express, { type Express } from "express";
import { createServer } from "http";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

export async function buildHttpTestApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  const { registerRoutes } = await import("../../server/routes");
  await registerRoutes(httpServer, app);
  return app;
}
