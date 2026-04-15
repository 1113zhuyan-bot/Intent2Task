import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const now = new Date().toISOString();
  console.log(`[${now}] --- New Webhook Request ---`);
  console.log(`[${now}] Method: ${req.method}`);
  console.log(`[${now}] Body: ${JSON.stringify(req.body)}`);

  // 1. 立即处理飞书的验证请求 (Challenge)
  if (req.body && req.body.type === "url_verification") {
    console.log(`[${now}] Lark Challenge detected. Sending back:`, req.body.challenge);
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // 2. 处理其他事件 (如消息)
  if (req.method === 'POST') {
    console.log(`[${now}] Lark Event received:`, JSON.stringify(req.body));
    return res.status(200).json({ status: "success" });
  }

  // 3. 处理 GET 请求 (方便你在浏览器测试)
  return res.status(200).json({ 
    message: "Lark Webhook is ready!",
    timestamp: now
  });
}
