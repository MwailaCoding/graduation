import type { ReactNode } from "react";

export interface SectionShellProps {
  id?: string;
  as?: "section" | "div" | "footer";
  ariaLabelledBy?: string;
  ariaLabel?: string;
  surface?: "ivory" | "sand" | "forest";
  textured?: boolean;
  spacing?: "none" | "compact" | "default" | "relaxed";
  maxWidth?: "narrow" | "default" | "wide" | "full";
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}

const SURFACE_CLASSES: Record<NonNullable<SectionShellProps["surface"]>, string> = {
  ivory: "bg-warm-ivory text-forest-green",
  sand: "bg-warm-sand text-forest-green",
  forest: "bg-forest-green text-warm-ivory",
};

const SPACING_CLASSES: Record<NonNullable<SectionShellProps["spacing"]>, string> = {
  none: "",
  compact: "py-6 md:py-8",
  default: "py-8 md:py-12",
  relaxed: "py-10 md:py-14",
};

const WIDTH_CLASSES: Record<
  Exclude<NonNullable<SectionShellProps["maxWidth"]>, "full">,
  string
> = {
  narrow: "max-w-4xl",
  default: "max-w-[1160px]",
  wide: "max-w-6xl",
};

export function SectionShell({
  id,
  as = "section",
  ariaLabelledBy,
  ariaLabel,
  surface = "ivory",
  textured = false,
  spacing = "default",
  maxWidth = "default",
  className = "",
  innerClassName = "",
  children,
}: SectionShellProps) {
  const Tag = as;
  const surfaceClass =
    surface === "ivory" && textured
      ? "paper-texture text-forest-green"
      : SURFACE_CLASSES[surface];

  return (
    <Tag
      id={id}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      className={`relative overflow-x-clip scroll-mt-16 ${surfaceClass} ${SPACING_CLASSES[spacing]} ${className}`.trim()}
    >
      {maxWidth === "full" ? (
        children
      ) : (
        <div
          className={`relative z-10 mx-auto w-full px-5 sm:px-6 md:px-8 lg:px-10 ${WIDTH_CLASSES[maxWidth]} ${innerClassName}`.trim()}
        >
          {children}
        </div>
      )}
    </Tag>
  );
}
