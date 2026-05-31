import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Header } from "@/components/shell/header";
import { SiteFooter } from "@/components/shell/site-footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://proofs.lilangverse.xyz"),
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
        <SiteFooter />
      </body>
    </html>
  );
}
