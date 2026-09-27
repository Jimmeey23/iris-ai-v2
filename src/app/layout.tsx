import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/ui";
import "./globals.css";
import "./design-system.css";
import "./intake.css";
import "./premium.css";
export const metadata:Metadata={
  title:{default:'IRIS — Physique 57 India Ops Log',template:'%s · IRIS'},
  description:'Internal ticket logging for Physique 57 India studio staff — issues, snags and member feedback, routed and tracked in one workspace.',
  applicationName:'IRIS',
  // Internal tool: keep every page out of search indexes.
  robots:{index:false,follow:false,nocache:true,googleBot:{index:false,follow:false}},
  // Favicon: src/app/icon.svg is picked up by the file convention, which emits the
  // <link rel="icon"> itself (declaring `icons` here too would duplicate it).
};
export const viewport:Viewport={
  themeColor:[{media:'(prefers-color-scheme: dark)',color:'#0a0a0d'},{media:'(prefers-color-scheme: light)',color:'#f4f6fa'}],
  colorScheme:'dark light',
};
/** Runs before first paint. The server markup carries no data-theme (so there is
 *  nothing to mismatch on hydration); this sets it from the saved preference, or on
 *  a first visit from the OS setting, so nobody sees a flash of the wrong theme. */
const THEME_SCRIPT="try{var t=localStorage.getItem('iris-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body suppressHydrationWarning><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
