import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env')

function getApiKey() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8')
    const match = raw.match(/RENDER_API_KEY\s*=\s*(.+)/)
    if (match) return match[1].trim()
  }
  throw new Error('RENDER_API_KEY not found in environment or .env')
}

const API_KEY = getApiKey()
const BASE_URL = 'https://api.render.com/v1'

async function renderApi(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    Accept: 'application/json',
    ...(options.headers || {})
  }
  const res = await fetch(url, { ...options, headers })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Render API [${res.status}] ${txt}`)
  }
  return res.json()
}

export async function getServices() {
  const data = await renderApi('/services?limit=10')
  return data.map((d) => d.service)
}

export async function getDeploys(serviceId, limit = 5) {
  const data = await renderApi(`/services/${serviceId}/deploys?limit=${limit}`)
  return data.map((d) => d.deploy)
}

export async function triggerDeploy(serviceId, clearCache = false) {
  return renderApi(`/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clearCache: clearCache ? 'clear' : 'do_not_clear'
    })
  })
}

export async function restartService(serviceId) {
  return renderApi(`/services/${serviceId}/restart`, {
    method: 'POST'
  })
}

async function main() {
  const action = process.argv[2] || 'status'
  const services = await getServices()
  const botService = services.find((s) => s.name === 'rymon-telegram-bot')

  if (!botService) {
    console.log('No rymon-telegram-bot service found!')
    return
  }

  if (action === 'status') {
    console.log(`🤖 Service: ${botService.name} (${botService.id})`)
    console.log(`🌐 Public URL: ${botService.serviceDetails?.url}`)
    console.log(`📦 Status: ${botService.suspended === 'not_suspended' ? 'Active' : 'Suspended'}`)

    const deploys = await getDeploys(botService.id, 1)
    if (deploys.length > 0) {
      const latest = deploys[0]
      console.log(`🚀 Latest Deploy: ${latest.id} [${latest.status}] (${latest.commit?.message || 'N/A'})`)
    }

    try {
      const ping = await fetch(botService.serviceDetails?.url)
      const data = await ping.json()
      console.log(`💓 Health Response:`, data)
    } catch (e) {
      console.log(`⚠️ Health check ping error:`, e.message)
    }
  } else if (action === 'deploys') {
    const deploys = await getDeploys(botService.id, 5)
    console.log('Recent Deploys:')
    for (const d of deploys) {
      console.log(`- ${d.id} | ${d.status} | ${d.createdAt} | ${d.commit?.message?.substring(0, 50)}`)
    }
  } else if (action === 'deploy') {
    const res = await triggerDeploy(botService.id, true)
    console.log('Triggered fresh deploy:', res)
  } else if (action === 'restart') {
    const res = await restartService(botService.id)
    console.log('Restarted service:', res)
  }
}

if (process.argv[1] && process.argv[1].endsWith('render-control.mjs')) {
  main().catch(console.error)
}
