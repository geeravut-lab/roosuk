import type { ReactNode } from "react";
import type { Dict } from "@/lib/i18n/dict";

export interface SourceFileRef {
  id: string;
  mime: string;
}

/**
 * The original photo/PDF a result was read from, when the user chose to keep
 * it. Images come through /api/files/[id] (decrypted for the owner only);
 * a PDF opens in a new tab. `children` is the delete form.
 */
export function SourceFileCard({
  t,
  file,
  children,
}: {
  t: Dict;
  file: SourceFileRef | null;
  children: ReactNode;
}) {
  if (!file) return null;
  const href = `/api/files/${file.id}`;
  return (
    <section className="card space-y-2" aria-labelledby={`src-${file.id}`}>
      <h2 id={`src-${file.id}`} className="font-semibold">
        {t.sourceFileTitle}
      </h2>
      {file.mime === "application/pdf" ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary w-full"
        >
          {t.sourceFileOpenPdf}
        </a>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={href}
          alt={t.sourceFileImageAlt}
          className="mx-auto max-h-96 w-full rounded-2xl object-contain"
        />
      )}
      <p className="text-muted text-sm">{t.sourceFileNote}</p>
      {children}
    </section>
  );
}
