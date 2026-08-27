import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

/**
 * Bricolage Grotesque is the only family used across the Figma file
 * (headings, paragraphs, nav labels and the wordmark all reference it).
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Teacher's Toolkit · VedaAI",
  description:
    "Upload a question paper and a student's answer sheet, and map answers to questions with AI feedback.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} h-full antialiased`}>
      <body className="font-veda min-h-full flex flex-col">{children}</body>
    </html>
  );
}
