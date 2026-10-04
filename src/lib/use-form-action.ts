"use client";

import { useState, useTransition, type FormEvent } from "react";

/**
 * Run a server action from a form WITHOUT React's automatic form reset.
 * `<form action={fn}>` resets every uncontrolled field after the action
 * finishes — even when it returned an error — so a typo in one field wiped the
 * rest of the form (and a chosen file). Here the form keeps what the user
 * entered; a redirect() from the action still navigates as usual.
 */
export function useFormAction<S>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initial: S,
) {
  const [state, setState] = useState<S>(initial);
  const [pending, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      setState(await action(state, data));
    });
  };
  return [state, onSubmit, pending] as const;
}
