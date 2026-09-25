import type {Metadata} from 'next';
import Link from 'next/link';

export const metadata:Metadata={title:'Page not found'};

export default function NotFound(){
  return <main style={{minHeight:'80vh',display:'grid',placeItems:'center',padding:30}}>
    <section className="card card-pad" style={{maxWidth:460,textAlign:'center'}}>
      <div className="eyebrow accent" style={{marginBottom:15}}>IRIS WORKSPACE · 404</div>
      <h1 style={{fontSize:25}}>We couldn’t find that page.</h1>
      <p className="secondary" style={{margin:'15px 0 22px'}}>The link may be out of date, or the ticket or view may have moved. Head back to your workspace to carry on.</p>
      <div className="flex-row" style={{justifyContent:'center'}}><Link href="/dashboard" className="btn btn-primary">Open workspace</Link><Link href="/" className="btn">Home</Link></div>
    </section>
  </main>;
}
