import Image from "next/image";

/**
 * Heart mark from the RooSuk logo (transparent PNG generated from
 * docs/RooSuk Logo.jpg by scripts/make-brand-assets.mjs).
 */
export function LogoMark({
  size = 36,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt=""
      width={size}
      height={size}
      priority={priority}
    />
  );
}

export function Wordmark({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-primary-strong text-lg font-bold tracking-tight">
        {name}
      </span>
    </span>
  );
}
