"use client";

import {
  saveShopSettingsAction,
  type SimpleState,
} from "@/app/actions/shop-admin";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import type { ShopSettings } from "@/lib/shop/shop";
import { useFormAction } from "@/lib/use-form-action";

const initial: SimpleState = {};

export function ShopSettingsForm({ current }: { current: ShopSettings }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    saveShopSettingsAction,
    initial,
  );
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="shop-ship" className="label">
          {t.adminShopShipping}
        </label>
        <input
          id="shop-ship"
          name="shipping"
          inputMode="numeric"
          required
          defaultValue={current.shippingThb}
          className="field w-40"
        />
      </div>
      <div>
        <label htmlFor="shop-free" className="label">
          {t.adminShopFreeFrom}
        </label>
        <input
          id="shop-free"
          name="freeFrom"
          inputMode="numeric"
          required
          defaultValue={current.freeShippingFromThb}
          className="field w-40"
        />
      </div>
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.adminShopSaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {t.adminShopSave}
      </button>
    </form>
  );
}
