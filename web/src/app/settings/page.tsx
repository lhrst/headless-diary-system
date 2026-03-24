"use client";

import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function SettingsPage() {
  const { mounted } = useAuth();

  if (!mounted) {
    return <div className="py-20 text-center text-sm">加载中...</div>;
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold" style={{ color: "var(--color-text)" }}>
          设置
        </h1>

        <div className="space-y-8">
          <ThemeSwitcher />

          <div>
            <h3 className="text-sm font-semibold mb-2"
              style={{ color: "var(--color-text-secondary)" }}>
              关于
            </h3>
            <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
              Headless Diary System v0.1.0
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
