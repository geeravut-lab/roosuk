"use client";

import { Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

/** "Save as PDF" is the browser's own print dialog: nothing is rendered or kept on our side. */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="btn btn-secondary print:hidden"
      onClick={() => window.print()}
    >
      <Printer className="size-4" aria-hidden />
      {t.passportPrint}
    </button>
  );
}
