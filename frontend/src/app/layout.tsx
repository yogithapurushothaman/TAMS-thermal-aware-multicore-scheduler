import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T.A.M.S. - Thermal-Aware Multicore Scheduler Dashboard",
  description: "Playful Enterprise 2D CPU Scheduler Simulation Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#FAF9F6] text-slate-800 min-h-screen font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
        {children}
      </body>
    </html>
  );
}
