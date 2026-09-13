import type {Metadata} from 'next';
import {Outfit,Space_Grotesk,JetBrains_Mono} from 'next/font/google';
import {AppProvider} from '@/components/ui';
import './globals.css';
const outfit=Outfit({subsets:['latin'],variable:'--font-outfit',display:'swap'});
const spaceGrotesk=Space_Grotesk({subsets:['latin'],variable:'--font-space',display:'swap',weight:['500','600','700']});
const jetbrainsMono=JetBrains_Mono({subsets:['latin'],variable:'--font-mono-tech',display:'swap',weight:['400','500','600']});
export const metadata:Metadata={title:'IRIS — Physique 57 India Ops Log',description:'Internal ticket logging for Physique 57 India studio staff — issues, snags and member feedback, routed and tracked in one workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.theme=localStorage.getItem('iris-theme')||'dark'}catch(e){}"}}/></head><body className={outfit.variable+' '+spaceGrotesk.variable+' '+jetbrainsMono.variable}><AppProvider>{children}</AppProvider></body></html>;}
