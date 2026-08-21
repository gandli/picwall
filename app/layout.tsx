import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "PicWall · photo wall",
  description: "拖照片进浏览器，散落成一张张拍立得卡片 — 本地照片墙。Drag photos anywhere, they scatter as polaroids.",
  openGraph: {
    title: "PicWall · photo wall",
    description: "本地拍立得照片墙 — 拖拽、摆放、删除，随意排列你的回忆。",
    type: "website",
  },
};

// Prevent FOUC: apply .dark/.light before React hydrates
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('picwall.theme');
    var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme:dark)').matches);
    document.documentElement.classList.toggle('dark', d);
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased text-ink bg-paper min-h-screen dark:bg-dark-bg dark:text-dark-text">{children}</body>
    </html>
  );
}