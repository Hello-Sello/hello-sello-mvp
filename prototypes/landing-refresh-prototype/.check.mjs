// Throwaway verification for the 0028 prototype. Delete with the prototype.
// Checks each variant renders, then measures the reduced-motion claim (PRD AC 6).
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const dir = dirname(fileURLToPath(import.meta.url))
const url = 'file://' + join(dir, 'index.html')
const browser = await chromium.launch()

for (const v of ['A', 'B', 'C']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${url}?variant=${v}`)

  const h1s = await page.locator('h1').count()
  const s4 = await page.locator('#s4 h2').textContent()
  const s7a = await page.locator('#s7a h2').textContent()
  const cards = await page.locator('#s4 .card').count()
  const stars = await page.locator('#s7a use[href="#i-star"]').count()

  // AC 6: the animation must actually resolve to none under reduced motion.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const anim = await page.evaluate(() => {
    const el = document.querySelector('#s7a .ring, #s7a .field svg, #s7a .bigshield')
    return el ? getComputedStyle(el).animationName : 'NO-ANIMATED-EL'
  })
  const claimsUnderRM = await page.locator('#s7a .k, #s7a .pills span').count()

  console.log(
    `${v}: h1=${h1s} · §4="${s4}" (${cards} cards) · §7a="${s7a}" · stars=${stars} ` +
    `· reduced-motion animationName=${anim} · claims-visible=${claimsUnderRM} ` +
    `· jsErrors=${errors.length ? errors.join('|') : 'none'}`
  )
  await page.screenshot({ path: join(dir, `variant-${v}.png`), fullPage: true })
  await page.close()
}
await browser.close()
