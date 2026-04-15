import express from "express";
import path from "path";

const app = express();
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

// API Routes
const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running on Vercel Functions!" });
});

router.get("/lark/webhook", (req, res) => {
  res.json({ message: "Lark webhook endpoint is active!" });
});

router.post("/lark/webhook", async (req, res) => {
  // FAST RESPONSE FOR VERIFICATION
  if (req.body.type === "url_verification") {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Handle other events asynchronously
  const { event } = req.body;
  if (event && event.message) {
    console.log("Received Message:", event.message.content);
  }

  res.status(200).json({ status: "received" });
});

// Mount the router on both /api and /
// This handles cases where Vercel strips the /api prefix or keeps it
app.use("/api", router);
app.use("/", router);

export default app;
