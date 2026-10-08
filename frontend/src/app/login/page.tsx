"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { Suspense } from "react";
import { z } from "zod";
import { ApiError, login } from "@/lib/api";
import { Button } from "@/components/Button";
import { AuthShowcase } from "@/components/AuthShowcase";

const schema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

function nextPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => login(values.email, values.password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace(nextPath(search.get("next")));
    },
  });

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
      <AuthShowcase mode="login" />
      <form
        className="mx-auto w-full max-w-[460px] rounded-[28px] border border-line bg-surface p-6 shadow-[0_24px_70px_rgba(13,23,34,0.18)] sm:p-8"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <h1 className="font-display text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Your wallet is waiting for you.</p>
        <label className="mt-6 block text-sm text-muted" htmlFor="email">Email</label>
        <input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...form.register("email")} className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 outline-none focus:border-orange" />
        <label className="mt-4 block text-sm text-muted" htmlFor="password">Password</label>
        <input id="password" type="password" placeholder="Enter your password" autoComplete="current-password" {...form.register("password")} className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 outline-none focus:border-orange" />
        <p className="min-h-8 pt-2 text-sm text-red" role="alert">
          {mutation.error instanceof ApiError ? mutation.error.message : form.formState.errors.email?.message}
        </p>
        <Button type="submit" disabled={mutation.isPending}>Log in</Button>
        <p className="mt-4 text-center text-sm text-muted">
          New to Swiftbuck? <Link className="text-orange hover:underline" href="/signup">Create an account</Link>
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center">Loading your wallet...</main>}><LoginForm /></Suspense>;
}
