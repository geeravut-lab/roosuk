import Image from "next/image";

/**
 * The app's logo. By default the heart mark from the RooSuk logo (transparent PNG generated
 * from docs/RooSuk Logo.jpg by scripts/make-brand-assets.mjs); the admin can replace it
 * at /admin/branding.
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
      // /brand/logo is the admin's logo when one is set, else it sends the browser to the built-in mark
      src="/brand/logo"
      alt=""
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className="object-contain"
      style={{ width: size, height: size }}
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
