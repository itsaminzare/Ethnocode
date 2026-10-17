// Vercel serverless function: forwards requests from the workspace to the Claude API.
// The API key stays on the server (Vercel environment variable ANTHROPIC_API_KEY)
// and is never sent to the browser.

const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const MAX_TOKENS_CAP = 4000;
const MAX_INPUT_CHARS = 120000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set. Add it in Vercel under Settings, Environment Variables, then redeploy.",
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
  if (JSON.stringify(body.messages).length > MAX_INPUT_CHARS) {
    res.status(413).json({ error: "This note is too long to code in one go. Split it into shorter notes." });
    return;
  }

  const payload = {
    model: body.model,
    max_tokens: Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP),
    messages: body.messages,
  };
  if (typeof body.system === "string" && body.system.length < 4000) payload.system = body.system;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 500) } }; }
    if (!upstream.ok) console.error("Anthropic API error", upstream.status, data);
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Upstream request failed", err);
    res.status(502).json({ error: "Couldn't reach Claude: " + (err?.message || "unknown error") });
  }
}
