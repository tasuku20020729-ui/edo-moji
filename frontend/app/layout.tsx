import "./globals.css";

export const metadata = {
  title: "楷書体ジェネレーター",
  description: "故人の筆跡を再現する楷書体生成システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}