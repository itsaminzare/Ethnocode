// Serverless proxy for the Anthropic API.
// The real API key lives only here, as a Vercel environment variable
// (ANTHROPIC_API_KEY) — it is never sent to or visible from the browser.
//
// This also clamps a couple of request fields so a stray or malicious
// request against this public endpoint can't run up an unbounded bill:
// only the model this app actually uses is allowed, and max_tokens is
// capped. This is NOT a substitute for setting a spend limit on your
// Anthropic account.

const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const MAX_TOKENS_CAP = 2000;

function parseBody(req) {
  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Trim guards against a key pasted with a trailing newline or space,
  // which Anthropic rejects as invalid.
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set for this deployment.");
    res.status(500).json({
      error:
        "Server misconfigured: ANTHROPIC_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.",
    });
    return;
  }

  const body = parseBody(req);
  if (body === null) {
    res.status(400).json({ error: "Request body is not valid JSON" });
    return;
  }

  if (!ALLOWED_MODELS.has(body.model)) {
    res.status(400).json({ error: `Model not allowed: ${body.model}` });
    return;
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  const maxTokens = Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP);

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

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: { message: text.slice(0, 500) || "Empty response from Anthropic" } };
    }

    if (!upstream.ok) {
      console.error("Anthropic API error", upstream.status, data);
    }
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Upstream request failed:", err);
    res.status(502).json({ error: "Upstream request failed: " + (err?.message || "unknown") });
  }
}
