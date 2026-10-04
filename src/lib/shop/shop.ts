/**
 * Orders and money, the pure side. The database prices every order itself (this
 * mirrors its rules so the cart can show what checkout will do), and a person's
 * address is checked here before it is ever sent.
 */
export interface ShopSettings {
  shippingThb: number;
  /** a subtotal at or above this ships free; 0 = never */
  freeShippingFromThb: number;
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  shippingThb: 50,
  freeShippingFromThb: 500,
};

export function shippingFor(subtotal: number, s: ShopSettings): number {
  return s.freeShippingFromThb > 0 && subtotal >= s.freeShippingFromThb
    ? 0
    : Math.max(0, s.shippingThb);
}

/** Credit one order may use: the lowest of the balance, the admin's per-use cap and what is owed. Never negative. */
export function shopCredit(a: {
  subtotal: number;
  shipping: number;
  balance: number;
  maxPerUse: number;
}): number {
  const d = Math.min(
    Math.floor(a.balance),
    Math.floor(a.maxPerUse),
    a.subtotal + a.shipping,
  );
  return Number.isFinite(d) && d > 0 ? d : 0;
}

export interface Totals {
  subtotal: number;
  shipping: number;
  credit: number;
  total: number;
}

export function orderTotals(
  lines: readonly { price: number; qty: number }[],
  s: ShopSettings,
  credit: { use: boolean; balance: number; maxPerUse: number },
): Totals {
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const shipping = lines.length ? shippingFor(subtotal, s) : 0;
  const c = credit.use
    ? shopCredit({
        subtotal,
        shipping,
        balance: credit.balance,
        maxPerUse: credit.maxPerUse,
      })
    : 0;
  return { subtotal, shipping, credit: c, total: subtotal + shipping - c };
}

export const MAX_QTY = 10;
export const MAX_CART_LINES = 20;

export function clampQty(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_QTY ? n : null;
}

export interface ShipTo {
  name: string;
  phone: string;
  address: string;
  province: string;
  postal: string;
  note: string;
}

export type ShipField = keyof ShipTo;

const one = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** A Thai delivery address: a phone with 9–10 digits (+66 allowed), a 5-digit postal code. */
export function parseShipTo(
  get: (k: string) => unknown,
): { ok: true; value: ShipTo } | { ok: false; fields: ShipField[] } {
  const name = one(get("name"), 80);
  const rawPhone = one(get("phone"), 20);
  const digits = rawPhone.replace(/[\s\-().]/g, "").replace(/^\+66/, "0");
  const address = one(get("address"), 300);
  const province = one(get("province"), 60);
  const postal = one(get("postal"), 5);
  const note = one(get("note"), 300);
  const bad: ShipField[] = [];
  if (!name) bad.push("name");
  if (!/^0\d{8,9}$/.test(digits)) bad.push("phone");
  if (!address) bad.push("address");
  if (!province) bad.push("province");
  if (!/^\d{5}$/.test(postal)) bad.push("postal");
  if (bad.length) return { ok: false, fields: bad };
  return {
    ok: true,
    value: { name, phone: digits, address, province, postal, note },
  };
}

// ── order status ────────────────────────────────────────────────────────────
export const ORDER_STATUSES = [
  "pending_payment",
  "payment_reported",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(v: unknown): v is OrderStatus {
  return (
    typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v)
  );
}

/** A person may say "I have paid" only before the shop has looked at it. */
export const canReportPayment = (s: OrderStatus) => s === "pending_payment";
/** …and may cancel only before it is paid. */
export const canUserCancel = (s: OrderStatus) =>
  s === "pending_payment" || s === "payment_reported";
export const canAdminCancel = (s: OrderStatus) =>
  s !== "cancelled" && s !== "shipped" && s !== "delivered";

/** The one next step an admin takes from each status, and the statuses it may start from. */
export const ADMIN_STEPS = {
  confirm_paid: { from: ["pending_payment", "payment_reported"], to: "paid" },
  reject_payment: { from: ["payment_reported"], to: "pending_payment" },
  send_to_partner: { from: ["paid"], to: "processing" },
  ship: { from: ["paid", "processing"], to: "shipped" },
  deliver: { from: ["shipped"], to: "delivered" },
} as const satisfies Record<
  string,
  { from: readonly OrderStatus[]; to: OrderStatus }
>;
export type AdminStep = keyof typeof ADMIN_STEPS;

export function isAdminStep(v: unknown): v is AdminStep {
  return typeof v === "string" && v in ADMIN_STEPS;
}

export function stepsFor(status: OrderStatus): AdminStep[] {
  return (Object.keys(ADMIN_STEPS) as AdminStep[]).filter((k) =>
    (ADMIN_STEPS[k].from as readonly string[]).includes(status),
  );
}

export function orderLabel(orderNo: number | string): string {
  return `RS-${String(orderNo).padStart(6, "0")}`;
}
