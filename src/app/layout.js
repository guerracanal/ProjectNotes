import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: {
    default: 'ProjectNotes',
    template: '%s · ProjectNotes',
  },
  description:
    'Tu espacio de trabajo local para proyectos, notas, tareas, reuniones y transcripciones — con búsqueda y asistente propios.',
  applicationName: 'ProjectNotes',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'ProjectNotes',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport = {
  themeColor: '#0a0b12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 5,
};

/**
 * Paint the stored theme before first render so a dark-mode user never sees a
 * white flash. Runs synchronously in <head>, ahead of hydration.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('projectnotes:theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <SettingsProvider>
              <SidebarProvider>
                <AppShell>{children}</AppShell>
              </SidebarProvider>
            </SettingsProvider>
          </ToastProvider>
        </ThemeProvider>
        <div id="portal-root" />
      </body>
    </html>
  );
}
