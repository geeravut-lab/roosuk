import {
  Award,
  Bell,
  Camera,
  ChartLine,
  FileChartColumn,
  FolderLock,
  IdCard,
  Smartphone,
  Target,
  Activity,
  ShieldCheck,
  Stethoscope,
  Bot,
  UsersRound,
  ShoppingBag,
  Building2,
  Watch,
  Gift,
  Trophy,
  Crown,
  House,
  MessageCircleHeart,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import { isEnabled, type FeatureFlag, type FlagMap } from "@/lib/flags/flags";

export type NavLabelKey = Extract<keyof Dict, `nav${string}`>;
export type NavGroup =
  "daily" | "data" | "care" | "rewards" | "shop" | "account";

export interface NavItem {
  href: string;
  label: NavLabelKey;
  icon: LucideIcon;
  group: NavGroup;
  /** Feature switches behind this page: the entry is greyed out when ALL of them are off. */
  flags?: readonly FeatureFlag[];
}

/**
 * The ONE menu list (docs/02-navigation.md): the desktop sidebar, the mobile
 * bottom bar and the "More" sheet are all derived from it, so adding a page
 * here updates all three. Order matters — the first four are what people tap
 * every day, and they become the bottom bar.
 */
export const NAV: readonly NavItem[] = [
  // ประจำวัน — what people open every day (the first four are the bottom bar)
  { href: "/today", label: "navToday", icon: House, group: "daily" },
  {
    href: "/goals",
    label: "navGoals",
    icon: Target,
    group: "daily",
    flags: ["goals"],
  },
  {
    href: "/scan",
    label: "navScan",
    icon: Camera,
    group: "daily",
    flags: ["food_scan", "lab_scan", "body_scan"],
  },
  { href: "/ask", label: "navAsk", icon: MessageCircleHeart, group: "daily" },
  {
    href: "/agent",
    label: "navAgent",
    icon: Bot,
    group: "daily",
    flags: ["health_agent"],
  },
  // ข้อมูลสุขภาพ — what the app keeps about you
  { href: "/timeline", label: "navTimeline", icon: ChartLine, group: "data" },
  {
    href: "/report",
    label: "navReport",
    icon: FileChartColumn,
    group: "data",
    flags: ["monthly_report"],
  },
  {
    href: "/vault",
    label: "navVault",
    icon: FolderLock,
    group: "data",
    flags: ["health_vault"],
  },
  {
    href: "/passport",
    label: "navPassport",
    icon: IdCard,
    group: "data",
    flags: ["health_passport"],
  },
  {
    href: "/wearables",
    label: "navWearables",
    icon: Watch,
    group: "data",
    flags: ["wearables"],
  },
  // ตรวจประเมินและปรึกษา
  {
    href: "/liver",
    label: "navLiver",
    icon: Activity,
    group: "care",
    flags: ["liver_check"],
  },
  {
    href: "/telepharmacy",
    label: "navTelepharmacy",
    icon: Stethoscope,
    group: "care",
    flags: ["telepharmacy"],
  },
  // กิจกรรมและรางวัล
  {
    href: "/challenges",
    label: "navChallenges",
    icon: Trophy,
    group: "rewards",
  },
  {
    href: "/achievements",
    label: "navAchievements",
    icon: Award,
    group: "rewards",
  },
  { href: "/rewards", label: "navRewards", icon: Gift, group: "rewards" },
  // ร้านค้าและครอบครัว
  {
    href: "/shop",
    label: "navShop",
    icon: ShoppingBag,
    group: "shop",
    flags: ["marketplace"],
  },
  {
    href: "/family",
    label: "navFamily",
    icon: UsersRound,
    group: "shop",
    flags: ["family"],
  },
  {
    href: "/company",
    label: "navCompany",
    icon: Building2,
    group: "shop",
    flags: ["corporate"],
  },
  // บัญชีและตั้งค่า
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
  { href: "/profile", label: "navProfile", icon: UserRound, group: "account" },
  {
    href: "/verify",
    label: "navVerify",
    icon: ShieldCheck,
    group: "account",
    flags: ["ekyc"],
  },
  { href: "/install", label: "navInstall", icon: Smartphone, group: "account" },
  { href: "/settings", label: "navSettings", icon: Settings, group: "account" },
];

/** Hrefs of the menu entries whose feature switches are all off — shown greyed out and not clickable. */
export function disabledNavHrefs(flags: FlagMap): string[] {
  return NAV.filter(
    (i) => i.flags && i.flags.every((f) => !isEnabled(flags, f)),
  ).map((i) => i.href);
}

/** Bottom bar = first four items + a "More" button. */
export const PRIMARY_NAV_COUNT = 4;
/** Slot (0-based) of the raised centre button in the five-slot bottom bar: today · timeline · [SCAN] · ask · more. */
export const CENTER_SLOT = 2;

export const NAV_GROUPS: readonly {
  id: NavGroup;
  label: Extract<keyof Dict, `navGroup${string}`>;
}[] = [
  { id: "daily", label: "navGroupDaily" },
  { id: "data", label: "navGroupData" },
  { id: "care", label: "navGroupCare" },
  { id: "rewards", label: "navGroupRewards" },
  { id: "shop", label: "navGroupShop" },
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
  | "navNotifications"
  | "navVault"
  | "navGoals"
  | "navLiver"
  | "navTelepharmacy"
  | "navPharmacist";

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
    pattern: /^\/goals\/(new\/[^/]+|[^/]+)$/,
    to: { href: "/goals", label: "navGoals" },
  },
  {
    pattern: /^\/liver\/.+$/,
    to: { href: "/liver", label: "navLiver" },
  },
  {
    pattern: /^\/pharmacist\/consult\/[^/]+$/,
    to: { href: "/pharmacist", label: "navPharmacist" },
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
  vault: { href: "/vault", label: "navVault" },
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
