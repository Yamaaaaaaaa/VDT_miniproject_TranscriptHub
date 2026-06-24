import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TranscriptHub - Dashboard",
  description: "Hệ thống quản lý người dùng & phân quyền",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-slate-50 text-slate-800"
        suppressHydrationWarning
      >
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
