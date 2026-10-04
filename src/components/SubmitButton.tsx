"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./Spinner";

/**
 * A submit button for a form whose action runs on the server: while it runs the
 * button shows a spinner and cannot be pressed again, so a slow action is never
 * started twice by an impatient second tap. It must sit inside the <form>.
 */
export function SubmitButton({
  children,
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  const { pending, data } = useFormStatus();
  // In a form with several submit buttons only the one that was pressed spins.
  const mine =
    pending &&
    (rest.name === undefined ||
      data?.get(rest.name) === String(rest.value ?? ""));
  return (
    <button
      {...rest}
      type="submit"
      disabled={disabled || pending}
      aria-busy={mine || undefined}
    >
      {mine ? <Spinner /> : null}
      {children}
    </button>
  );
}
