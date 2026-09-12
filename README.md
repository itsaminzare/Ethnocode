# EthnoCode

An AI-assisted open/axial coding tool for ethnographic field notes, built with React. This repo is set up to deploy on Vercel, with the Anthropic API called through a serverless proxy so your API key never reaches the browser.

## How it's wired

- `src/App.jsx` — the app itself (UI, prompts, everything).
- `api/claude.js` — a serverless function that holds your Anthropic API key and forwards requests to `api.anthropic.com`. The browser only ever talks to `/api/claude`, never to Anthropic directly.

## Local development

You need the Vercel CLI to run the serverless function locally (plain `vite dev` will serve the frontend but `/api/claude` won't exist).

```bash
npm install
npm install -g vercel   # one-time
cp .env.example .env    # then edit .env and paste in your real key
vercel dev
```

This runs the frontend and the API function together, usually on `http://localhost:3000`.

## Deploying to Vercel

1. Push this repo to GitHub (see below if you haven't already).
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, and click **Add New → Project**.
3. Import this repo. Vercel will auto-detect the Vite framework — you don't need to change any build settings.
4. Before deploying, add an environment variable: **Settings → Environment Variables**
   - Name: `ANTHROPIC_API_KEY`
   - Value: your real key from [console.anthropic.com](https://console.anthropic.com/settings/keys)
5. Deploy. Vercel gives you a live URL (`your-project.vercel.app`) — that's what you link to from your portfolio.

Any time you push to `main`, Vercel redeploys automatically.

## ⚠️ Important: this endpoint is public

Once deployed, `/api/claude` is a public URL. Anyone who finds it (view-source, browser devtools, or just guessing) can call it directly — not just through your UI. The proxy caps `max_tokens` and only allows the one model this app uses, which limits the damage per request, but it can't stop someone from hitting it repeatedly and running up your bill.

For a portfolio piece, the realistic mitigations are:

- **Set a spend limit** on your Anthropic account (Console → Settings → Limits) so a worst case is capped in dollars, not open-ended.
- **Keep an eye on usage** for the first week or two after sharing the link widely (e.g. on LinkedIn or a resume).
- If you want stronger protection later, options include adding a simple shared secret the frontend sends (better than nothing, but visible to anyone reading the JS bundle), or a proper rate-limiter backed by a KV store (Vercel KV / Upstash) keyed by IP.

None of this is required to get it live — just go in aware of the tradeoff.

## Pushing this to GitHub

```bash
cd portfolio-ethnocode
git init
git add .
git commit -m "Initial commit: EthnoCode"
git branch -M main
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

`.env` is already excluded via `.gitignore`, so your real key never gets committed — only `.env.example` (a template with no real secret) goes to GitHub.
