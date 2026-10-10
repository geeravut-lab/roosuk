import { Phone, Siren } from "lucide-react";

/**
 * The emergency notice with a one-tap 1669 button. A server-component-safe
 * piece (no hooks) so the questionnaire, the result and the brief all share it.
 * Red marks a genuinely urgent situation only; the button keeps the app's
 * accessible dark-on-coral CTA style.
 */
export function EmergencyCard({
  title,
  body,
  cta,
  callLabel,
}: {
  title: string;
  body: string;
  cta: string;
  callLabel: string;
}) {
  return (
    <section
      role="alert"
      className="border-danger bg-tint-danger space-y-3 rounded-2xl border-2 p-4"
    >
      <h2 className="inline-flex items-center gap-2 text-lg font-bold">
        <Siren className="size-6 shrink-0" aria-hidden />
        {title}
      </h2>
      <p>{body}</p>
      <p className="font-semibold">{cta}</p>
      <a href="tel:1669" className="btn btn-primary w-full">
        <Phone className="size-5" aria-hidden />
        {callLabel}
      </a>
    </section>
  );
}
