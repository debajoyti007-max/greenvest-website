import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { ensureEnvironment } from './setup-env.mjs'

const ROOT = process.cwd()
const TEMPLATE = path.join(ROOT, 'index.template.html')
const INDEX_HTML = path.join(ROOT, 'index.html')

// Ensure environment is verified and .env exists before starting Vite
await ensureEnvironment({ verbose: true })

if (fs.existsSync(TEMPLATE)) {
  fs.copyFileSync(TEMPLATE, INDEX_HTML)
}

const child = spawn('npx', ['vite'], { stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code || 0))

