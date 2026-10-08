"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getMe, logout as logoutRequest, type User } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

type AuthContextValue = {
  user: User | undefined;
  isLoading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    retry: false,
  });
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!me.isLoading && me.data && (pathname === "/login" || pathname === "/signup")) {
      router.replace("/");
    }
  }, [me.data, me.isLoading, pathname, router]);
  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.clear();
      router.push("/login");
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: me.data,
        isLoading: me.isLoading,
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
