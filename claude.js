// Serverless proxy for the Anthropic API.
// The real API key lives only here, as a Vercel environment variable
// (ANTHROPIC_API_KEY) — it is never sent to or visible from the browser.
//
// This also clamps a couple of request fields so a stray or malicious
// request against this public endpoint can't run up an unbounded bill:
// only the model this app actually uses is allowed, and max_tokens is
// capped. This is NOT a substitute for setting a spend limit on your
// Anthropic account — see the README for why.

const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const MAX_TOKENS_CAP = 2000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server misconfigured: ANTHROPIC_API_KEY is not set" });
    return;
  }

  const body = req.body || {};

  if (!ALLOWED_MODELS.has(body.model)) {
    res.status(400).json({ error: "Model not allowed" });
    return;
  }

  const maxTokens = Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP);

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
        max_tokens: maxTokens,
        messages: body.messages,
      }),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed" });
  }
}
