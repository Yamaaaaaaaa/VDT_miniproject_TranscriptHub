"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface TranscriptDetailLayoutProps {
  children: React.ReactNode;
}

export default function TranscriptDetailLayout({ children }: TranscriptDetailLayoutProps) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
