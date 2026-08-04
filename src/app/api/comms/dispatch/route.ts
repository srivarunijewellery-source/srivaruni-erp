import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { drainOutbox } from "@/lib/comms/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The ONE genuinely external entry point for sending.
 *
 * Vercel Cron hits this once a day (`?scheduled=1`, see vercel.json) --
 * that call comes from outside this app's own process, over the public
 * internet, with no user session to prove who it is. CRON_SECRET exists
 * to answer exactly that: "is this really our cron, and not anyone else
 * who found the URL."
 *
 * Server actions inside the app do NOT come through here anymore. They
 * call drainOutbox() directly -- see src/lib/comms/poke.ts -- because a
 * call from our own running process to our own running process has
 * nothing to authenticate; going out over HTTP and back in just to
 * check a secret against itself added a dependency on that secret
 * reaching every serverless instance, which is exactly what broke when
 * it was added after the last deploy.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(request.url);
  const isDaily = url.searchParams.get("scheduled") === "1";

  if (isDaily) {
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.rpc("queue_scheduled_events", {
      p_on: today,
      p_force: false,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.rpc("queue_comms_health_check", { p_on: today });
  }

  try {
    const result = await drainOutbox(supabase, isDaily ? 20 : 1);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dispatch failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}

/** Vercel Cron issues GET. */
export async function GET(request: Request) {
  return handle(request);
}
