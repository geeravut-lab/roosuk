import { fmt, type Dict } from "@/lib/i18n/dict";

/** A product's photos: a swipeable strip (CSS scroll-snap, no script) — the first one is the cover. */
export function Gallery({
  t,
  name,
  images,
}: {
  t: Dict;
  name: string;
  images: string[];
}) {
  if (images.length === 0)
    return (
      <div className="bg-tint-primary text-muted flex aspect-square items-center justify-center rounded-2xl text-sm">
        {t.shopNoPhoto}
      </div>
    );
  return (
    // The strip scrolls sideways, so it must be reachable by keyboard (arrow keys scroll a focused region).
    <div
      tabIndex={0}
      role="region"
      aria-label={name}
      className="focus-visible:outline-active overflow-x-auto rounded-2xl focus-visible:outline-2"
      data-testid="gallery"
    >
      <ul className="flex snap-x snap-mandatory gap-2">
        {images.map((id, i) => (
          <li key={id} className="w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/shop/img/${id}`}
              alt={
                fmt(t.shopPhotoN, { n: i + 1, total: images.length }) +
                ` · ${name}`
              }
              className="aspect-square w-full rounded-2xl bg-white object-contain"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Thumb({
  t,
  name,
  id,
}: {
  t: Dict;
  name: string;
  id: string | null;
}) {
  if (!id)
    return (
      <div className="bg-tint-primary text-muted flex aspect-square w-full items-center justify-center rounded-xl text-xs">
        {t.shopNoPhoto}
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/shop/img/${id}`}
      alt={name}
      className="aspect-square w-full rounded-xl bg-white object-contain"
      loading="lazy"
    />
  );
}
