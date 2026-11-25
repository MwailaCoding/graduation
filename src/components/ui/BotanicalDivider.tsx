export interface BotanicalDividerProps {
  variant?: "heading-rule" | "hairline" | "signature-rule";
  label?: string;
  as?: "h2" | "h3" | "p" | "span";
  headingId?: string;
  tone?: "dark" | "light";
  className?: string;
}

export function BotanicalDivider({
  variant = "heading-rule",
  label,
  as = "h2",
  headingId,
  tone = "dark",
  className = "",
}: BotanicalDividerProps) {
  if (variant === "hairline") {
    return (
      <div
        aria-hidden="true"
        className={`h-px w-full bg-champagne-gold/55 ${className}`.trim()}
      />
    );
  }

  const Tag = as;
  const textToneClass =
    tone === "light" ? "text-warm-ivory" : "text-forest-green";

  if (variant === "signature-rule") {
    return (
      <div
        className={`flex items-center justify-center gap-3 sm:gap-4 ${className}`.trim()}
      >
        <span
          aria-hidden="true"
          className="h-px w-8 shrink-0 bg-champagne-gold/80 sm:w-12"
        />
        {label ? (
          <Tag
            id={headingId}
            className={`text-center ${textToneClass}`}
          >
            {label}
          </Tag>
        ) : null}
        <span
          aria-hidden="true"
          className="h-px w-8 shrink-0 bg-champagne-gold/80 sm:w-12"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center gap-3 sm:gap-5 ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="h-px max-w-[72px] flex-1 bg-champagne-gold/75 sm:max-w-[180px] md:max-w-[240px]"
      />
      {label ? (
        <Tag
          id={headingId}
          className={`text-center font-serif text-[1.625rem] leading-tight tracking-tight italic sm:text-[1.875rem] ${textToneClass}`}
        >
          {label}
        </Tag>
      ) : null}
      <span
        aria-hidden="true"
        className="h-px max-w-[72px] flex-1 bg-champagne-gold/75 sm:max-w-[180px] md:max-w-[240px]"
      />
    </div>
  );
}
