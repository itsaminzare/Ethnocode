// Tells the workspace how to reach Supabase for accounts.
// Only the project URL and the PUBLIC key (anon / publishable) may ever be sent to browsers.
// The secret / service_role key bypasses all row-level security, so this endpoint refuses to
// serve it, even if it is pasted into the wrong Vercel setting by mistake.

function isSecretKey(key) {
  if (/^sb_secret_/i.test(key)) return true;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload && payload.role === "service_role") return true;
    } catch {}
  }
  return false;
}

// Accepts the project URL in the forms people tend to paste:
//   https://abcd.supabase.co   https://abcd.supabase.co/rest/v1/   abcd.supabase.co
//   https://supabase.com/dashboard/project/abcd/settings/api        abcd (just the project ID)
function toProjectUrl(value) {
  const v = value.trim().replace(/^["']|["']$/g, "");
  let m = v.match(/^(?:https?:\/\/)?([a-z0-9-]+)\.supabase\.(co|in)(?:[\/?#].*)?$/i);
  if (m) return "https://" + m[1].toLowerCase() + ".supabase." + m[2].toLowerCase();
  m = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (m) return "https://" + m[1].toLowerCase() + ".supabase.co";
  if (/^[a-z0-9]{15,30}$/.test(v)) return "https://" + v + ".supabase.co";
  return null;
}

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

  res.setHeader("Cache-Control", "no-store");

  if (!supabaseUrl && !supabaseAnonKey) {
    res.status(200).json({ accounts: false });
    return;
  }
  if (isSecretKey(supabaseAnonKey) || isSecretKey(supabaseUrl)) {
    res.status(200).json({ accounts: false, problem: "A Supabase SECRET key was found in the Vercel settings. It has not been sent. Use the publishable (anon) key for SUPABASE_ANON_KEY and revoke the secret key in Supabase." });
    return;
  }
  const projectUrl = toProjectUrl(supabaseUrl);
  if (!projectUrl) {
    const shown = /^(sb_|eyJ)/.test(supabaseUrl) ? "a key" : JSON.stringify(supabaseUrl.slice(0, 80));
    res.status(200).json({ accounts: false, problem: "SUPABASE_URL should be your project URL, like https://abcd1234.supabase.co. It currently contains " + shown + "." });
    return;
  }
  if (!/^(sb_publishable_|eyJ)/.test(supabaseAnonKey)) {
    res.status(200).json({ accounts: false, problem: "SUPABASE_ANON_KEY should be the publishable key (sb_publishable_...) or the anon public key (eyJ...)" });
    return;
  }
  res.status(200).json({ accounts: true, supabaseUrl: projectUrl, supabaseAnonKey });
}
