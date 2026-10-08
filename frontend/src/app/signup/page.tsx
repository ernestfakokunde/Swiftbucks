"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError, createUser } from "@/lib/api";
import { Button } from "@/components/Button";
import { AuthShowcase } from "@/components/AuthShowcase";

const schema = z.object({
  email: z.email(),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
  password: z.string().min(8).max(128),
});

export default function SignupPage() {
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      createUser(values.email.toLowerCase(), values.username.toLowerCase(), values.password),
    onSuccess: () => router.replace("/login"),
  });

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
      <AuthShowcase mode="signup" />
      <form
        className="mx-auto w-full max-w-[460px] rounded-[28px] border border-line bg-surface p-6 shadow-[0_24px_70px_rgba(13,23,34,0.18)] sm:p-8"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <h1 className="font-display text-2xl font-bold">Make money moves simpler</h1>
        <p className="mt-1 text-sm text-muted">Create your Swiftbuck wallet in under a minute.</p>
        <label className="mt-6 block text-sm text-muted" htmlFor="email">Email</label>
        <input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...form.register("email")} className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 outline-none focus:border-orange" />
        <label className="mt-4 block text-sm text-muted" htmlFor="username">Username</label>
        <input id="username" placeholder="Choose a username" autoComplete="username" {...form.register("username")} className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 outline-none focus:border-orange" />
        <label className="mt-4 block text-sm text-muted" htmlFor="password">Password</label>
        <input id="password" type="password" placeholder="At least 8 characters" autoComplete="new-password" {...form.register("password")} className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 outline-none focus:border-orange" />
        <p className="min-h-8 pt-2 text-sm text-red" role="alert">
          {mutation.error instanceof ApiError ? mutation.error.message : " "}
        </p>
        <Button type="submit" disabled={mutation.isPending}>Create account</Button>
        <p className="mt-4 text-center text-sm text-muted">
          Already registered? <Link className="text-orange hover:underline" href="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}
