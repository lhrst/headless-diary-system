"""Test autocomplete: #tag, [[ref, @agent in TipTap editor."""
import os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = "/tmp/diary_shots_ac"
os.makedirs(SHOTS, exist_ok=True)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # Login
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(1500)
        inputs = page.locator("input")
        inputs.nth(0).fill("test")
        inputs.nth(1).fill("test123")
        page.locator("button[type='submit']").click()
        page.wait_for_timeout(3000)
        print(f"Logged in: {page.url}")

        # Go to new diary page
        page.goto(f"{BASE}/diary/new", wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SHOTS}/01_new_diary.png")

        # Find editor (TipTap = contenteditable div with class ProseMirror, or textarea fallback)
        tiptap = page.locator(".ProseMirror")
        textarea = page.locator("textarea")

        if tiptap.count() > 0:
            print("Found TipTap editor (ProseMirror)")
            editor = tiptap.first
            editor_type = "tiptap"
        elif textarea.count() > 0:
            print("Found textarea editor (fallback)")
            editor = textarea.last  # first might be title
            editor_type = "textarea"
        else:
            print("ERROR: No editor found!")
            browser.close()
            return

        # Test typing
        editor.click()
        page.wait_for_timeout(500)

        # Type some content
        page.keyboard.type("今天测试自动补全功能")
        page.wait_for_timeout(500)
        page.screenshot(path=f"{SHOTS}/02_typing.png")

        # Test # autocomplete
        print("\nTesting # autocomplete...")
        page.keyboard.press("Enter")
        page.keyboard.type("#面")
        page.wait_for_timeout(1500)  # Wait for API response
        page.screenshot(path=f"{SHOTS}/03_hash_autocomplete.png")

        # Check if suggestion popup appeared
        popup = page.locator("[class*='suggest'], [class*='popup'], [class*='dropdown'], [class*='autocomplete'], [role='listbox']")
        print(f"  Popup elements found: {popup.count()}")

        # Press Escape to dismiss any popup and continue
        page.keyboard.press("Escape")
        page.keyboard.type("试 ")
        page.wait_for_timeout(500)

        # Test [[ autocomplete
        print("Testing [[ autocomplete...")
        page.keyboard.type("[[AI")
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{SHOTS}/04_bracket_autocomplete.png")

        popup2 = page.locator("[class*='suggest'], [class*='popup'], [class*='dropdown'], [class*='autocomplete'], [role='listbox']")
        print(f"  Popup elements found: {popup2.count()}")

        page.keyboard.press("Escape")
        page.keyboard.type("]] ")

        # Test @agent
        print("Testing @agent...")
        page.keyboard.type("@agent 帮我总结")
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SHOTS}/05_at_agent.png")

        # Final state
        page.screenshot(path=f"{SHOTS}/06_final_editor.png")

        # Check toolbar
        print("\nChecking editor toolbar...")
        toolbar_buttons = page.locator("button").filter(has_text="B")
        print(f"  Bold button: {toolbar_buttons.count() > 0}")

        # Check for any toolbar-like elements
        all_buttons = page.locator("button")
        button_texts = []
        for i in range(min(all_buttons.count(), 20)):
            text = all_buttons.nth(i).text_content()
            if text and text.strip():
                button_texts.append(text.strip())
        print(f"  Buttons found: {button_texts}")

        browser.close()
        print(f"\nDone! Screenshots in {SHOTS}/")
        print(f"Files: {sorted(os.listdir(SHOTS))}")


if __name__ == "__main__":
    run()
