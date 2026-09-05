import express from "express";
import { rateLimiter } from "../src/adapters/express.js";

const app = express();

app.use(
  rateLimiter({
    maxTokens: 5,
    refillRatePerSecond: 1, 
  }),
);

app.get("/ping", (_req, res) => {
  res.json({ message: "pong" });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Example server listening on http://localhost:${port}`);
});
