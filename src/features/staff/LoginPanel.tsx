"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { createStaffLogin, resetStaffPassword, unlinkStaffLogin } from "./login-actions";
import type { StaffMember } from "./queries";

/**
 * Creating the login lives here rather than in the staff form because
 * it is a genuinely different operation: adding a person is a record,
 * giving them a login is access. Mixing them into one Save meant a
 * typo in a phone number and a password change were the same action.
 */
export function LoginPanel({ member }: { member: StaffMember }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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

  function reset() {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await resetStaffPassword(member.email ?? "");
      if (r.ok) setNotice(r.data);
      else setError(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          Login
          <Badge tone={member.hasLogin ? "done" : "neutral"}>
            {member.hasLogin ? "Can sign in" : "No login"}
          </Badge>
        </span>

        {member.hasLogin ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={reset}>
              Send reset link
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={unlink}>
              Remove login
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant={open ? "ghost" : "primary"}
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
        {open && !member.hasLogin && (
          <form action={create} className="space-y-3">
            <input type="hidden" name="staffId" value={member.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="loginEmail">Email</Label>
                <Input
                  id="loginEmail"
                  name="email"
                  type="email"
                  required
                  defaultValue={member.email ?? ""}
                />
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
              Give this password to them directly and have them change it. Anyone who can
              sign in gets whatever their role allows — a manager can approve transfers
              and fill the register, so only create logins for people who should have
              that reach.
            </p>
            <Button type="submit" disabled={pending}>
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
          <p className="text-sm text-text-muted">
            Signs in with {member.email ?? "their linked email"}. Removing the login keeps
            the person, their attendance and their sales history — it only takes away
            access.
          </p>
        )}

        {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
        <FieldError>{error}</FieldError>
      </CardBody>
    </Card>
  );
}
