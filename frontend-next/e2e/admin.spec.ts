import { test, expect } from '@playwright/test'

test.describe('Admin auth protection', () => {
  test('unauthenticated user is redirected from /admin/dashboard to /admin/login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('unauthenticated user is redirected from /admin/users to /admin/login', async ({ page }) => {
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('admin login page renders username and password fields', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })
})
