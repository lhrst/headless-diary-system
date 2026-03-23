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
      // Auto login after registration
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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold" style={{ color: "var(--color-text)" }}>
          注册
        </h1>
        <p className="mb-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          创建你的日记账户
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}>
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
            <label className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}>
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
            <label className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}>
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
            <p className="text-sm" style={{ color: "var(--color-danger, #ef4444)" }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "注册中..." : "注册"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm"
          style={{ color: "var(--color-text-secondary)" }}>
          已有账户？{" "}
          <a href="/login" className="font-medium"
            style={{ color: "var(--color-primary)" }}>
            登录
          </a>
        </p>
      </div>
    </div>
  );
}
