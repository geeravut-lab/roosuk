"use client";

import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

export function ComingSoon() {
  const { t } = useI18n();
  return (
    <div className="card flex items-start gap-3">
      <span className="bg-tint-secondary text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-full">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{t.comingSoonTitle}</p>
        <p className="text-muted text-sm">{t.comingSoonBody}</p>
      </div>
    </div>
  );
}
