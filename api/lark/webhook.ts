import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  const now = new Date().toISOString();
  
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log(`[${now}] Edge Webhook Body:`, JSON.stringify(body));

      // 1. 立即处理验证请求
      if (body.type === "url_verification") {
        return new Response(JSON.stringify({ challenge: body.challenge }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      console.error("Edge Webhook Parse Error");
    }
  }

  return new Response(JSON.stringify({ message: "Lark Edge Webhook is ready!", timestamp: now }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
