import { EucalyptusBranch } from "./Botanical";

export function ItemImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-eucalyptus-soft text-eucalyptus-deep ${className}`} aria-hidden="true">
        <EucalyptusBranch className="h-3/4 opacity-60" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`bg-white object-contain ${className}`}
    />
  );
}
