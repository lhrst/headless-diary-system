"""E2E test v2 — full flow with diary detail page."""
import os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = "/tmp/diary_shots_v2"
os.makedirs(SHOTS, exist_ok=True)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # 1. Login
        print("1. Login...")
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(1500)
        inputs = page.locator("input")
        inputs.nth(0).fill("test")
        inputs.nth(1).fill("test123")
        page.locator("button[type='submit']").click()
        page.wait_for_timeout(3000)
        print(f"   -> {page.url}")

        # 2. Homepage with diaries
        print("2. Homepage...")
        page.goto(BASE, wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/01_homepage.png")

        # 3. Quick publish
        print("3. Quick publish...")
        textarea = page.locator("textarea").first
        textarea.fill("通过Playwright测试快速发布功能 #e2e测试\n\n使用Cmd+Enter发布应该也能工作")
        page.wait_for_timeout(500)
        page.screenshot(path=f"{SHOTS}/02_quick_publish.png")
        page.locator("button").filter(has_text="发布").click()
        page.wait_for_timeout(5000)
        page.screenshot(path=f"{SHOTS}/03_after_publish.png")

        # 4. Click diary to see detail
        print("4. Diary detail...")
        diary_link = page.locator("a[href*='/diary/']").first
        if diary_link.count() > 0:
            diary_link.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=f"{SHOTS}/04_diary_detail.png")
            print(f"   -> {page.url}")
        else:
            # fallback: try clicking article
            article = page.locator("article").first
            if article.count() > 0:
                article.click()
                page.wait_for_timeout(2000)
                page.screenshot(path=f"{SHOTS}/04_diary_detail.png")
                print(f"   -> {page.url}")

        # 5. New diary with TipTap editor
        print("5. New diary page...")
        page.goto(f"{BASE}/diary/new", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/05_new_diary.png")

        # Try typing in the editor
        editor = page.locator(".ProseMirror, [contenteditable='true'], textarea")
        if editor.count() > 0:
            editor.first.click()
            editor.first.type("这是TipTap编辑器测试\n\n**加粗文本** *斜体* `代码`\n\n#编辑器测试")
            page.wait_for_timeout(1000)
            page.screenshot(path=f"{SHOTS}/06_editor_typing.png")

        # 6. Tags page
        print("6. Tags page...")
        page.goto(f"{BASE}/tags", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/07_tags.png")

        # Click a tag
        tag_link = page.locator("a[href*='/tags/']").first
        if tag_link.count() > 0:
            tag_link.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=f"{SHOTS}/08_tag_filter.png")
            print(f"   Tag filter: {page.url}")

        # 7. Settings
        print("7. Settings...")
        page.goto(f"{BASE}/settings", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{SHOTS}/09_settings.png")

        browser.close()
        print(f"\nDone! Screenshots: {sorted(os.listdir(SHOTS))}")


if __name__ == "__main__":
    run()
