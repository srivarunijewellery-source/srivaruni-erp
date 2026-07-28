"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, type Result } from "@/lib/result";

const credentials = z.object({
  email: z.string().email("Enter a valid email address."),
  // Deliberately not enforcing a minimum here. The seeded test account
  // has a five-character password written straight into auth.users, and
  // a client-side rule would lock it out of its own app.
  password: z.string().min(1, "Enter your password."),
});

export async function signIn(_prev: unknown, formData: FormData): Promise<Result> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check your details.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return err("That email and password do not match.");

  revalidatePath("/", "layout");
  redirect(ROUTES.dashboard);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(ROUTES.login);
}
