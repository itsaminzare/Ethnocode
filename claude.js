const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const MAX_TOKENS_CAP = 2000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.",
    });
    return;
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  if (!ALLOWED_MODELS.has(body.model)) {
    res.status(400).json({ error: "Model not allowed: " + body.model });
    return;
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model,
        max_tokens: Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP),
        messages: body.messages,
      }),
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 500) } }; }
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed: " + (err?.message || "unknown") });
  }
}
