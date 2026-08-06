"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import {
  createStaffLogin,
  resetStaffPassword,
  setStaffPassword,
  unlinkStaffLogin,
} from "./login-actions";
import type { StaffMember } from "./queries";

/**
 * Creating the login lives here rather than in the staff form because
 * it is a genuinely different operation: adding a person is a record,
 * giving them a login is access. Mixing them into one Save meant a
 * typo in a phone number and a password change were the same action.
 */
export function LoginPanel({
  member,
  configured = true,
  loginEmail,
}: {
  member: StaffMember;
  /** The address this person actually signs in with, read from
   *  auth.users. staff.email is a contact address and drifts from it. */
  loginEmail?: string | null;
  /** False when this deployment has no service-role key, without which
   *  an auth user cannot be minted at all. Better to say so before the
   *  form is filled in than after Create is pressed. */
  configured?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);

  function create(formData: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await createStaffLogin(formData);
      if (r.ok) {
        setNotice(r.data);
        setOpen(false);
      } else setError(r.error);
    });
  }

  function unlink() {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await unlinkStaffLogin(member.id);
      if (r.ok) setNotice("Login removed. The person and their history are untouched.");
      else setError(r.error);
    });
  }

  function changePassword(formData: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await setStaffPassword(formData);
      if (r.ok) {
        setNotice(r.data);
        setReveal(false);
      } else setError(r.error);
    });
  }

  function reset() {
    start(async () => {
      setError(null);
      setNotice(null);
      // The credential, not the contact address. Sending a reset to
      // staff.email mailed the wrong inbox and reported success anyway.
      const r = await resetStaffPassword(loginEmail ?? "");
      if (r.ok) setNotice(r.data);
      else setError(r.error);
    });
  }

  return (
    <Card id="login" className="scroll-mt-20">
      <CardHeader className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          Login
          <Badge tone={member.hasLogin ? "done" : "neutral"}>
            {member.hasLogin ? "Can sign in" : "No login"}
          </Badge>
        </span>

        {member.hasLogin ? (
          <div className="flex gap-2">
            {/* Demoted deliberately. Most sign-in addresses here are
                made-up srivaruni.com usernames, so a reset link goes
                nowhere -- and Supabase reports success either way. The
                owner setting a password directly is the real recovery
                path, so that is the one given room below. */}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={reset}
              title="Only works if the sign-in address is a real inbox they can open."
            >
              Email a reset link
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={unlink}>
              Remove login
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant={open ? "ghost" : "primary"}
            disabled={!configured}
            onClick={() => {
              setOpen(!open);
              setError(null);
            }}
          >
            {open ? "Cancel" : "Create login"}
          </Button>
        )}
      </CardHeader>

      <CardBody className="space-y-3">
        {!configured && (
          <p className="rounded-control bg-status-pending-bg px-3 py-2 text-2xs text-status-pending-fg">
            This deployment has no service-role key set, so logins cannot be created from
            here. Add SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings and redeploy.
          </p>
        )}

        {open && !member.hasLogin && (
          <form action={create} className="space-y-3">
            <input type="hidden" name="staffId" value={member.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="loginEmail">Sign-in address</Label>
                <Input
                  id="loginEmail"
                  name="email"
                  type="email"
                  required
                  placeholder="name@srivaruni.com"
                  defaultValue={member.email ?? ""}
                />
                <p className="mt-1 text-2xs text-text-muted">
                  This is the username they type, and it does not have to be a real
                  inbox. It has to look like an email and be unique.
                </p>
              </div>
              <div>
                <Label htmlFor="loginPassword">Starting password</Label>
                <Input
                  id="loginPassword"
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                />
              </div>
            </div>
            <p className="text-2xs text-text-muted">
              Give this password to them directly. You can change it here any time they
              forget it, so nothing depends on them receiving an email. Anyone who can
              sign in gets whatever their role allows — a manager can approve transfers
              and fill the register, so only create logins for people who should have
              that reach.
            </p>
            <Button type="submit" disabled={pending || !configured}>
              {pending ? "Creating…" : "Create login"}
            </Button>
          </form>
        )}

        {!open && !member.hasLogin && (
          <p className="text-sm text-text-muted">
            This person has no way to sign in. Attendance and sales can still be
            recorded against them by someone else.
          </p>
        )}

        {member.hasLogin && (
          <>
            <p className="text-sm text-text-muted">
              Signs in with{" "}
              <span className="font-mono text-text">
                {loginEmail ?? "an address that could not be read"}
              </span>
              . Removing the login keeps the person, their attendance and their sales
              history — it only takes away access.
            </p>
            {loginEmail && member.email && loginEmail !== member.email && (
              <p className="text-2xs text-text-muted">
                Their contact email on file is {member.email}, which is a different
                address. A reset link goes to the sign-in address above.
              </p>
            )}

            {/* Once a login existed there was no way back in to change
                anything: the form disappeared and only Reset and Remove
                were left. Setting a password directly matters when
                someone is standing at the counter locked out and a reset
                email is no use to them. */}
            <p className="text-2xs text-text-muted">
              Forgotten password? Set a new one here and tell them what it is. That works
              whether or not the address above is a real inbox.
            </p>

            {reveal ? (
              <form action={changePassword} className="space-y-3">
                <input type="hidden" name="staffId" value={member.id} />
                <div className="max-w-xs">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    name="password"
                    type="text"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending || !configured}>
                    {pending ? "Saving…" : "Set this password"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setReveal(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!configured}
                  onClick={() => setReveal(true)}
                >
                  Set a new password
                </Button>
                {!configured && (
                  <span className="self-center text-2xs text-text-muted">
                    needs SUPABASE_SERVICE_ROLE_KEY
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
        <FieldError>{error}</FieldError>
      </CardBody>
    </Card>
  );
}
