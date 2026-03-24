"""End-to-end test with Playwright — captures screenshots at each step."""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = "/tmp/diary_screenshots"

import os
os.makedirs(SHOTS, exist_ok=True)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # 1. 首页（未登录 → 应重定向到 /login）
        print("1. Opening homepage (should redirect to /login)...")
        page.goto(BASE, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/01_login_page.png")
        print(f"   URL: {page.url}")
        print(f"   Screenshot: {SHOTS}/01_login_page.png")

        # 2. 注册新用户
        print("\n2. Registering new user...")
        page.goto(f"{BASE}/register", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SHOTS}/02_register_page.png")

        # Fill registration form
        inputs = page.locator("input")
        count = inputs.count()
        print(f"   Found {count} input fields")

        if count >= 3:
            inputs.nth(0).fill("playwright_user")
            inputs.nth(1).fill("pw@test.com")
            inputs.nth(2).fill("test123456")
            page.screenshot(path=f"{SHOTS}/03_register_filled.png")

            # Submit
            submit_btn = page.locator("button[type='submit']")
            if submit_btn.count() > 0:
                submit_btn.click()
            else:
                page.locator("button").filter(has_text="注册").click()

            page.wait_for_timeout(3000)
            page.screenshot(path=f"{SHOTS}/04_after_register.png")
            print(f"   URL after register: {page.url}")
        else:
            print("   WARNING: Could not find registration fields")

        # 3. 登录
        print("\n3. Logging in...")
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(1000)

        inputs = page.locator("input")
        count = inputs.count()
        print(f"   Found {count} input fields")

        if count >= 2:
            inputs.nth(0).fill("test")
            inputs.nth(1).fill("test123")
            page.screenshot(path=f"{SHOTS}/05_login_filled.png")

            submit_btn = page.locator("button[type='submit']")
            if submit_btn.count() > 0:
                submit_btn.click()
            else:
                page.locator("button").filter(has_text="登录").click()

            page.wait_for_timeout(3000)
            page.screenshot(path=f"{SHOTS}/06_after_login.png")
            print(f"   URL after login: {page.url}")

        # 4. 首页（已登录）
        print("\n4. Homepage (logged in)...")
        page.goto(BASE, wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/07_homepage.png")
        print(f"   URL: {page.url}")

        # 5. 快速发布测试
        print("\n5. Quick publish from homepage...")
        textarea = page.locator("textarea")
        if textarea.count() > 0:
            textarea.first.fill("这是通过 Playwright 自动测试发布的日记！今天天气很好。#测试 #自动化")
            page.wait_for_timeout(500)
            page.screenshot(path=f"{SHOTS}/08_quick_publish_filled.png")

            # Try clicking publish button
            publish_btn = page.locator("button").filter(has_text="发布")
            if publish_btn.count() > 0:
                publish_btn.first.click()
                page.wait_for_timeout(5000)  # Wait for auto-title generation
                page.screenshot(path=f"{SHOTS}/09_after_quick_publish.png")
                print("   Quick publish clicked!")
            else:
                print("   WARNING: No publish button found")
        else:
            print("   WARNING: No textarea found on homepage")

        # 6. 查看日记列表
        print("\n6. Checking diary list...")
        page.goto(BASE, wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/10_diary_list.png")

        # 7. 点击第一个日记查看详情
        print("\n7. Opening first diary...")
        diary_links = page.locator("a[href*='/diary/']")
        if diary_links.count() > 0:
            diary_links.first.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=f"{SHOTS}/11_diary_detail.png")
            print(f"   URL: {page.url}")
        else:
            print("   WARNING: No diary links found")

        # 8. 新建日记页面
        print("\n8. New diary page...")
        page.goto(f"{BASE}/diary/new", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/12_new_diary_page.png")

        # 9. 标签页面
        print("\n9. Tags page...")
        page.goto(f"{BASE}/tags", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/13_tags_page.png")

        # 10. 设置页面
        print("\n10. Settings page...")
        page.goto(f"{BASE}/settings", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/14_settings_page.png")

        # 11. Check console errors
        print("\n11. Checking for console errors...")
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.goto(BASE, wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        if errors:
            print(f"   Console errors: {errors[:5]}")
        else:
            print("   No console errors!")

        browser.close()

        print(f"\n=== Done! Screenshots saved to {SHOTS}/ ===")
        print(f"Files: {sorted(os.listdir(SHOTS))}")


if __name__ == "__main__":
    run()
