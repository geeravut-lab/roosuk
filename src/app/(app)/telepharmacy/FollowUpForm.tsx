"use client";

import {
  followUpReplyAction,
  type FollowUpState,
} from "@/app/actions/telepharmacy";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: FollowUpState = {};

/** The person's short answer to "how is it going?", written beside the pharmacist's follow-up. */
export function FollowUpForm({ consultId }: { consultId: string }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(followUpReplyAction, initial);
  if (state.saved)
    return (
      <p role="status" className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium">
        {t.teleFollowUpSent}
      </p>
    );
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="consultId" value={consultId} />
      <label htmlFor={`fu-${consultId}`} className="label">
        {t.teleFollowUpReplyLabel}
      </label>
      <textarea id={`fu-${consultId}`} name="reply" rows={2} maxLength={500} required className="field py-2" />
      {state.error ? (
        <p role="alert" className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium">
          {errorText(state.error, t)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-secondary">
        {pending ? <Spinner /> : null}
        {t.teleFollowUpSend}
      </button>
    </form>
  );
}
