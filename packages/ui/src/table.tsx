import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export function Table({ className, ...p }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto rounded-lg border border-zinc-800">
      <table className={cn("w-full text-sm", className)} {...p} />
    </div>
  );
}

export function THead({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-zinc-900/60 text-zinc-400", className)}
      {...p}
    />
  );
}

export function TBody({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-zinc-800", className)} {...p} />;
}

export function TR({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("hover:bg-zinc-900/40 transition-colors", className)}
      {...p}
    />
  );
}

export function TH({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-2 text-left text-xs font-medium uppercase tracking-wider",
        className,
      )}
      {...p}
    />
  );
}

export function TD({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-zinc-200", className)} {...p} />;
}
