// =========================================================================
//  ResetPassword screen
//  Shown when a user lands on the site after clicking a password reset link
//  in their email. supabase-js auto-establishes a recovery session from the
//  URL hash, which surfaces as a PASSWORD_RECOVERY event.
// =========================================================================

import React, { useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";
import { updateUserPassword, signOut } from "./supabase";

export default function ResetPassword({ onComplete }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      await updateUserPassword(password);
      setDone(true);
      // Sign out so the user must log in fresh with the new password.
      // This also clears the recovery-only session.
      await signOut();
      setTimeout(() => {
        onComplete?.();
      }, 1800);
    } catch (err) {
      setError(err.message || "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ga-bg min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo + title */}
        <div className="flex flex-col items-center mb-8">
          <div className="logo-glow relative mb-4">
            <img
              src="/ga-logo.png"
              alt="Gastroenterology Associates"
              className="h-20 w-auto relative z-10"
              draggable="false"
            />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ga text-center">
            Gastroenterology Associates
          </h1>
          <p className="text-[11px] text-ga-accent mt-1.5 tracking-[0.2em] uppercase font-medium">
            Endoscopy Scheduling
          </p>
        </div>

        {done ? (
          <div className="bg-[#162238] border ga-border rounded-lg p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={18} className="text-emerald-300" />
              <h2 className="font-display text-lg font-semibold text-ga">Password updated</h2>
            </div>
            <p className="text-sm text-ga-dim leading-relaxed">
              Your password has been changed. Redirecting you to sign in with the new password…
            </p>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="bg-[#162238] border ga-border rounded-lg p-6 shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-ga-accent" />
              <h2 className="font-display text-lg font-semibold text-ga">Set a new password</h2>
            </div>
            <p className="text-xs text-ga-dim mb-5">
              Choose a new password for your account. Minimum 8 characters.
            </p>

            <label className="block mb-3">
              <span className="text-xs font-mono-custom text-ga-dim uppercase tracking-wider">New password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-[#0F1A2E] border ga-border rounded-md text-ga outline-none focus:border-ga-accent focus:shadow-[0_0_0_2px_rgba(56,189,248,0.2)] transition-all"
              />
            </label>

            <label className="block mb-5">
              <span className="text-xs font-mono-custom text-ga-dim uppercase tracking-wider">Confirm</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-[#0F1A2E] border ga-border rounded-md text-ga outline-none focus:border-ga-accent focus:shadow-[0_0_0_2px_rgba(56,189,248,0.2)] transition-all"
              />
            </label>

            {error && (
              <div className="mb-4 p-3 bg-rose-950/40 border border-rose-800/50 rounded-md text-xs text-rose-200 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-ga-accent text-[#0B1220] text-sm font-semibold rounded-md hover:bg-[#0EA5E9] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(56,189,248,0.25)] transition-all"
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Updating…
                </>
              ) : (
                <>
                  <KeyRound size={15} /> Update password
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
