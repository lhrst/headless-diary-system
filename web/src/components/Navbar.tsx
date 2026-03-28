"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { isAuthenticated, clearTokens } from "@/lib/auth";
import { getMe } from "@/lib/api";

export default function Navbar() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const authed = isAuthenticated();
    setShowAuth(authed);
    if (authed) {
      getMe().then((u) => setUsername(u.display_name || u.username)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  if (!showAuth) return null;

  return (
    <nav
      className="sticky top-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled
          ? "rgba(250, 247, 244, 0.85)"
          : "rgba(250, 247, 244, 0.6)",
        backdropFilter: "blur(12px) saturate(1.2)",
        WebkitBackdropFilter: "blur(12px) saturate(1.2)",
        borderBottom: scrolled
          ? "1px solid var(--color-border)"
          : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        {/* Logo */}
        <button
          onClick={() => router.push("/")}
          className="group flex items-center gap-2 transition-all"
        >
          <img src="/logo.svg" alt="" className="h-8 w-8 transition-all group-hover:scale-105" />
          <span
            className="font-serif text-lg font-semibold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            革命启示录
          </span>
        </button>

        {/* Search */}
        <form
          onSubmit={handleSearch}
          className="hidden flex-1 sm:block max-w-[240px] mx-6"
        >
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-tertiary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="搜索日记..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input h-9 pl-9 text-sm"
              style={{ backgroundColor: "var(--color-bg-secondary)" }}
            />
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push("/diary/new")}
            className="btn-primary h-9 px-4 text-sm"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-1.5"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            新建
          </button>
          <button
            onClick={() => router.push("/tags")}
            className="btn-ghost h-9"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-1"
            >
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="m2 17 10 5 10-5" />
              <path d="m2 12 10 5 10-5" />
            </svg>
            标签
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="btn-ghost h-9"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {username && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 px-2 h-9 text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "#fff",
                }}
              >
                {username[0].toUpperCase()}
              </span>
              {username}
            </span>
          )}
          <button onClick={handleLogout} className="btn-ghost h-9 text-xs">
            登出
          </button>
        </div>
      </div>
    </nav>
  );
}
