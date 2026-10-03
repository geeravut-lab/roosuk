"use client";

import { useActionState, useState } from "react";
import {
  googleSignInAction,
  loginAction,
  signupAction,
  type AuthState,
} from "@/app/actions/auth";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";

const initial: AuthState = {};

export function AuthForm({
  initialMode,
  next,
  lineEnabled,
  initialError,
}: {
  initialMode: "login" | "signup";
  next: string;
  lineEnabled: boolean;
  initialError?: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState(initialMode);
  const [loginState, login, loginPending] = useActionState(
    loginAction,
    initial,
  );
  const [signupState, signup, signupPending] = useActionState(
    signupAction,
    initial,
  );

  const isSignup = mode === "signup";
  const state = isSignup ? signupState : loginState;
  const pending = isSignup ? signupPending : loginPending;
  const errorCode = state.error ?? initialError;

  if (isSignup && signupState.needsEmailConfirmation) {
    return (
      <div className="card space-y-2 text-center" role="status">
        <h2 className="text-primary-strong text-xl font-bold">
          {t.authCheckEmailTitle}
        </h2>
        <p>{t.authCheckEmailBody}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {isSignup ? t.authTitleSignup : t.authTitleLogin}
      </h1>

      {errorCode ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(errorCode, t)}
        </p>
      ) : null}

      <form
        action={isSignup ? signup : login}
        className="space-y-4"
        noValidate={false}
      >
        <input type="hidden" name="next" value={next} />
        {isSignup ? (
          <div>
            <label htmlFor="displayName" className="label">
              {t.authDisplayName}
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              maxLength={60}
              autoComplete="name"
              className="field"
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="label">
            {t.authEmail}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t.authPassword}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={isSignup ? 8 : undefined}
            maxLength={72}
            autoComplete={isSignup ? "new-password" : "current-password"}
            aria-describedby={isSignup ? "password-hint" : undefined}
            className="field"
          />
          {isSignup ? (
            <p id="password-hint" className="text-muted mt-1 text-sm">
              {t.authPasswordHint}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary w-full"
        >
          {isSignup ? t.authSubmitSignup : t.authSubmitLogin}
        </button>
      </form>

      <p className="text-center">
        <button
          type="button"
          onClick={() => setMode(isSignup ? "login" : "signup")}
          className="text-primary-strong min-h-11 font-medium underline"
        >
          {isSignup ? t.authSwitchToLogin : t.authSwitchToSignup}
        </button>
      </p>

      <div className="text-muted flex items-center gap-3 text-sm" aria-hidden>
        <span className="bg-line h-px flex-1" />
        {t.authOr}
        <span className="bg-line h-px flex-1" />
      </div>

      <div className="flex flex-col gap-3">
        <form action={googleSignInAction}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn btn-secondary w-full">
            {t.authGoogle}
          </button>
        </form>
        {lineEnabled ? (
          // A plain link, not <Link>: this is a route handler that redirects off-site.
          <a
            href={`/api/auth/line?mode=login&next=${encodeURIComponent(next)}`}
            className="btn btn-secondary w-full"
          >
            {t.authLine}
          </a>
        ) : null}
      </div>
    </div>
  );
}
