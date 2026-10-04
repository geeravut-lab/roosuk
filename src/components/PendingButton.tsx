"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./Spinner";

/** A submit button that disables itself, shows a spinner and swaps its label while its form's action runs. */
export function PendingButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={className}
    >
      {pending ? <Spinner /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
