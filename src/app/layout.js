import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import LayoutContent from "@/components/LayoutContent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'Project Note Agenda',
  description: 'Manage your projects and notes',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SettingsProvider>
          <SidebarProvider>
            <div className="layout">
              <Sidebar />
              <LayoutContent>
                {children}
              </LayoutContent>
            </div>
          </SidebarProvider>
        </SettingsProvider>
        <div id="portal-root"></div>
      </body>
    </html>
  );
}
