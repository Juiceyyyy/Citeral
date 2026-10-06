import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://citeral.vercel.app"),
  applicationName: "Citeral",
  title: { default: "Citeral", template: "%s · Citeral" },
  description: "Evidence-grounded AI assistants for documents, research, study and portfolio analysis.",
  icons: { icon: "/citeral-mark.svg" },
  openGraph: {
    type: "website",
    siteName: "Citeral",
    title: "Citeral",
    description: "Evidence-grounded AI assistants for private documents, curated knowledge and inspectable answers.",
    url: "https://citeral.vercel.app",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Toaster theme="dark" richColors position="bottom-right" />
      </body>
    </html>
  );
}
