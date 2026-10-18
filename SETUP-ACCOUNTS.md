# Turning on EthnoCode accounts

Accounts let people sign up, log in and keep their notes and codebook across devices.
They use [Supabase](https://supabase.com) (free plan) for sign-in and a private database.
Until the two settings below are added in Vercel, the site works exactly as before, with no
sign-in button, so it's safe to deploy this code first.

## 1. Create the Supabase project (about 3 minutes)

1. Go to https://supabase.com and click **Start your project**. Sign in with GitHub.
2. Click **New project**. Name it `ethnocode`, choose the region **London**, set a database
   password (save it somewhere), and click **Create new project**. Wait about a minute.

## 2. Create the table

1. In the project, open **SQL Editor** → **New query**.
2. Paste everything from `supabase/schema.sql` in this repo and click **Run**.
   It should say "Success. No rows returned".

This creates one table, `workspaces`, with rules so each person can only ever read and write
their own notes.

## 3. Tell Supabase where the site lives

Open **Authentication** → **URL Configuration**:

- **Site URL:** `https://ethnocode.vercel.app`
- **Redirect URLs:** add `https://ethnocode.vercel.app/app.html`
  and, for Vercel preview links, `https://*-ethnocode.vercel.app/**`

This makes the "confirm your email" and "reset your password" links open the workspace.

## 4. Copy the two keys into Vercel

1. In Supabase, open **Project Settings** → **API** (or **API Keys**). Copy:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **anon public** key (or the **publishable** key, `sb_publishable_…`)
   Never use the `service_role` / secret key here.
2. In Vercel, open the **ethnocode** project → **Settings** → **Environment Variables** and add:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_ANON_KEY` = the anon / publishable key

   Tick **Production** and **Preview**, then **Save**.
3. **Deployments** → **⋯** on the top entry → **Redeploy**.

A **Sign in** button now appears in the workspace's top bar.

## How it behaves

- **Without an account:** nothing changes. Notes are saved in the browser.
- **Creating an account:** whatever is in the workspace is saved to the new account.
- **Signing in on another device:** the account's notes load. Notes written in that
  browser before signing in are added to the account. Untouched sample notes are not.
- **Saving:** changes upload automatically a second after you stop typing. The status in
  the top bar shows "Saving to your account" and then "Saved to your account".
- **Two devices:** when you come back to a tab, it picks up changes made on another device.
- **Signing out:** the workspace goes back to the sample notes, so nothing is left behind
  on a shared computer.

## Account settings

Clicking your name or avatar in the top bar opens **Your account**:

- **Name:** optional, can also be given at sign-up. It's shown in the top bar instead of the email.
- **Email:** enter a new address and Supabase emails a confirmation link to it. The change happens
  once the link is clicked. With **Secure email change** on (the default, under
  **Authentication** → **Sign In / Providers** → **Email**), a link also goes to the current
  address and both must be clicked. The workspace explains this when the first link is clicked.
- **Password:** enter the current password, then the new one twice. If the current password is
  forgotten, **Email me a reset link** sends a reset email to the account's address.

## Good to know

- Supabase's built-in email service is meant for testing and only sends a few emails per
  hour. Before inviting lots of people, add your own email provider under
  **Authentication** → **Emails** → **SMTP Settings** (Resend and Postmark have free plans).
- To let people sign up without confirming their email (handy for a live demo), turn off
  **Confirm email** under **Authentication** → **Sign In / Providers** → **Email**.
