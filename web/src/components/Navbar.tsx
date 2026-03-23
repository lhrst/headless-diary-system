"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAuthenticated, clearTokens } from "@/lib/auth";

export default function Navbar() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/?q=${encodeURIComponent(search.trim())}`);
    }
  };

  const handleLogout = () => {
    clearTokens();
    router.push("/login");
  };

  if (!isAuthenticated()) return null;

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm"
      style={{ borderColor: "var(--color-border)" }}>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        {/* Logo */}
        <button
          onClick={() => router.push("/")}
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-text)" }}
        >
          Diary
        </button>

        {/* Search */}
        <form onSubmit={handleSearch} className="hidden sm:block flex-1 max-w-sm mx-6">
          <input
            type="text"
            placeholder="搜索日记..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input h-9"
          />
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push("/diary/new")}
            className="btn-primary h-9 px-3 text-sm"
          >
            + 新建
          </button>
          <button
            onClick={() => router.push("/tags")}
            className="btn-ghost h-9"
          >
            标签
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="btn-ghost h-9"
          >
            设置
          </button>
          <button onClick={handleLogout} className="btn-ghost h-9">
            登出
          </button>
        </div>
      </div>
    </nav>
  );
}
