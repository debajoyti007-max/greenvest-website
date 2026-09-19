/**
 * scripts/setup-env.mjs
 *
 * Automated Environment Provisioning & Verification Engine for GreenVest.
 *
 * When cloned on a new PC:
 *   1. Checks if `.env` exists.
 *   2. If missing, automatically provisions `.env` with GreenVest Supabase configuration.
 *   3. If already present, verifies existing keys without overwriting personal configs.
 *   4. Tests live HTTP connectivity to Supabase.
 *   5. Verifies required dependencies (node_modules).
 *
 * Can be run standalone via `npm run setup` or automatically called before `npm run dev`.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const ENV_FILE = path.join(ROOT, '.env')
const ENV_EXAMPLE_FILE = path.join(ROOT, '.env.example')
const NODE_MODULES = path.join(ROOT, 'node_modules')

export const DEFAULT_CONFIG = {
  VITE_SUPABASE_URL: 'https://zvjqpigduyvczidzafus.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR',
  VITE_SUPER_ADMIN_EMAIL: 'debajoyti007@gmail.com',
  VITE_SUPER_ADMIN_PHONE: '8170859653',
  VITE_STORE_NAME: 'MS Vegetable Center',
}

export function parseEnvContent(content) {
  const result = {}
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      let val = match[2].trim()
      // Strip outer quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      result[key] = val
    }
  }
  return result
}

export function formatEnvContent(config) {
  return `# ============================================================
# GreenVest Environment Configuration
# Automatically generated & verified by scripts/setup-env.mjs
# ============================================================

VITE_SUPABASE_URL=${config.VITE_SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${config.VITE_SUPABASE_ANON_KEY}

# Super Admin Identity — authorized staff credentials
VITE_SUPER_ADMIN_EMAIL=${config.VITE_SUPER_ADMIN_EMAIL || 'debajoyti007@gmail.com'}
VITE_SUPER_ADMIN_PHONE=${config.VITE_SUPER_ADMIN_PHONE || '8170859653'}

# Store Branding
VITE_STORE_NAME=${config.VITE_STORE_NAME || 'MS Vegetable Center'}
`
}

/**
 * Tests live connectivity to Supabase REST endpoint.
 */
