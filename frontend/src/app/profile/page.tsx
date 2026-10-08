"use client";

import { LayoutShell } from "@/components/LayoutShell";
import { Button } from "@/components/Button";
import { useAuth } from "@/context/AuthContext";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  return <LayoutShell><div className="flex min-h-[560px] flex-col"><h1 className="font-display text-xl font-bold">Profile</h1><div className="mt-6 rounded-2xl border border-line p-4 text-sm"><p><span className="text-muted">Username</span><br />@{user?.username}</p><p className="mt-4"><span className="text-muted">Email</span><br />{user?.email}</p></div><div className="mt-auto"><Button type="button" onClick={() => void logout()}>Log out</Button></div></div></LayoutShell>;
}
