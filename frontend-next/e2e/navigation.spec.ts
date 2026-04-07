import { test, expect } from '@playwright/test'

test.describe('Navigation and routing', () => {
  test('/ renders landing page (SSR check — no blank body)', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)

    // Core SSR check: page source contains real content, not just <div id="root"></div>
    const html = await page.content()
    expect(html).not.toMatch(/<div id="root"><\/div>/)
    expect(html.length).toBeGreaterThan(1000)
  })

  test('/login returns 200', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
  })

  test('/signup returns 200', async ({ page }) => {
    const response = await page.goto('/signup')
    expect(response?.status()).toBe(200)
  })

  test('/forgot-password returns 200', async ({ page }) => {
    const response = await page.goto('/forgot-password')
    expect(response?.status()).toBe(200)
  })

  test('/admin/login returns 200', async ({ page }) => {
    const response = await page.goto('/admin/login')
    expect(response?.status()).toBe(200)
  })

  test('meta title is set correctly on landing page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/StreamBridge/)
  })

  test('meta description is present on landing page', async ({ page }) => {
    await page.goto('/')
    const metaDesc = page.locator('meta[name="description"]')
    const content = await metaDesc.getAttribute('content')
    expect(content).toBeTruthy()
    expect(content!.length).toBeGreaterThan(20)
  })

  test('OG meta tags are present on landing page', async ({ page }) => {
    await page.goto('/')
    const ogTitle = page.locator('meta[property="og:title"]')
    await expect(ogTitle).toHaveAttribute('content', /StreamBridge/)
  })
})
