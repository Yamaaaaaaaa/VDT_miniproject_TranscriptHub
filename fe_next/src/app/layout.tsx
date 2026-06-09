import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "TranscriptHub - Hệ Thống Quản Trị",
  description: "Hệ thống quản trị ghi âm, kịch bản chuyển chữ và quản lý cuộc họp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const removeAttr = (el) => {
                  if (el && el.nodeType === 1) {
                    if (el.hasAttribute('bis_skin_checked')) el.removeAttribute('bis_skin_checked');
                    const children = el.querySelectorAll('[bis_skin_checked]');
                    for (let i = 0; i < children.length; i++) children[i].removeAttribute('bis_skin_checked');
                  }
                };
                const observer = new MutationObserver((mutations) => {
                  for (let i = 0; i < mutations.length; i++) {
                    const mutation = mutations[i];
                    if (mutation.type === 'childList') {
                      for (let j = 0; j < mutation.addedNodes.length; j++) removeAttr(mutation.addedNodes[j]);
                    } else if (mutation.type === 'attributes' && mutation.attributeName === 'bis_skin_checked') {
                      if (mutation.target.hasAttribute('bis_skin_checked')) mutation.target.removeAttribute('bis_skin_checked');
                    }
                  }
                });
                observer.observe(document.documentElement, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: ['bis_skin_checked']
                });
              })();
            `
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
