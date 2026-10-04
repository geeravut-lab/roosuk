"use client";

import { saveProductAction, type ProductState } from "@/app/actions/shop-admin";
import { Spinner } from "@/components/Spinner";
import { errorText, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { FOCUS_TAGS } from "@/lib/shop/product";
import type { ProductRow } from "@/lib/shop/server";
import { useFormAction } from "@/lib/use-form-action";

const initial: ProductState = {};

type TextKey = keyof ProductRow;

export function ProductForm({
  product,
  partners,
}: {
  product?: ProductRow;
  partners: { id: string; name: string; active: boolean }[];
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(saveProductAction, initial);
  const bad = (f: string) => state.fields?.includes(f as never);
  const label = (f: string) => t[`adminShopField_${f}` as keyof Dict] as string;
  const input = (
    name: TextKey,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label htmlFor={`pf-${name}`} className="label">
        {label(name)}
      </label>
      <input
        id={`pf-${name}`}
        name={name}
        defaultValue={
          (product?.[name] as string | number | null | undefined) ?? ""
        }
        aria-invalid={bad(name) || undefined}
        className={`field ${bad(name) ? "border-danger" : ""}`}
        autoComplete="off"
        {...props}
      />
    </div>
  );
  const area = (name: TextKey, rows = 3) => (
    <div>
      <label htmlFor={`pf-${name}`} className="label">
        {label(name)}
      </label>
      <textarea
        id={`pf-${name}`}
        name={name}
        rows={rows}
        defaultValue={(product?.[name] as string | null | undefined) ?? ""}
        aria-invalid={bad(name) || undefined}
        className={`field py-2 ${bad(name) ? "border-danger" : ""}`}
      />
    </div>
  );
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {input("sku", { required: true, maxLength: 40 })}
        <div>
          <label htmlFor="pf-partner" className="label">
            {label("partner_id")}
          </label>
          <select
            id="pf-partner"
            name="partner_id"
            required
            defaultValue={product?.partner_id ?? ""}
            className={`field ${bad("partner") ? "border-danger" : ""}`}
          >
            <option value="" disabled>
              —
            </option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? "" : " (off)"}
              </option>
            ))}
          </select>
        </div>
        {input("name_th", { required: true, maxLength: 120 })}
        {input("name_en", { maxLength: 120 })}
        {input("brand", { maxLength: 80 })}
        {input("serving", { maxLength: 80 })}
        {input("price_thb", { required: true, inputMode: "numeric" })}
        {input("compare_at_thb", { inputMode: "numeric" })}
        {input("stock", { inputMode: "numeric" })}
        {input("sort", { inputMode: "numeric" })}
      </div>
      {area("summary_th", 2)}
      {area("summary_en", 2)}
      {area("description_th", 5)}
      {area("description_en", 5)}
      {area("ingredients")}
      {area("usage_note")}
      {area("caution")}
      {input("fda_no", { maxLength: 40 })}
      <p className="text-muted text-sm">{t.adminShopClaimsHint}</p>
      <fieldset className="space-y-2">
        <legend className="label">{label("tags")}</legend>
        <div className="flex flex-wrap gap-3">
          {FOCUS_TAGS.map((tag) => (
            <label
              key={tag}
              className="inline-flex min-h-11 items-center gap-2"
            >
              <input
                type="checkbox"
                name="tags"
                value={tag}
                defaultChecked={product?.focus_tags.includes(tag)}
                className="size-5"
              />
              <span className="text-sm">
                {t[`shopTag_${tag}` as keyof Dict]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? false}
          className="mt-1 size-5"
        />
        <span className="text-sm">{label("active")}</span>
      </label>
      {state.error ? (
        <div
          role="alert"
          className="bg-tint-warn space-y-1 rounded-xl px-3 py-2 text-sm font-medium"
        >
          <p>{errorText(state.error, t)}</p>
          {state.fields?.length ? (
            <ul className="list-disc pl-5">
              {state.fields.map((f) => (
                <li key={f}>{label(f)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.adminShopSaved}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {t.adminShopProductSave}
      </button>
    </form>
  );
}
