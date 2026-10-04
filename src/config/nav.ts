import {
  Award,
  Bell,
  Camera,
  ChartLine,
  Crown,
  House,
  MessageCircleHeart,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";

export type NavLabelKey = Extract<keyof Dict, `nav${string}`>;
export type NavGroup = "daily" | "account";

export interface NavItem {
  href: string;
  label: NavLabelKey;
  icon: LucideIcon;
  group: NavGroup;
}

/**
 * The ONE menu list (docs/02-navigation.md): the desktop sidebar, the mobile
 * bottom bar and the "More" sheet are all derived from it, so adding a page
 * here updates all three. Order matters — the first four are what people tap
 * every day, and they become the bottom bar.
 */
export const NAV: readonly NavItem[] = [
  { href: "/today", label: "navToday", icon: House, group: "daily" },
  { href: "/timeline", label: "navTimeline", icon: ChartLine, group: "daily" },
  { href: "/scan", label: "navScan", icon: Camera, group: "daily" },
  { href: "/ask", label: "navAsk", icon: MessageCircleHeart, group: "daily" },
  {
    href: "/achievements",
    label: "navAchievements",
    icon: Award,
    group: "account",
  },
  {
    href: "/subscription",
    label: "navSubscription",
    icon: Crown,
    group: "account",
  },
  {
    href: "/notifications",
    label: "navNotifications",
    icon: Bell,
    group: "account",
  },
  {
    href: "/profile",
    label: "navProfile",
    icon: UserRound,
    group: "account",
  },
  { href: "/settings", label: "navSettings", icon: Settings, group: "account" },
];

/** Bottom bar = first four items + a "More" button. */
export const PRIMARY_NAV_COUNT = 4;
/** Slot (0-based) of the raised centre button in the five-slot bottom bar: today · timeline · [SCAN] · ask · more. */
export const CENTER_SLOT = 2;

export const NAV_GROUPS: readonly {
  id: NavGroup;
  label: Extract<keyof Dict, `navGroup${string}`>;
}[] = [
  { id: "daily", label: "navGroupDaily" },
  { id: "account", label: "navGroupAccount" },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * "Back" for pages below a menu page. iPhones in a browser have no back button
 * (and an installed PWA has none at all), so every page that is not itself a
 * menu entry gets a link up to its parent. Where a page can be reached from
 * several places, the link that brought the user there says so with `?from=`
 * and the back link follows it.
 */
export type BackLabelKey =
  | "navToday"
  | "navTimeline"
  | "navScan"
  | "navSubscription"
  | "navAdmin"
  | "navNotifications";

export interface BackTarget {
  href: string;
  label: BackLabelKey;
}

const PARENTS: readonly { pattern: RegExp; to: BackTarget }[] = [
  {
    pattern: /^\/scan\/(food|lab|body)(\/[^/]+)?$/,
    to: { href: "/scan", label: "navScan" },
  },
  {
    pattern: /^\/quiz-result\/[^/]+$/,
    to: { href: "/today", label: "navToday" },
  },
  { pattern: /^\/today\/checkin$/, to: { href: "/today", label: "navToday" } },
  {
    pattern: /^\/checkup-interest$/,
    to: { href: "/today", label: "navToday" },
  },
  {
    pattern: /^\/subscription\/pay\/[^/]+$/,
    to: { href: "/subscription", label: "navSubscription" },
  },
  { pattern: /^\/admin\/.+$/, to: { href: "/admin", label: "navAdmin" } },
];

/** Where the user may have come from, by `?from=`; anything else is ignored. */
const FROM: Record<string, BackTarget> = {
  timeline: { href: "/timeline", label: "navTimeline" },
  today: { href: "/today", label: "navToday" },
  notifications: { href: "/notifications", label: "navNotifications" },
  scan: { href: "/scan", label: "navScan" },
};

export function backTarget(
  pathname: string,
  from?: string | null,
): BackTarget | null {
  const parent = PARENTS.find((r) => r.pattern.test(pathname))?.to;
  if (!parent) return null;
  // own keys only: "constructor" or "__proto__" must not resolve to something from Object.prototype
  const origin = from && Object.hasOwn(FROM, from) ? FROM[from] : undefined;
  return origin && origin.href !== pathname ? origin : parent;
}
