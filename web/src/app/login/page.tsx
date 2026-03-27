"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { setTokens } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(username, password);
      setTokens(res.access_token, res.refresh_token);
      router.push("/");
    } catch {
      setError("用户名或密码错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-10 w-10" />
          <span className="font-serif text-xl font-bold" style={{ color: "var(--color-text)" }}>
            革命启示录
          </span>
        </div>

        <h1
          className="mb-1 font-serif text-2xl font-bold"
          style={{ color: "var(--color-text)" }}
        >
          欢迎回来
        </h1>
        <p className="mb-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          登录你的账户
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              用户名
            </label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              密码
            </label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div
              className="p-3 text-sm animate-slide-in-down"
              style={{
                color: "var(--color-danger)",
                backgroundColor: "rgba(196, 82, 58, 0.06)",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(196, 82, 58, 0.15)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                  style={{ animation: "spin 0.6s linear infinite" }}
                />
                登录中...
              </span>
            ) : (
              "登录"
            )}
          </button>
        </form>

        <p
          className="mt-8 text-center text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          还没有账户？{" "}
          <a
            href="/register"
            className="font-medium transition-colors"
            style={{
              color: "var(--color-primary)",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            注册
          </a>
        </p>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
