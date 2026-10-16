# EthnoCode

Open and axial coding of field notes, powered by Claude.

## Deploy on Vercel (fixes the 500 error)

1. Push this folder to a GitHub repo and import it in Vercel. Or run `npx vercel` inside this folder.
2. In Vercel, go to **Project → Settings → Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from https://console.anthropic.com/settings/keys
   - Environments: tick **Production** and **Preview**
3. **Redeploy** (Deployments → ⋯ → Redeploy). Env vars only apply to new deployments.

The "API request failed (500)" error means step 2 or step 3 was missed.

## Run locally

```bash
npm install
cp .env.example .env      # then put your real key in .env
npx vercel dev            # NOT `npm run dev` — plain Vite doesn't run the /api folder
```

Open the URL it prints (usually http://localhost:3000).

## If something still fails

The app now shows the real reason after the status code:
- **401**: the API key is wrong or has extra characters
- **400 / credit balance**: add credits or billing on your Anthropic account
- **404 / model**: the model name isn't available to your key
- **429 / 529**: rate-limited or overloaded, so try again shortly

Detailed errors also appear in Vercel under **Deployments → your deployment → Functions / Logs**.

Tip: set a monthly spend limit in the Anthropic console, because `/api/claude` is a public endpoint.
