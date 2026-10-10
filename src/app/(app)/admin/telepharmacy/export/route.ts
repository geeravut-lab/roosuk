import { NextResponse } from "next/server";
import { getCurrentUser, isAdminUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { csvCell } from "@/lib/telepharmacy/telepharmacy";

export const dynamic = "force-dynamic";

/**
 * The consult report as CSV (admins only). It carries what a report needs — when, how, who
 * served, how long, how it ended — and NOTHING about the patient or what was discussed:
 * no name, no topic, no advice. The export itself is written to the audit log.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !(await isAdminUser(user.id)))
    return new NextResponse(null, { status: 404 });
  if (!(await featureEnabled("telepharmacy")))
    return new NextResponse(null, { status: 404 });
  const db = createAdminClient();
  const { data } = await db
    .from("consults")
    .select(
      "id, mode, status, created_at, scheduled_at, accepted_at, ended_at, duration_sec, end_reason, pharmacist_name, pharmacist_license_no, consent_version",
    )
    .order("created_at", { ascending: false })
    .limit(20000)
    .returns<
      {
        id: string;
        mode: string;
        status: string;
        created_at: string;
        scheduled_at: string | null;
        accepted_at: string | null;
        ended_at: string | null;
        duration_sec: number | null;
        end_reason: string | null;
        pharmacist_name: string | null;
        pharmacist_license_no: string | null;
        consent_version: string;
      }[]
    >();
  const rows = data ?? [];
  const head = [
    "consult_id",
    "mode",
    "status",
    "requested_at",
    "scheduled_at",
    "accepted_at",
    "ended_at",
    "wait_seconds",
    "duration_seconds",
    "end_reason",
    "pharmacist",
    "licence_no",
    "consent_version",
  ];
  const lines = rows.map((r) =>
    [
      r.id,
      r.mode,
      r.status,
      r.created_at,
      r.scheduled_at,
      r.accepted_at,
      r.ended_at,
      r.accepted_at && r.mode === "instant"
        ? Math.max(
            0,
            Math.round(
              (Date.parse(r.accepted_at) - Date.parse(r.created_at)) / 1000,
            ),
          )
        : "",
      r.duration_sec,
      r.end_reason,
      r.pharmacist_name,
      r.pharmacist_license_no,
      r.consent_version,
    ]
      .map(csvCell)
      .join(","),
  );
  await db.from("privacy_audit_log").insert({
    user_id: null,
    action: "consults_exported",
    detail: `${rows.length} rows`,
    meta: { by: user.id },
  });
  return new NextResponse("﻿" + [head.join(","), ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="consults.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
