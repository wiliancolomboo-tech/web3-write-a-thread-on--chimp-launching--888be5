import express, { Request, Response } from "express";

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "HEALTHY",
    subsystem: "chimp-metaplex-watchtower",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.listen(PORT, () => {
  console.log(`[HEALTH] Healthcheck server live on port ${PORT}`);
});