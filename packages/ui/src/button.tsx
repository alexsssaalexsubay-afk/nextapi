import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

type Variant = "default" | "secondary" | "destructive" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  default:
    "bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:ring-violet-500/40",
  secondary:
    "border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 focus-visible:ring-zinc-500/40",
  destructive:
    "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500/40",
  ghost:
    "text-zinc-300 hover:bg-zinc-800/60 focus-visible:ring-zinc-500/40",
  outline:
    "border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800/60 focus-visible:ring-zinc-500/40",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
