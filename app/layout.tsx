import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edges",
  description: "A daily geography game about guessing border neighbors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
