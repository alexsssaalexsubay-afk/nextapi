import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-100",
      "placeholder:text-zinc-500",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
