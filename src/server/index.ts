import "./env";
import cors from "cors";
import express from "express";
import { chatRouter } from "./routes/chat";
import { dataRouter } from "./routes/data";
import { marketRouter } from "./routes/market";
import { newsRouter } from "./routes/news";
import { portfolioRouter } from "./routes/portfolio";

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const port = Number.parseInt(process.env.PORT ?? "4000", 10);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/chat", chatRouter);
app.use("/api/data", dataRouter);
app.use("/api/market", marketRouter);
app.use("/api/news", newsRouter);
app.use("/api/portfolio", portfolioRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, "0.0.0.0");
