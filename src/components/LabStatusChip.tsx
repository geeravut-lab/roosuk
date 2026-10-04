import { CircleCheck, CircleHelp, Eye, TriangleAlert } from "lucide-react";
import type { LabStatus } from "@/lib/lab/lab";
import type { Dict } from "@/lib/i18n/dict";

const STYLE: Record<LabStatus, string> = {
  normal: "border-secondary bg-tint-secondary",
  watch: "border-warn bg-tint-warn",
  abnormal: "border-danger bg-tint-danger",
  unknown: "border-line bg-surface",
};

const ICON = {
  normal: CircleCheck,
  watch: Eye,
  abnormal: TriangleAlert,
  unknown: CircleHelp,
} as const;

/**
 * Status is never colour alone: every state has its own icon and words, with
 * dark text on a light tint (amber = worth watching, red ONLY for abnormal).
 */
export function LabStatusChip({ t, status }: { t: Dict; status: LabStatus }) {
  const Icon = ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-sm font-semibold ${STYLE[status]}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {t[`labStatus_${status}` as const]}
    </span>
  );
}
