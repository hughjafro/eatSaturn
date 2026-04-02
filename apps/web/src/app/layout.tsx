import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/components/TRPCProvider";
import { PostHogProvider } from "@/components/PostHogProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CartSpoon — Meal plans built around this week's sales",
  description:
    "Automatically generate weekly meal plans from your grocery store's current deals. Save money, eat well.",
  openGraph: {
    title: "CartSpoon",
    description: "Meal plans built around this week's grocery sales.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[--color-brand-warm]">
        <PostHogProvider>
          <TRPCProvider>{children}</TRPCProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
