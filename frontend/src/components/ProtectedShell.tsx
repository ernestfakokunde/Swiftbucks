"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { SplashScreen } from "./SplashScreen";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, pathname, router, user]);

  if (isLoading || !user) return <SplashScreen />;
  return <>{children}</>;
}
