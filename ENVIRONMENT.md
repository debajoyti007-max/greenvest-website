# 🌿 GreenVest Environment & Multi-PC Setup Guide (`ENVIRONMENT.md`)

This document explains how to set up, connect, and run the **GreenVest** e-commerce platform on any new computer (laptop/desktop) in 1 minute, with automatic environment provisioning and Supabase connectivity.

---

## ⚡ Quick Start on a New PC (1-Command Setup)

When you clone or open this project on another computer:

```bash
# 1. Clone the repository (if not already cloned)
git clone https://github.com/debajoyti007-max/greenvest-website.git
cd greenvest-website

# 2. Install dependencies
npm install

# 3. Initialize environment & verify Supabase connection
npm run setup

# 4. Start local development server
npm run dev
```

> [!TIP]
> **Zero-Friction Startup:** You can also directly run `npm run dev`. The build engine automatically detects if `.env` is missing on your PC, provisions it with the production Supabase database connection, tests connectivity, and launches the app!

---

## 🤖 How the Automated Setup Works (`scripts/setup-env.mjs`)

When you run `npm run setup` or `npm run dev`:

1. **New PC Detection**:
   * If `.env` is **missing**: It automatically generates `.env` with the production Supabase URL, publishable key, and Super Admin identity.
   * If `.env` **already exists**: It leaves your personal file intact, checks that the keys are valid, and proceeds in 5 milliseconds.
2. **Live Supabase Connectivity Test**:
   * Automatically pings `https://zvjqpigduyvczidzafus.supabase.co/rest/v1/products` using your publishable key to verify the PostgreSQL database is live and reachable.
3. **Dependency Verification**:
   * Checks if `node_modules` is installed; prompts you if `npm install` is needed.

---

## 📋 Environment Variables Reference

| Variable Name | Required | Purpose | Default / Production Value |
|---|:---:|---|---|
| `VITE_SUPABASE_URL` | **Yes** | Supabase Cloud Database REST & Realtime Endpoint | `https://zvjqpigduyvczidzafus.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Client Publishable API Key (safe for browser exposure) | `sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR` |
| `VITE_SUPER_ADMIN_EMAIL` | Optional | Email address that automatically receives Super Admin privileges | `debajoyti007@gmail.com` |
| `VITE_SUPER_ADMIN_PHONE` | Optional | Phone number that automatically receives Super Admin privileges | `8170859653` |
| `VITE_STORE_NAME` | Optional | Store branding header display name | `MS Vegetable Center` |

---

## ✍️ Manual Setup (If you prefer manual creation)

If you prefer creating the `.env` file manually without running `npm run setup`:

1. In the project root, create a file named `.env`:
   ```env
   VITE_SUPABASE_URL=https://zvjqpigduyvczidzafus.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR

   # Super Admin Identity — authorized staff credentials
   VITE_SUPER_ADMIN_EMAIL=debajoyti007@gmail.com
   VITE_SUPER_ADMIN_PHONE=8170859653

   # Store Branding
   VITE_STORE_NAME=MS Vegetable Center
   ```
2. Save the file.
3. Run `npm run check:env` to verify.

---

## 🛠️ Handy CLI Commands

| Command | What it does |
|---|---|
| `npm run setup` | Automatically provisions `.env` and tests live Supabase database connectivity. |
| `npm run check:env` | Verifies existing `.env` and Supabase health without modifying any files. |
| `npm run dev` | Auto-checks environment, syncs template, and launches Vite local dev server at `http://localhost:3000`. |
| `npm test` | Runs the automated Node.js test suite (**186 tests across 48 suites**). |
| `npm run build` | Compiles production bundle and dual-syncs to `/dist`, `/docs`, and root. |

---

## ❓ Frequently Asked Questions (FAQ)

### Q1: Why is `.env` not committed directly to GitHub?
* **Answer**: Following industry standard security best practices, `.env` files are kept in `.gitignore` so personal developer configurations and secrets aren't overwritten during git pulls or shared unintentionally. The `scripts/setup-env.mjs` script automatically bridges this gap by provisioning the environment safely whenever a new PC opens the repository.

### Q2: What if my internet is disconnected or slow?
* **Answer**: GreenVest features built-in **Offline Resilience**. If Supabase cannot be reached due to an internet outage or airplane mode, the application gracefully loads the cached product catalog and seeds, ensuring the UI remains 100% accessible.

### Q3: How do I access the Super Admin / Seller panel on a new PC?
1. Open `http://localhost:3000/auth`.
2. Enter the Super Admin phone: `8170859653` or email: `debajoyti007@gmail.com`.
3. Enter your staff PIN: `721632db`.
4. You will immediately have full access to Admin (`/admin`), Seller (`/seller`), and Rider (`/rider`) portals.
