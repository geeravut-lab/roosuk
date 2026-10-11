import "server-only";
import { cookies } from "next/headers";
import { applyBrandNames, isDefaultNames } from "@/lib/brand/brand";
import { loadBrand } from "@/lib/brand/server";
import {
  DEFAULT_LANG,
  dict,
  isLang,
  LANG_COOKIE,
  type Dict,
  type Lang,
} from "./dict";

/** Language of the current request (cookie), defaulting to Thai. */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

const branded = new Map<string, Dict>();

/**
 * The dictionary of one language with the admin's app name swapped in. Cached per
 * (language, names) so the text pass runs once, not on every request.
 */
export async function brandedDict(lang: Lang): Promise<Dict> {
  const brand = await loadBrand();
  if (isDefaultNames(brand)) return dict[lang];
  const key = `${lang}|${brand.nameTh}|${brand.nameEn}`;
  let d = branded.get(key);
  if (!d) {
    if (branded.size > 8) branded.clear();
    d = applyBrandNames(dict[lang], brand);
    branded.set(key, d);
  }
  return d;
}

export async function getT(): Promise<Dict> {
  return brandedDict(await getLang());
}
