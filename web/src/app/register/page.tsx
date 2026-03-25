"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { register, login } from "@/lib/api";
import { setTokens } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username, email, password);
      const res = await login(username, password);
      setTokens(res.access_token, res.refresh_token);
      router.push("/");
    } catch {
      setError("注册失败，请检查输入信息");
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
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--color-accent-bg)" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              <path d="M8 7h6" />
              <path d="M8 11h4" />
            </svg>
          </span>
          <span className="font-serif text-xl font-bold" style={{ color: "var(--color-text)" }}>
            Diary
          </span>
        </div>

        <h1
          className="mb-1 font-serif text-2xl font-bold"
          style={{ color: "var(--color-text)" }}
        >
          创建账户
        </h1>
        <p className="mb-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          开始记录你的生活
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
              邮箱
            </label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
              minLength={6}
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
                注册中...
              </span>
            ) : (
              "注册"
            )}
          </button>
        </form>

        <p
          className="mt-8 text-center text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          已有账户？{" "}
          <a
            href="/login"
            className="font-medium transition-colors"
            style={{
              color: "var(--color-primary)",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            登录
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
