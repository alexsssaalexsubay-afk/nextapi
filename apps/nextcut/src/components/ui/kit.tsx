import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<Tone, string> = {
  neutral: "border-nc-border bg-white text-nc-text-secondary",
  accent: "border-nc-accent/25 bg-[#F5F3FF] text-nc-accent",
  success: "border-nc-success/25 bg-nc-success/10 text-nc-success",
  warning: "border-nc-warning/25 bg-nc-warning/10 text-nc-warning",
  danger: "border-nc-error/25 bg-nc-error/10 text-nc-error",
  info: "border-nc-info/25 bg-nc-info/10 text-nc-info",
};

export function Surface({
  children,
  className,
  selected,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "nc-card-safe nc-ui-surface rounded-[16px]",
        selected ? "border-nc-accent ring-2 ring-nc-accent/12" : "border-nc-border",
        interactive && "nc-ui-surface-hover",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("h-full min-h-0 overflow-auto bg-nc-bg px-8 py-7 [scrollbar-gutter:stable]", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[12px] font-semibold uppercase leading-4 tracking-[0.12em] text-nc-accent">{eyebrow}</p>}
        <h1 className="nc-text-safe text-[30px] font-bold leading-[38px] text-nc-text">{title}</h1>
        {subtitle && <p className="nc-text-safe mt-2 max-w-[760px] text-[14px] leading-6 text-nc-text-secondary">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
    </div>
  );
}

export function SectionCard({
  children,
  title,
  subtitle,
  action,
  className,
  contentClassName,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Surface className={cn("overflow-hidden rounded-[20px]", className)}>
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-5 border-b border-nc-border px-6 py-5">
          <div className="min-w-0">
            {title && <h2 className="nc-text-safe text-[18px] font-semibold leading-7 text-nc-text">{title}</h2>}
            {subtitle && <p className="nc-text-safe mt-1 text-[14px] leading-6 text-nc-text-secondary">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("p-6", contentClassName)}>{children}</div>
    </Surface>
  );
}

export function IconFrame({
  children,
  tone = "accent",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border shadow-sm",
        toneStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center justify-center gap-2 overflow-hidden rounded-[12px] text-center font-semibold leading-5 shadow-sm transition-all duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 [&>svg]:shrink-0",
        size === "sm" && "min-h-9 px-3.5 py-1.5 text-[13px]",
        size === "md" && "min-h-11 px-4 py-2 text-[14px]",
        size === "lg" && "min-h-12 px-5 py-2.5 text-[15px]",
        size === "icon" && "h-11 w-11 p-0",
        variant === "primary" && "bg-nc-accent text-white shadow-[0_10px_24px_rgba(109,94,248,0.24)] hover:-translate-y-0.5 hover:bg-nc-accent-hover hover:shadow-[0_14px_34px_rgba(109,94,248,0.30)]",
        variant === "secondary" && "border border-nc-border bg-white text-nc-text hover:-translate-y-0.5 hover:border-nc-border-strong hover:bg-nc-panel hover:shadow-[0_10px_28px_rgba(15,23,42,0.07)]",
        variant === "ghost" && "text-nc-text-secondary hover:bg-nc-panel hover:text-nc-text",
        variant === "danger" && "border border-nc-error/25 bg-nc-error/10 text-nc-error hover:bg-nc-error/15",
        className
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  variant = "secondary",
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "secondary" | "ghost" | "primary" | "danger";
  label: string;
}) {
  return (
    <Button
      {...props}
      aria-label={label}
      title={label}
      variant={variant}
      size="icon"
      className={className}
    >
      {children}
    </Button>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex max-w-full min-h-7 items-center gap-1.5 rounded-[999px] border px-3 py-1 text-[12px] font-semibold leading-4", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <Pill tone={tone} className={cn("min-h-6 px-2.5 py-0.5 text-[11px]", className)}>{children}</Pill>;
}

export function FieldShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-12 min-w-0 items-center gap-3 overflow-hidden rounded-[13px] border border-nc-border bg-white px-4 text-[14px] leading-6 text-nc-text shadow-sm transition-colors focus-within:border-nc-accent focus-within:ring-2 focus-within:ring-nc-accent/10 [&_input]:min-h-9 [&_input]:min-w-0", className)}>
      {children}
    </div>
  );
}

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface className={cn("flex flex-wrap items-center gap-3 rounded-[18px] p-4", className)}>
      {children}
    </Surface>
  );
}

export function FieldLabel({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <span className="text-[13px] font-semibold leading-5 text-nc-text-secondary">{label}</span>
      {children}
      {hint && <span className="text-[12px] leading-5 text-nc-text-tertiary">{hint}</span>}
    </label>
  );
}

