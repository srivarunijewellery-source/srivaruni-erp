import type { Metadata } from "next";
import { APP } from "@/config/app";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
            {APP.shortName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{APP.name}</h1>
          <p className="mt-1 text-sm text-text-muted">Stock and inward control.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
