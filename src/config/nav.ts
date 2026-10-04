import {
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
    href: "/subscription",
    label: "navSubscription",
    icon: Crown,
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
