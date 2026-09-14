// Serverless proxy for the Anthropic API.
// The real API key lives only here, as a Vercel environment variable (ANTHROPIC_API_KEY).

const ALLOWED_MODELS = new Set([
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
  "claude-3-opus-20240229"
]);

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

  // Default to 3.5 Sonnet if no model or an unlisted model is provided
  const selectedModel = ALLOWED_MODELS.has(body.model) ? body.model : "claude-3-5-sonnet-20241022";
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
        model: selectedModel,
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
