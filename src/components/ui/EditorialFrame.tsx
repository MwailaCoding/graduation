import type { ReactNode } from "react";

export interface EditorialFrameProps {
  variant?: "notched" | "arch" | "card" | "pill";
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}

// Perpendicular inset along a 45° chamfer reduces corner chamfer depth by (2 - sqrt(2)) * d
const CHAMFER_INSET_FACTOR = 2 - Math.SQRT2;
const NOTCH_OUTER_CHAMFER = 13;
const NOTCH_RING_WIDTHS = [2, 2, 1, 2] as const;

function notchedPolygon(chamferPx: number): string {
  const c = `${chamferPx.toFixed(4)}px`;
  return `polygon(${c} 0, calc(100% - ${c}) 0, 100% ${c}, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, ${c} 100%, 0 calc(100% - ${c}), 0 ${c})`;
}

const NOTCH_CLIP_PATHS: readonly [string, string, string, string, string] = [
  notchedPolygon(NOTCH_OUTER_CHAMFER),
  notchedPolygon(NOTCH_OUTER_CHAMFER - CHAMFER_INSET_FACTOR * NOTCH_RING_WIDTHS[0]),
  notchedPolygon(
    NOTCH_OUTER_CHAMFER -
      CHAMFER_INSET_FACTOR * (NOTCH_RING_WIDTHS[0] + NOTCH_RING_WIDTHS[1]),
  ),
  notchedPolygon(
    NOTCH_OUTER_CHAMFER -
      CHAMFER_INSET_FACTOR *
        (NOTCH_RING_WIDTHS[0] + NOTCH_RING_WIDTHS[1] + NOTCH_RING_WIDTHS[2]),
  ),
  notchedPolygon(
    NOTCH_OUTER_CHAMFER -
      CHAMFER_INSET_FACTOR *
        (NOTCH_RING_WIDTHS[0] +
          NOTCH_RING_WIDTHS[1] +
          NOTCH_RING_WIDTHS[2] +
          NOTCH_RING_WIDTHS[3]),
  ),
];

export function EditorialFrame({
  variant = "card",
  className = "",
  innerClassName = "",
  children,
}: EditorialFrameProps) {
  if (variant === "notched") {
    return (
      <div
        className={`relative bg-champagne-gold p-[2px] ${className}`.trim()}
        style={{ clipPath: NOTCH_CLIP_PATHS[0] }}
      >
        <div
          className="h-full w-full bg-warm-ivory p-[2px]"
          style={{ clipPath: NOTCH_CLIP_PATHS[1] }}
        >
          <div
            className="h-full w-full bg-champagne-gold p-px"
            style={{ clipPath: NOTCH_CLIP_PATHS[2] }}
          >
            <div
              className="h-full w-full bg-warm-ivory p-[2px]"
              style={{ clipPath: NOTCH_CLIP_PATHS[3] }}
            >
              <div
                className={`relative h-full w-full overflow-hidden bg-warm-sand/40 ${innerClassName}`.trim()}
                style={{ clipPath: NOTCH_CLIP_PATHS[4] }}
              >
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "arch") {
    return (
      <div
        className={`relative overflow-hidden rounded-t-[50%_38%] rounded-b-none border border-champagne-gold/60 bg-soft-sage/20 ${className}`.trim()}
      >
        {innerClassName ? (
          <div className={`relative h-full w-full ${innerClassName}`.trim()}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    );
  }

  if (variant === "pill") {
    return (
      <div
        className={`rounded-2xl border-[1.5px] border-champagne-gold bg-forest-green text-warm-ivory md:rounded-full ${className}`.trim()}
      >
        {innerClassName ? (
          <div className={innerClassName}>{children}</div>
        ) : (
          children
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-champagne-gold/45 bg-warm-sand/50 ${className}`.trim()}
    >
      {innerClassName ? (
        <div className={`relative h-full w-full ${innerClassName}`.trim()}>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
