import { Suspense } from "react";
import Footer from "@/components/core/Footer";
import { SITE_SUBTITLE, SITE_TITLE } from "@/components/core/Header";
import { AuthenticatedFeedbackButton } from "@/components/AuthenticatedFeedbackButton";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// https://fonts.google.com/specimen/Roboto
// 100 (Thin), 300 (Light), 400 (Regular), 500 (Medium), 700 (Bold), 800 (ExtraBold), 900 (Black)
const roboto = Roboto({
  weight: ["100", "300", "400", "500", "700", "800", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_SUBTITLE,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_SUBTITLE,
    type: "website",
    locale: "en_US",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#009edb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${roboto.className} antialiased`}>
      <body className="flex min-h-screen flex-col bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:rounded-br focus:bg-un-blue focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        <div id="main-content" className="flex flex-1 flex-col">
          {children}
        </div>
        <Footer />
        <AnimatedLogo />
        <Suspense fallback={null}>
          <AuthenticatedFeedbackButton />
        </Suspense>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            id="umami"
            src={
              process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ||
              "https://cloud.umami.is/script.js"
            }
            strategy="afterInteractive"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            data-domains={process.env.NEXT_PUBLIC_UMAMI_DOMAINS || undefined}
            data-exclude-search="true"
            data-exclude-hash="true"
          />
        )}
      </body>
    </html>
  );
}
