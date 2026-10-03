import "server-only";
import { cookies } from "next/headers";
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

export async function getT(): Promise<Dict> {
  return dict[await getLang()];
}
