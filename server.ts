import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Lark API Helpers
  const getLarkAccessToken = async () => {
    const appId = process.env.LARK_APP_ID;
    const appSecret = process.env.LARK_APP_SECRET;
    if (!appId || !appSecret) return null;

    try {
      const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      });
      const data = await response.json();
      return data.app_access_token;
    } catch (error) {
      console.error("Failed to get Lark access token:", error);
      return null;
    }
  };

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Simulated Lark Webhook
  app.post("/api/lark/webhook", async (req, res) => {
    const { type, challenge, event } = req.body;

    // Handle URL verification challenge
    if (type === "url_verification") {
      return res.json({ challenge });
    }

    // Handle message events
    if (event && event.message) {
      console.log("Received Lark Message:", event.message.content);
      // Here we would normally use Gemini to extract tasks and maybe send a reply
    }

    res.json({ status: "received" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
