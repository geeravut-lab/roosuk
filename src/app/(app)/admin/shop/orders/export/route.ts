import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser, getCurrentUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // a spreadsheet must never run a cell: neutralise the leading characters that make it a formula
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The paid orders waiting for one partner, as a CSV the partner can work from (admins only). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !(await isAdminUser(user.id)))
    return new NextResponse(null, { status: 404 });
  const partner = request.nextUrl.searchParams.get("partner") ?? "";
  if (!UUID.test(partner)) return new NextResponse(null, { status: 400 });
  const db = createAdminClient();
  const { data: items } = await db
    .from("shop_order_items")
    .select("order_id, sku, name, qty")
    .eq("partner_id", partner)
    .limit(5000)
    .returns<{ order_id: string; sku: string; name: string; qty: number }[]>();
  const ids = [...new Set((items ?? []).map((i) => i.order_id))];
  const { data: orders } = ids.length
    ? await db
        .from("shop_orders")
        .select(
          "id, order_no, status, ship_name, ship_phone, ship_address, ship_province, ship_postal, note, created_at",
        )
        .in("id", ids)
        .in("status", ["paid", "processing"])
        .order("order_no", { ascending: true })
        .returns<
          {
            id: string;
            order_no: number;
            status: string;
            ship_name: string;
            ship_phone: string;
            ship_address: string;
            ship_province: string;
            ship_postal: string;
            note: string | null;
            created_at: string;
          }[]
        >()
    : { data: [] };
  const byOrder = new Map((orders ?? []).map((o) => [o.id, o]));
  const header = [
    "order_no",
    "status",
    "sku",
    "product",
    "qty",
    "recipient",
    "phone",
    "address",
    "province",
    "postal",
    "note",
  ];
  const lines = [header.join(",")];
  for (const i of items ?? []) {
    const o = byOrder.get(i.order_id);
    if (!o) continue;
    lines.push(
      [
        `RS-${String(o.order_no).padStart(6, "0")}`,
        o.status,
        i.sku,
        i.name,
        i.qty,
        o.ship_name,
        o.ship_phone,
        o.ship_address,
        o.ship_province,
        o.ship_postal,
        o.note,
      ]
        .map(cell)
        .join(","),
    );
  }
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roosuk-partner-orders.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
