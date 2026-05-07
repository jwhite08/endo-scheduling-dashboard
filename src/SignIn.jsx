// =========================================================================
//  SignIn screen
//  Shown to unauthenticated users before the dashboard.
// =========================================================================

import React, { useState } from "react";
import { LogIn, Loader2, AlertTriangle } from "lucide-react";
import { signIn } from "./supabase";

export default function SignIn({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      onSuccess?.();
    } catch (err) {
      // Supabase returns "Invalid login credentials" for both wrong-email and
      // wrong-password by design (avoids leaking which one is wrong).
      setError(err.message || "Sign-in failed");
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

        {/* Sign-in card */}
        <form
          onSubmit={submit}
          className="bg-[#162238] border ga-border rounded-lg p-6 shadow-2xl"
        >
          <h2 className="font-display text-lg font-semibold text-ga mb-1">Sign in</h2>
          <p className="text-xs text-ga-dim mb-5">
            Use the credentials provided by your administrator.
          </p>

          <label className="block mb-3">
            <span className="text-xs font-mono-custom text-ga-dim uppercase tracking-wider">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-[#0F1A2E] border ga-border rounded-md text-ga outline-none focus:border-ga-accent focus:shadow-[0_0_0_2px_rgba(56,189,248,0.2)] transition-all"
            />
          </label>

          <label className="block mb-5">
            <span className="text-xs font-mono-custom text-ga-dim uppercase tracking-wider">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
                <Loader2 size={15} className="animate-spin" /> Signing in…
              </>
            ) : (
              <>
                <LogIn size={15} /> Sign in
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-ga-muted mt-6 font-mono-custom">
          Forgot your password? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
