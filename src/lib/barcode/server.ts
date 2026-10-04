import "server-only";
import { parseOffProduct, type BarcodeProduct } from "./barcode";

/**
 * Open Food Facts (free, open, keyed by the GS1 barcode number). The base URL is
 * server configuration (a test points it at a local stub); the number that goes
 * into the path was already validated as digits only.
 */
const DEFAULT_BASE = "https://world.openfoodfacts.org";
const TIMEOUT_MS = 6_000;

export type BarcodeLookup =
  | { ok: true; product: BarcodeProduct }
  | { ok: false; reason: "not_found" | "no_nutrition" | "unavailable" };

export async function lookupBarcode(
  code: string,
  fetchFn: typeof fetch = fetch,
): Promise<BarcodeLookup> {
  const base = (
    process.env.OPEN_FOOD_FACTS_URL?.trim() || DEFAULT_BASE
  ).replace(/\/+$/, "");
  const url = `${base}/api/v2/product/${code}.json?fields=product_name,product_name_th,product_name_en,generic_name,brands,serving_quantity,nutriments`;
  try {
    const res = await fetchFn(url, {
      headers: {
        "User-Agent": "RooSuk/1.0 (https://roosuk.netlify.app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const json: unknown = await res.json();
    const status = (json as { status?: unknown })?.status;
    if (
      status === 0 ||
      status === "0" ||
      (json as { product?: unknown })?.product === undefined
    )
      return { ok: false, reason: "not_found" };
    const product = parseOffProduct(json);
    return product
      ? { ok: true, product }
      : { ok: false, reason: "no_nutrition" };
  } catch (err) {
    console.error(
      "[barcode] lookup failed:",
      err instanceof Error ? err.name : err,
    );
    return { ok: false, reason: "unavailable" };
  }
}
