"use client";
import Link from "next/link";
import { type ReactNode } from "react";

interface PremiumGateProps {
  children: ReactNode;
  featureName: string;
}

export function PremiumGate({ children, featureName }: PremiumGateProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm">
        <span className="text-2xl">🔒</span>
        <p className="mt-2 text-sm font-semibold text-gray-800">{featureName}</p>
        <p className="mt-1 text-xs text-gray-500">Available on Premium</p>
        <Link
          href="/upgrade"
          className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Upgrade — $6.99/mo
        </Link>
      </div>
    </div>
  );
}
