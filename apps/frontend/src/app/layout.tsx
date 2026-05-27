import type { Metadata, Viewport } from 'next';
import './globals.css';

import { Inter, JetBrains_Mono } from 'next/font/google';

import { Providers } from '@/components/Providers';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/providers/AuthProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'OmniTask AI',
    template: '%s | OmniTask AI',
  },

  description:
    'Enterprise-grade autonomous AI task execution platform with browser automation, agent orchestration, memory systems, and intelligent workflows.',

  keywords: [
    'AI Automation',
    'Autonomous Agents',
    'Task Execution',
    'Browser Automation',
    'AI Operating System',
    'LLM Workflow',
    'Multi-Agent AI',
    'AI Dashboard',
  ],

  authors: [
    {
      name: 'OmniTask AI',
    },
  ],

  creator: 'OmniTask AI',

  metadataBase: new URL('https://omnitask.ai'),

  openGraph: {
    title: 'OmniTask AI',
    description:
      'Autonomous AI agents that plan, execute, monitor, and complete real-world workflows.',

    url: 'https://omnitask.ai',

    siteName: 'OmniTask AI',

    locale: 'en_US',

    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'OmniTask AI',

    description:
      'Enterprise AI orchestration and autonomous task execution platform.',
  },

  icons: {
    icon: [
      {
        url: '/favicon.ico',
      },
      {
        url: '/favicon.svg',
        type: 'image/svg+xml',
      },
    ],

    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="dark"
    >
      <body
        className={`
          ${inter.variable}
          ${mono.variable}
          min-h-screen
          bg-black
          font-sans
          text-white
          antialiased
        `}
      >
        {/* GLOBAL BACKGROUND */}
        <div className="fixed inset-0 -z-50 overflow-hidden">
          {/* GRID */}
          <div className="cyber-grid animate-grid absolute inset-0 opacity-[0.03]" />

          {/* RED GLOW TOP */}
          <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-red-700/20 blur-[140px]" />

          {/* SIDE GLOW */}
          <div className="absolute right-0 top-1/3 h-[300px] w-[300px] rounded-full bg-red-500/10 blur-[120px]" />

          {/* BOTTOM GLOW */}
          <div className="absolute bottom-0 left-0 h-[350px] w-[350px] rounded-full bg-red-900/20 blur-[140px]" />
        </div>

        <Providers>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
          >
            {children}

            <Toaster />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}