export async function testSupabaseConnection(url, anonKey, timeoutMs = 4000) {
  if (!url || !anonKey || !url.startsWith('http')) {
    return { ok: false, reason: 'Invalid or missing Supabase URL / Key' }
  }

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/products?select=id&limit=1`
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: controller ? controller.signal : undefined,
    })

    if (timer) clearTimeout(timer)

    if (res.ok) {
      return { ok: true, status: res.status }
    } else {
      return { ok: false, status: res.status, reason: `HTTP ${res.status} ${res.statusText}` }
    }
  } catch (err) {
    if (timer) clearTimeout(timer)
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Main environment verification function.
 * Returns { success: boolean, created: boolean, connected: boolean, message: string }
 */
export async function ensureEnvironment(options = { verbose: true, checkOnly: false }) {
  const { verbose, checkOnly } = options
  let created = false
  let updated = false
  let currentConfig = {}

  if (verbose) {
    console.log('\n============================================================')
    console.log('🌿 GreenVest Environment & Supabase Verification Engine')
    console.log('============================================================')
  }

  // 1. Check if .env exists
  const envExists = fs.existsSync(ENV_FILE)

  if (!envExists) {
    if (checkOnly) {
      if (verbose) console.warn('⚠️  [Environment] .env file is missing on this PC.')
      return { success: false, created: false, connected: false, message: '.env file is missing' }
    }

    if (verbose) {
      console.log('🆕 [Environment] Fresh PC or new workspace detected!')
      console.log('📝 Provisioning .env with GreenVest production credentials...')
    }

    currentConfig = { ...DEFAULT_CONFIG }
    fs.writeFileSync(ENV_FILE, formatEnvContent(currentConfig), 'utf8')
    created = true

    if (verbose) {
      console.log('✅ Created .env successfully.')
    }
  } else {
    // .env exists - read and validate existing content
    try {
      const rawContent = fs.readFileSync(ENV_FILE, 'utf8')
      currentConfig = parseEnvContent(rawContent)

      const hasValidUrl =
        currentConfig.VITE_SUPABASE_URL &&
        !currentConfig.VITE_SUPABASE_URL.includes('your-project') &&
        currentConfig.VITE_SUPABASE_URL.startsWith('http')

      const hasValidKey =
        currentConfig.VITE_SUPABASE_ANON_KEY &&
        !currentConfig.VITE_SUPABASE_ANON_KEY.includes('your-anon-key')

      if (!hasValidUrl || !hasValidKey) {
        if (verbose) {
          console.warn('⚠️  [Environment] .env exists but contains placeholder keys.')
          console.log('🔧 Updating with valid GreenVest Supabase configuration...')
        }
        currentConfig.VITE_SUPABASE_URL = currentConfig.VITE_SUPABASE_URL || DEFAULT_CONFIG.VITE_SUPABASE_URL
        currentConfig.VITE_SUPABASE_ANON_KEY = currentConfig.VITE_SUPABASE_ANON_KEY || DEFAULT_CONFIG.VITE_SUPABASE_ANON_KEY
        currentConfig.VITE_SUPER_ADMIN_EMAIL = currentConfig.VITE_SUPER_ADMIN_EMAIL || DEFAULT_CONFIG.VITE_SUPER_ADMIN_EMAIL
        currentConfig.VITE_SUPER_ADMIN_PHONE = currentConfig.VITE_SUPER_ADMIN_PHONE || DEFAULT_CONFIG.VITE_SUPER_ADMIN_PHONE
        fs.writeFileSync(ENV_FILE, formatEnvContent(currentConfig), 'utf8')
        updated = true
      } else {
        if (verbose) {
          console.log('✅ [Environment] .env file found and configured on this PC.')
        }
      }
    } catch (err) {
      console.error('❌ Error reading existing .env:', err)
    }
  }

  // Ensure .env.example is also in sync
  if (!fs.existsSync(ENV_EXAMPLE_FILE)) {
    try {
      fs.writeFileSync(ENV_EXAMPLE_FILE, formatEnvContent(DEFAULT_CONFIG), 'utf8')
    } catch {}
  }

  // 2. Test Supabase connectivity
  const url = currentConfig.VITE_SUPABASE_URL || DEFAULT_CONFIG.VITE_SUPABASE_URL
  const anonKey = currentConfig.VITE_SUPABASE_ANON_KEY || DEFAULT_CONFIG.VITE_SUPABASE_ANON_KEY

  if (verbose) {
    console.log(`🔗 [Supabase] Testing connection to ${url}...`)
  }

  const conn = await testSupabaseConnection(url, anonKey)
  let connected = false

  if (conn.ok) {
    connected = true
    if (verbose) {
      console.log('⚡ [Supabase] Connection SUCCESS! Live database is reachable (HTTP 200 OK).')
    }
  } else {
    if (verbose) {
      console.log(`⚠️  [Supabase] Network test notice: ${conn.reason || 'Offline'}`)
      console.log('ℹ️  [Offline Fallback] GreenVest will run in local offline/cache mode until network connects.')
    }
  }

  // 3. Check node_modules
  const hasModules = fs.existsSync(NODE_MODULES)
  if (!hasModules && verbose) {
    console.log('\n⚠️  [Dependencies] node_modules folder is missing.')
    console.log('👉 Please run: npm install')
  }

  if (verbose) {
    console.log('============================================================')
    console.log(`🎉 Environment Status: ${created ? 'INITIALIZED (NEW PC)' : updated ? 'UPDATED' : 'READY'}`)
    console.log('👉 You can now run: npm run dev')
    console.log('============================================================\n')
  }

  return {
    success: true,
    created,
    updated,
    connected,
    config: currentConfig,
    message: created
      ? 'Environment initialized for this PC'
      : 'Environment verified and ready',
  }
}

// Run standalone if executed directly via node scripts/setup-env.mjs
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isDirectExecution) {
  const checkOnly = process.argv.includes('--check-only')
  ensureEnvironment({ verbose: true, checkOnly }).catch((err) => {
    console.error('Setup failed:', err)
    process.exit(1)
  })
}
