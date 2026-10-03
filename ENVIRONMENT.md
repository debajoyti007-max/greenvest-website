# 🌐 Two Bhai Travels - Environment & Configuration Manual
### *Developer Guide, Client Handover Protocol & Repository Guardrails*

---

> **CRITICAL ENVIRONMENT NOTICE:**  
> This project is currently operating in **Transition Mode** from the legacy MS Vegetable Center to **Two Bhai Travels**.  
> All legacy vegetable code and schemas are preserved permanently in Git branch `origin/vault-vegetables` (tag `v1.0-vegetable-store-vault`).

---

## 📑 TABLE OF CONTENTS
1. [Environment Overview](#1-environment-overview)
2. [Centralized Configuration (`travelConfig.ts`)](#2-centralized-configuration-travelconfigts)
3. [Client Handover Protocol (1-Line Quick Swap)](#3-client-handover-protocol-1-line-quick-swap)
4. [Supabase Database Configuration](#4-supabase-database-configuration)
5. [Local Development & Testing Workflows](#5-local-development--testing-workflows)
6. [Git Vault Guardrails & Branch Strategy](#6-git-vault-guardrails--branch-strategy)

---

## 1. ENVIRONMENT OVERVIEW

| Variable | Development (Local) | Testing / Staging | Production (Live) |
| :--- | :--- | :--- | :--- |
| **URL** | `http://localhost:5173` | GitHub Pages Preview | `https://greenvest.shop` |
| **Operating Brand** | Two Bhai Travels | Two Bhai Travels | Two Bhai Travels |
| **Contact Phone** | `+91 81708 59653` | `+91 81708 59653` | Client Phone (at Handover) |
| **WhatsApp Dispatch** | `+91 81708 59653` | `+91 81708 59653` | Client WhatsApp |
| **UPI ID** | `8170859653-2@ybl` | `8170859653-2@ybl` | Client UPI ID |
| **Fleet Constraint** | Strictly 4-Seater AC | Strictly 4-Seater AC | Strictly 4-Seater AC |
| **Supabase Project** | `zvjqpigduyvczidzafus` | `zvjqpigduyvczidzafus` | `zvjqpigduyvczidzafus` |

---

## 2. CENTRALIZED CONFIGURATION (`travelConfig.ts`)

All business identity variables are isolated in `src/travel/travelConfig.ts`. Never hardcode telephone numbers, WhatsApp links, or UPI IDs inside UI components.

```typescript
// Centralized configuration contract
export const TRAVEL_CONFIG = {
  brandName: 'Two Bhai Travels',
  brandNameBn: 'টু ভাই ট্রাভেলস',
  tagline: 'Your Trusted Highway Partner',
  taglineBn: 'আপনার যাত্রাপথের বিশ্বস্ত সঙ্গী',
  baseLocation: 'Nandakumar, Purba Medinipur, WB',
  basePin: '721632',
  
  // Contact & Dispatch (Configurable at Handover)
  primaryPhone: '8170859653',
  displayPhone: '+91 81708 59653',
  whatsappNumber: '918170859653',
  emergencyHospitalPhone: '8170859653',
  
  // Payment Details (10% Advance Engine)
  upiId: '8170859653-2@ybl',
  upiName: 'Two Bhai Travels',
  advancePercent: 10,
  minimumAdvance: 150,
  
  // Fleet Constraints
  maxPassengers: 4,
  carCategory: '4-Seater AC Sedan',
};
```

---

## 3. CLIENT HANDOVER PROTOCOL (1-LINE QUICK SWAP)

When the client is ready to take ownership of the website:

1. **Step 1: Open the Config File**  
   Navigate to `src/travel/travelConfig.ts`.

2. **Step 2: Update Client Details**  
   Replace `primaryPhone`, `whatsappNumber`, and `upiId` with the client's official numbers:
   ```typescript
   primaryPhone: '9XXXXXXXXX',          // Client's new phone
   whatsappNumber: '919XXXXXXXXX',       // Client's new WhatsApp
   upiId: 'clientname@upi',              // Client's new UPI ID
   ```

3. **Step 3: Run Build & Verification**  
   ```powershell
   npm run build
   npm test
   ```

4. **Step 4: Deploy**  
   Push changes to GitHub `master`. The live site at `greenvest.shop` updates automatically with the client's new contact information across all buttons, WhatsApp links, and QR codes.

---

## 4. SUPABASE DATABASE CONFIGURATION

The database runs on Supabase (PostgreSQL 15):
* **Project ID:** `zvjqpigduyvczidzafus`
* **Project URL:** `https://zvjqpigduyvczidzafus.supabase.co`
* **Tables Active:**
  - `travel_bookings`: Dedicated to Two Bhai Travels.
  - `products`, `orders`, `profiles`, `reviews`, `coupons`: Legacy vegetable store tables (strictly preserved).
* **Environment Keys:**
  - `VITE_SUPABASE_URL`: Defined in `.env` and `src/lib/supabase.ts`.
  - `VITE_SUPABASE_ANON_KEY`: Public anonymous key with Row Level Security enforcement.

---

## 5. LOCAL DEVELOPMENT & TESTING WORKFLOWS

### Commands to Run:
```powershell
# Install dependencies
npm install

# Start local development server
npm run dev

# Run full test suite (Node.js test runner)
npm test

# Run code linter
npm run lint

# Production build and dual-sync distribution
node scripts/build-all.mjs
```

---

## 6. GIT VAULT GUARDRAILS & BRANCH STRATEGY

```
   [master branch] ─────────────► Two Bhai Travels Live Platform (greenvest.shop)
          │
          └───► [vault-vegetables branch] ───► Permanent, untouched snapshot of MS Vegetable Center
                     │
                     └───► [Git Tag: v1.0-vegetable-store-vault]
```

### Golden Rules:
1. **Never Delete `vault-vegetables`:** This branch ensures that if the client ever asks to revert or retrieve the vegetable e-commerce store, it can be restored in under 60 seconds with `git checkout vault-vegetables`.
2. **Never Drop Vegetable Tables:** The Supabase database tables for vegetables must remain in place to guarantee zero data loss.
3. **No Montage Gates or Watermarks:** All barrier screens, Montage gates, and fake watermarks are strictly eliminated.
