"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "./auth";

/**
 * Hook that handles client-side auth check and hydration safety.
 * Returns { mounted, authed } — render nothing meaningful until mounted=true.
 */
export function useAuth(redirectTo = "/login") {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) {
      router.replace(redirectTo);
    } else {
      setAuthed(true);
    }
  }, [router, redirectTo]);

  return { mounted, authed };
}
