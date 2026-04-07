import { test, expect } from '@playwright/test'

test.describe('Authentication flows', () => {
  test('landing page loads and shows CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/StreamBridge/)
    // Landing page should render actual content (not a blank div)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('unauthenticated user is redirected from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user is redirected from /providers to /login', async ({ page }) => {
    await page.goto('/providers')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user is redirected from /vod to /login', async ({ page }) => {
    await page.goto('/vod')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('signup page renders email and password fields', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('forgot password page renders email field', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
  })

  test('login page has link to signup', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('a[href="/signup"]')).toBeVisible()
  })

  test('signup page has link to login', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('a[href="/login"]')).toBeVisible()
  })
})
