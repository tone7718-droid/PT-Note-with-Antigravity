import type { Metadata } from "next";
// Pretendard 가변 폰트 (한글) — dynamic subset 을 번들에 포함해 셀프호스팅.
// assetPrefix './' 정적 export 라 Electron file:// 오프라인에서도 동일 렌더링.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/themeScript";

export const metadata: Metadata = {
  title: "PT Progress Note - Premium",
  description: "Next-generation Electronic Medical Record for Physical Therapy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* hydration 전에 html.dark 미리 붙여 테마 FOUC 차단 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
