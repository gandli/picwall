import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PicWall · photo wall",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased text-ink bg-paper min-h-screen dark:bg-dark-bg dark:text-dark-text">{children}</body>
    </html>
  );
}
