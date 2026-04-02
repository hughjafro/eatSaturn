import { type ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "green" | "amber" | "gray";
}

export function Badge({ children, variant = "gray" }: BadgeProps) {
  const classes = {
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes[variant]}`}
    >
      {children}
    </span>
  );
}
