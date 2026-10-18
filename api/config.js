// Tells the workspace how to reach Supabase for accounts.
// These two values are public by design (the anon / publishable key only allows what the
// database's row-level security rules permit). They are read from Vercel environment variables
// so they don't have to be written into the site's code.

export default function handler(req, res) {
  const env = process.env;
  const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = (
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();

  res.setHeader("Cache-Control", "public, max-age=60");
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(200).json({ accounts: false });
    return;
  }
  res.status(200).json({ accounts: true, supabaseUrl, supabaseAnonKey });
}
