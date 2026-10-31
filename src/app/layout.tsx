import type {Metadata,Viewport} from 'next';
/* Fonts are self-hosted (Fontsource), not fetched from Google at build time.
 * next/font/google resolves during the build, which made every deploy depend on
 * fonts.googleapis.com being reachable — a deploy fails outright if it is not.
 * These are the same three families, bundled from npm instead. */
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import {AppProvider} from '@/components/ui';
import {FeedbackTab} from '@/components/feedback-tab';
import './tokens.css';
import './globals.css';
import './design-system.css';
import './intake.css';
import './trainers.css';
import './feedback.css';
import './tour.css';
import './premium.css';
import './system.css';
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
  colorScheme:'light dark',
};
/** Runs before first paint. The server markup carries no data-theme (so there is
 *  nothing to mismatch on hydration); this sets it from the saved preference, or on
 *  a first visit the light default, so nobody sees a flash of the wrong theme. */
const THEME_SCRIPT="try{var t=localStorage.getItem('iris-theme');if(t!=='light'&&t!=='dark'){t='light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}";
// The next/font variables sit on <html>, not <body>: globals.css composes --font-display,
// --font-body and --font-mono from them on :root, and at :root a variable set on <body>
// does not exist yet — so those tokens resolved to nothing and every surface fell back.
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:THEME_SCRIPT}}/></head><body suppressHydrationWarning><AppProvider>{children}<FeedbackTab/></AppProvider></body></html>;}
