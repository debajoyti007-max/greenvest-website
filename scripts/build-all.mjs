import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
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

console.log('3. Generating SPA routing fallbacks (404.html, CNAME, .nojekyll) & stamping sw.js...')
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(DIST, '404.html'))
fs.writeFileSync(path.join(DIST, 'CNAME'), 'greenvest.shop')
fs.writeFileSync(path.join(DIST, '.nojekyll'), '')

const distSw = path.join(DIST, 'sw.js')
if (fs.existsSync(distSw)) {
  const swContent = fs.readFileSync(distSw, 'utf8').replace(
    /const CACHE_NAME = ['"][^'"]+['"]/,
    `const CACHE_NAME = 'rymon-ghost-v${Date.now()}'`
  )
  fs.writeFileSync(distSw, swContent, 'utf8')
}

console.log('✨ Build Successful (dist/ ready for GitHub Actions Pages deployment)!')
