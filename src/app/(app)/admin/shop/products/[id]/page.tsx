import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  deleteProductAction,
  deleteProductImageAction,
  moveProductImageAction,
} from "@/app/actions/shop-admin";
import { SubmitButton } from "@/components/SubmitButton";
import { getT } from "@/lib/i18n/server";
import { PRODUCT_COLUMNS, type ProductRow } from "@/lib/shop/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PhotoUploader } from "../PhotoUploader";
import { ProductForm } from "../ProductForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopProducts };
}

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/admin/shop/products/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = createAdminClient();
  const [t, { data: product }, { data: partners }, { data: images }] =
    await Promise.all([
      getT(),
      db
        .from("shop_products")
        .select(PRODUCT_COLUMNS)
        .eq("id", id)
        .maybeSingle<ProductRow>(),
      db
        .from("shop_partners")
        .select("id, name, active")
        .order("name")
        .returns<{ id: string; name: string; active: boolean }[]>(),
      db
        .from("shop_product_images")
        .select("id")
        .eq("product_id", id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .returns<{ id: string }[]>(),
    ]);
  if (!product) notFound();
  const back = `/admin/shop/products/${id}`;
  const imgs = images ?? [];
  return (
    <div className="space-y-5">
      <Link
        href="/admin/shop/products"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.adminShopProducts}
      </Link>
      <h1 className="text-primary-strong text-2xl font-bold">
        {product.name_th}
      </h1>
      {sp.created ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.adminShopProductCreated}
        </p>
      ) : null}

      <section className="card space-y-3" aria-labelledby="ph-h">
        <h2 id="ph-h" className="font-semibold">
          {t.adminShopPhotos}
        </h2>
        {imgs.length === 0 ? (
          <p className="text-muted text-sm">{t.adminShopPhotosNone}</p>
        ) : (
          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            aria-label={t.adminShopPhotos}
          >
            {imgs.map((i, n) => (
              <li key={i.id} className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/shop/img/${i.id}`}
                  alt={`${product.name_th} ${n + 1}`}
                  className="aspect-square w-full rounded-xl bg-white object-contain"
                />
                <div className="flex gap-1">
                  {(["up", "down"] as const).map((dir) => (
                    <form key={dir} action={moveProductImageAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="dir" value={dir} />
                      <input type="hidden" name="back" value={back} />
                      <SubmitButton
                        className="btn btn-secondary px-2"
                        aria-label={`${dir === "up" ? t.adminShopPhotoUp : t.adminShopPhotoDown} ${n + 1}`}
                        disabled={
                          (dir === "up" && n === 0) ||
                          (dir === "down" && n === imgs.length - 1)
                        }
                      >
                        {dir === "up" ? (
                          <ArrowUp className="size-4" aria-hidden />
                        ) : (
                          <ArrowDown className="size-4" aria-hidden />
                        )}
                      </SubmitButton>
                    </form>
                  ))}
                  <form action={deleteProductImageAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="back" value={back} />
                    <SubmitButton
                      className="btn btn-secondary px-2"
                      aria-label={`${t.adminShopPhotoDelete} ${n + 1}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <PhotoUploader productId={id} />
      </section>

      <div className="card">
        <ProductForm product={product} partners={partners ?? []} />
      </div>

      <form action={deleteProductAction}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton className="btn btn-secondary">
          {t.adminShopProductDelete}
        </SubmitButton>
      </form>
    </div>
  );
}
