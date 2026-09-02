import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const DOCS = path.join(ROOT, 'docs')
const ASSETS_ROOT = path.join(ROOT, 'assets')
const TEMPLATE = path.join(ROOT, 'index.template.html')
const INDEX_HTML = path.join(ROOT, 'index.html')

console.log('1. Preparing index.html from source template...')
if (fs.existsSync(TEMPLATE)) {
  fs.copyFileSync(TEMPLATE, INDEX_HTML)
} else {
  fs.copyFileSync(INDEX_HTML, TEMPLATE)
}

console.log('2. Compiling production bundle (tsc + vite)...')
execSync('npx tsc -b && npx vite build', { stdio: 'inherit' })

console.log('3. Generating SPA routing fallbacks (404.html, CNAME, .nojekyll)...')
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(DIST, '404.html'))
fs.writeFileSync(path.join(DIST, 'CNAME'), 'greenvest.shop')
fs.writeFileSync(path.join(DIST, '.nojekyll'), '')

console.log('4. Syncing to /docs (for GitHub Pages /docs mode)...')
if (fs.existsSync(DOCS)) {
  fs.rmSync(DOCS, { recursive: true, force: true })
}
fs.cpSync(DIST, DOCS, { recursive: true })

console.log('5. Syncing to / (root) (for GitHub Pages /root mode)...')
if (fs.existsSync(ASSETS_ROOT)) {
  fs.rmSync(ASSETS_ROOT, { recursive: true, force: true })
}
fs.cpSync(path.join(DIST, 'assets'), ASSETS_ROOT, { recursive: true })
fs.copyFileSync(path.join(DIST, 'index.html'), INDEX_HTML)
fs.copyFileSync(path.join(DIST, '404.html'), path.join(ROOT, '404.html'))
fs.writeFileSync(path.join(ROOT, 'CNAME'), 'greenvest.shop')
fs.writeFileSync(path.join(ROOT, '.nojekyll'), '')

console.log('✨ Build & Dual Sync (Root + /docs) Successful!')
