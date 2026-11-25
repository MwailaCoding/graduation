import type { MouseEventHandler, ReactNode } from "react";

type CommonProps = {
  variant?: "forest" | "gold" | "outline" | "banner-link";
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
};

export type ActionLinkButtonProps =
  | (CommonProps & {
      href: string;
      external?: boolean;
      onClick?: MouseEventHandler<HTMLAnchorElement>;
    })
  | (CommonProps & {
      href?: undefined;
      type?: "button" | "submit";
      onClick?: MouseEventHandler<HTMLButtonElement>;
      ariaExpanded?: boolean;
      ariaControls?: string;
      ariaHasPopup?: "dialog";
    });

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 font-sans font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold";

const SIZE_CLASSES: Record<NonNullable<CommonProps["size"]>, string> = {
  sm: "min-h-[38px] px-5 py-1.5 text-sm",
  md: "min-h-[44px] px-7 py-2.5 text-sm sm:text-base",
  lg: "min-h-[48px] px-8 py-3 text-base",
};

const VARIANT_CLASSES: Record<NonNullable<CommonProps["variant"]>, string> = {
  forest:
    "rounded-[10px] border border-forest-green bg-forest-green text-warm-ivory hover:bg-forest-green/90",
  gold:
    "rounded-full border border-[#DFC793]/70 bg-champagne-gold bg-gradient-to-b from-[#D9C08B] to-champagne-gold text-forest-green hover:from-[#E2CA98] hover:to-[#CCA96F]",
  outline:
    "rounded-[10px] border border-champagne-gold bg-warm-ivory text-forest-green hover:bg-warm-sand",
  "banner-link":
    "min-h-[44px] rounded-md text-warm-ivory underline-offset-4 hover:text-champagne-gold hover:underline",
};

export function ActionLinkButton(props: ActionLinkButtonProps) {
  const {
    variant = "forest",
    size = "md",
    className = "",
    ariaLabel,
    children,
  } = props;

  const classes = `${BASE_CLASSES} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`.trim();

  if (typeof props.href === "string") {
    const externalAttrs = props.external
      ? { target: "_blank" as const, rel: "noopener noreferrer" }
      : {};

    return (
      <a
        href={props.href}
        aria-label={ariaLabel}
        onClick={props.onClick}
        className={classes}
        {...externalAttrs}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={props.type ?? "button"}
      aria-label={ariaLabel}
      aria-expanded={props.ariaExpanded}
      aria-controls={props.ariaControls}
      aria-haspopup={props.ariaHasPopup}
      onClick={props.onClick}
      className={classes}
    >
      {children}
    </button>
  );
}
