import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PicWall · photo wall",
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased text-ink bg-paper min-h-screen dark:bg-dark-bg dark:text-dark-text">{children}</body>
    </html>
  );
}