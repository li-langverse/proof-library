import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/shell/header";

export const metadata: Metadata = {
  title: "Li Proof Library",
  description: "Lemma and axiom catalog — catalog opinion vs Lean scan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
