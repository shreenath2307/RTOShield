import type { Metadata } from "next";
import { Inter, Cormorant } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shell/providers";
import { PageLoader } from "@/components/shell/page-loader";

const sans = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-sans", display: "swap" });
const display = Cormorant({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "RTO Shield — RTO risk scoring for D2C sellers",
  description: "Score every COD order for return-to-origin risk before dispatch, act only on the risky ones, and measure the money saved.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-white font-sans text-ink">
        <PageLoader />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