export function SelectField({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "min-h-12 min-w-0 w-full truncate rounded-[13px] border border-nc-border bg-white px-4 py-2 text-[14px] font-semibold leading-6 text-nc-text-secondary shadow-sm outline-none transition-colors focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10",
        className
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[20px] border border-dashed border-nc-border bg-white px-8 py-16 text-center", className)}>
      {icon && <IconFrame tone="accent" className="mb-5 h-14 w-14 rounded-[18px]">{icon}</IconFrame>}
      <h3 className="nc-text-safe text-[17px] font-semibold leading-7 text-nc-text">{title}</h3>
      {description && <p className="nc-text-safe mt-2 max-w-[420px] text-[14px] leading-6 text-nc-text-secondary">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function MediaThumb({
  src,
  videoSrc,
  title,
  tone = "accent",
  duration,
  badge,
  fit = "cover",
  className,
}: {
  src?: string;
  videoSrc?: string;
  title?: string;
  tone?: Tone;
  duration?: string;
  badge?: ReactNode;
  fit?: "cover" | "contain";
  className?: string;
}) {
  const gradientByTone: Record<Tone, string> = {
    neutral: "from-slate-100 via-white to-slate-200",
    accent: "from-[#6C4DFF] via-[#8F7AFF] to-[#00D4E0]",
    success: "from-[#22C55E] via-[#4ADE80] to-[#00D4E0]",
    warning: "from-[#F59E0B] via-[#FBBF24] to-[#6C4DFF]",
    danger: "from-[#EF4444] via-[#FB7185] to-[#6C4DFF]",
    info: "from-[#00D4E0] via-[#67E8F9] to-[#6C4DFF]",
  };

  return (
    <div className={cn("nc-media-frame relative aspect-video overflow-hidden rounded-[16px] border border-white/70 bg-gradient-to-br shadow-inner", gradientByTone[tone], className)} data-fit={fit}>
      {src ? (
        <img src={src} alt={title || ""} loading="lazy" decoding="async" />
      ) : videoSrc ? (
        <video src={videoSrc} muted playsInline preload="metadata" />
      ) : (
        <>
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.95) 0 2px, transparent 3px), radial-gradient(circle at 78% 28%, rgba(255,255,255,0.55) 0 1px, transparent 2px)" }} />
          <div className="absolute inset-x-5 bottom-5 top-5 rounded-[14px] border border-white/45 bg-white/18 shadow-[0_16px_46px_rgba(15,23,42,0.20)] backdrop-blur-sm" />
          <div className="absolute left-7 right-7 top-7 h-2 rounded-full bg-white/50" />
          <div className="absolute left-7 right-16 top-12 h-2 rounded-full bg-white/35" />
          <div className="absolute bottom-7 left-7 h-10 w-24 rounded-[12px] bg-white/26" />
          <div className="absolute bottom-8 right-8 flex h-11 w-11 items-center justify-center rounded-full bg-white/88 text-nc-accent shadow-lg">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M7 5.25v9.5L14.5 10 7 5.25Z" />
            </svg>
          </div>
        </>
      )}
      {badge && <div className="absolute left-3 top-3">{badge}</div>}
      {duration && <div className="absolute bottom-3 right-3 rounded-[999px] bg-nc-text/70 px-2.5 py-1 font-mono text-[12px] font-semibold leading-4 text-white backdrop-blur-md">{duration}</div>}
      {title && <div className="sr-only">{title}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  helper,
  icon,
  tone = "accent",
}: {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Surface interactive className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="nc-text-safe text-[13px] font-semibold leading-5 text-nc-text-tertiary">{label}</p>
          <p className="nc-text-safe mt-2 text-[26px] font-bold leading-8 text-nc-text">{value}</p>
          {helper && <p className="nc-text-safe mt-2 text-[13px] leading-5 text-nc-text-secondary">{helper}</p>}
        </div>
        {icon && <IconFrame tone={tone} className="h-10 w-10 rounded-[12px]">{icon}</IconFrame>}
      </div>
    </Surface>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="nc-text-safe text-[18px] font-semibold leading-7 text-nc-text">{title}</h2>
        {subtitle && <p className="nc-text-safe mt-1 text-[14px] leading-6 text-nc-text-secondary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full items-center overflow-hidden rounded-[13px] border border-nc-border bg-nc-bg p-1 shadow-inner", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-9 min-w-0 rounded-[10px] px-4 text-[13px] font-semibold leading-5 transition-all",
            value === option.value ? "bg-white text-nc-accent shadow-sm ring-1 ring-nc-accent/12" : "text-nc-text-tertiary hover:text-nc-text-secondary"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
