"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

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
