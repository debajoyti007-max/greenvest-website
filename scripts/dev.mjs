import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const TEMPLATE = path.join(ROOT, 'index.template.html')
const INDEX_HTML = path.join(ROOT, 'index.html')

if (fs.existsSync(TEMPLATE)) {
  fs.copyFileSync(TEMPLATE, INDEX_HTML)
}

const child = spawn('npx', ['vite'], { stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code || 0))
