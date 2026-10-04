import { LoaderCircle } from "lucide-react";

/** The one spinning icon of the app. It carries no text: whoever shows it also says what is happening (aria-busy / a status line). */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden
      className={`${className} shrink-0 animate-spin motion-reduce:animate-none`}
    />
  );
}
