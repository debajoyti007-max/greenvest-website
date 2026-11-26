/**
 * scripts/setup-env.mjs
 *
 * Automated Environment Provisioning & Verification Engine for GreenVest.
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
  VITE_STORE_NAME: 'GreenVest Sovereign'
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

# Branding
VITE_STORE_NAME=${config.VITE_STORE_NAME || 'GreenVest Sovereign'}
`
}

export async function testSupabaseConnection(url, anonKey, timeoutMs = 4000) {
  if (!url || !anonKey || !url.startsWith('http')) {
    return { ok: false, reason: 'Invalid or missing Supabase URL / Key' }
  }

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/`
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      },
      signal: controller ? controller.signal : undefined
    })

    if (timer) clearTimeout(timer)

    if (res.ok) {
      return { ok: true, status: res.status }
    }
    return { ok: false, status: res.status, reason: `HTTP ${res.status} ${res.statusText}` }
  } catch (err) {
    if (timer) clearTimeout(timer)
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

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

  const envExists = fs.existsSync(ENV_FILE)

  if (!envExists) {
    if (checkOnly) {
      if (verbose) console.warn('⚠️  [Environment] .env file is missing on this PC.')
      return { success: false, created: false, connected: false, message: '.env file is missing' }
    }

    currentConfig = { ...DEFAULT_CONFIG }
    fs.writeFileSync(ENV_FILE, formatEnvContent(currentConfig), 'utf8')
    created = true
  } else {
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
        currentConfig.VITE_SUPABASE_URL = currentConfig.VITE_SUPABASE_URL || DEFAULT_CONFIG.VITE_SUPABASE_URL
        currentConfig.VITE_SUPABASE_ANON_KEY = currentConfig.VITE_SUPABASE_ANON_KEY || DEFAULT_CONFIG.VITE_SUPABASE_ANON_KEY
        fs.writeFileSync(ENV_FILE, formatEnvContent(currentConfig), 'utf8')
        updated = true
      } else if (verbose) {
        console.log('✅ [Environment] .env file found and configured.')
      }
    } catch (err) {
      console.error('❌ Error reading existing .env:', err)
    }
  }

  if (!fs.existsSync(ENV_EXAMPLE_FILE)) {
    try {
      fs.writeFileSync(ENV_EXAMPLE_FILE, formatEnvContent(DEFAULT_CONFIG), 'utf8')
    } catch {}
  }

  const url = currentConfig.VITE_SUPABASE_URL || DEFAULT_CONFIG.VITE_SUPABASE_URL
  const anonKey = currentConfig.VITE_SUPABASE_ANON_KEY || DEFAULT_CONFIG.VITE_SUPABASE_ANON_KEY

  const conn = await testSupabaseConnection(url, anonKey)
  const connected = conn.ok

  if (verbose) {
    console.log(
      connected
        ? '⚡ [Supabase] Connection SUCCESS! Live database reachable.'
        : `⚠️  [Supabase] Network test notice: ${conn.reason || 'Offline'}`
    )
    if (!fs.existsSync(NODE_MODULES)) {
      console.log('⚠️  [Dependencies] node_modules folder is missing. Run: npm install')
    }
    console.log('============================================================\n')
  }

  return {
    success: true,
    created,
    updated,
    connected,
    config: currentConfig,
    message: created ? 'Environment initialized' : 'Environment verified and ready'
  }
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isDirectExecution) {
  const checkOnly = process.argv.includes('--check-only')
  ensureEnvironment({ verbose: true, checkOnly }).catch((err) => {
    console.error('Setup failed:', err)
    process.exit(1)
  })
}
