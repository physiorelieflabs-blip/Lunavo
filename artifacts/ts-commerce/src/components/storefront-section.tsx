import { Link } from 'wouter';
import type { StoreSection } from '@/lib/assistant-types';

type ProductCard = { id: number; title: string; imageUrl?: string | null; sellingPrice?: number | null; price?: number | string | null; currency?: string | null };
type Theme = { accentColor?: string; backgroundColor?: string; textColor?: string; layout?: string; showLunavoBranding?: boolean };
type Props = { section: StoreSection; products?: ProductCard[]; merchantKey?: string; theme?: Theme };

export function StorefrontSection({ section, products = [], merchantKey = '', theme = {} }: Props) {
  if (!section.visible) return null;
  const s = section.settings;
  const title = typeof s.title === 'string' ? s.title : '';
  const subtitle = typeof s.subtitle === 'string' ? s.subtitle : '';
  const body = typeof s.body === 'string' ? s.body : '';
  const imageUrl = typeof s.imageUrl === 'string' ? s.imageUrl : '';
  const imageAlt = typeof s.imageAlt === 'string' ? s.imageAlt : '';
  const buttonText = typeof s.buttonText === 'string' ? s.buttonText : 'Shop now';
  const accent = theme.accentColor || '#c85d3f';
  const text = theme.textColor || '#182333';
  const background = theme.backgroundColor || '#f5f1e8';
  const price = (product: ProductCard) => product.sellingPrice ?? product.price ?? '';

  const productCards = products.slice(0, 12).map((product) => (
    <article key={product.id} className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className="aspect-square overflow-hidden bg-black/5">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="h-full w-full" />}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-bold">{product.title}</h3>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-mono text-sm font-bold">{price(product)} {product.currency ?? ''}</p>
          {merchantKey && <Link href={"/checkout/" + merchantKey + "?productId=" + product.id} className="rounded-lg px-3 py-2 text-xs font-extrabold text-white" style={{ backgroundColor: accent }}>View & order</Link>}
        </div>
      </div>
    </article>
  ));

  switch (section.type) {
    case 'announcement':
      return <div className="px-4 py-2 text-center text-xs font-semibold text-white" style={{ backgroundColor: text }}>{title || body || 'Welcome to our store'}</div>;
    case 'header':
      return <header className="sticky top-0 z-20 border-b border-[#e7e1d6] bg-white/95 px-5 py-4 backdrop-blur"><div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6"><strong className="text-xl font-black tracking-[-.04em]">{title || 'Your Store'}</strong><nav className="hidden gap-5 text-sm font-semibold md:flex"><a href="#shop">Shop</a><a href="#about">About</a><a href="#contact">Contact</a></nav><a href="#shop" className="rounded-full px-4 py-2 text-xs font-bold text-white" style={{ backgroundColor: accent }}>Shop</a></div></header>;
    case 'hero':
      return <section className="relative overflow-hidden" style={{ backgroundColor: background }}><div className="mx-auto grid max-w-[1280px] items-center gap-10 px-6 py-16 md:grid-cols-2 md:px-10 lg:py-24"><div><p className="font-mono text-[10px] uppercase tracking-[.2em]" style={{ color: accent }}>{subtitle || 'Discover something worth keeping'}</p><h1 className="mt-4 max-w-xl text-4xl font-black leading-[.96] tracking-[-.065em] md:text-6xl" style={{ color: text }}>{title || 'A storefront built around your brand.'}</h1><p className="mt-5 max-w-lg text-base leading-7 text-[#5d6670]">{body || 'Beautiful products, clear value, and a frictionless buying experience.'}</p><a href="#shop" className="mt-7 inline-flex rounded-full px-6 py-3 text-sm font-extrabold text-white" style={{ backgroundColor: accent }}>{buttonText}</a></div>{imageUrl?<img src={imageUrl} alt={imageAlt} className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-2xl"/>:<div className="aspect-[4/3] rounded-[2rem] bg-[#ded7c9]"/>}</div></section>;
    case 'featured_collection':
    case 'product_grid':
    case 'products':
      return <section id="shop" className="mx-auto max-w-[1280px] px-6 py-14 md:px-10"><div className="max-w-2xl"><h2 className="text-3xl font-black tracking-[-.05em]" style={{ color: text }}>{title || 'Featured products'}</h2><p className="mt-2 text-sm leading-6 text-[#697687]">{subtitle || body || 'Shop the collection.'}</p></div><div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{productCards}</div></section>;
    case 'category_grid':
      return <section className="mx-auto max-w-[1280px] px-6 py-14 md:px-10"><h2 className="text-3xl font-black" style={{ color: text }}>{title || 'Shop by category'}</h2><p className="mt-2 text-sm text-[#697687]">{subtitle || body}</p><div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3">{['New arrivals','Best sellers','Collections'].map((item)=><a key={item} href="#shop" className="rounded-2xl border p-8 text-center text-sm font-extrabold" style={{ borderColor: accent + '44', backgroundColor: accent + '0d' }}>{item}</a>)}</div></section>;
    case 'image_with_text':
      return <section id="about" className="mx-auto grid max-w-[1280px] gap-10 px-6 py-14 md:grid-cols-2 md:px-10"><div className="overflow-hidden rounded-[2rem] bg-[#ede8de]">{imageUrl&&<img src={imageUrl} alt={imageAlt} className="h-full min-h-[360px] w-full object-cover"/>}</div><div className="self-center"><p className="font-mono text-[10px] uppercase tracking-[.18em]" style={{ color: accent }}>{subtitle}</p><h2 className="mt-3 text-3xl font-black tracking-[-.05em]" style={{ color: text }}>{title || 'Why customers choose us'}</h2><p className="mt-4 text-sm leading-7 text-[#697687]">{body}</p></div></section>;
    case 'video':
      return <section className="mx-auto max-w-[1280px] px-6 py-14 md:px-10"><div className="overflow-hidden rounded-[2rem] bg-black">{typeof s.videoUrl === 'string' && s.videoUrl ? <video controls poster={imageUrl || undefined} className="aspect-video w-full"><source src={String(s.videoUrl)} /></video> : <div className="grid aspect-video place-items-center text-sm text-white/70">Add a video URL in section settings.</div>}</div></section>;
    case 'testimonials':
      return <section className="mx-auto max-w-[1280px] px-6 py-14 md:px-10"><h2 className="text-3xl font-black" style={{ color: text }}>{title || 'Customer stories'}</h2><div className="mt-7 grid gap-4 md:grid-cols-3">{['Great experience from start to finish.','Beautiful products and fast delivery.','The store made choosing easy.'].map((quote)=><blockquote key={quote} className="rounded-2xl border bg-white p-6 text-sm leading-6 text-[#536174]">“{quote}”</blockquote>)}</div></section>;
    case 'reviews':
      return <section className="mx-auto max-w-[1280px] px-6 py-14 md:px-10"><h2 className="text-3xl font-black" style={{ color: text }}>{title || 'Reviews'}</h2><div className="mt-7 flex flex-wrap gap-3"><span className="rounded-full px-4 py-2 text-sm font-extrabold" style={{ backgroundColor: accent + '16', color: text }}>★★★★★ Verified customer rating</span>{subtitle&&<span className="py-2 text-sm text-[#697687]">{subtitle}</span>}</div></section>;
    case 'benefits':
      return <section className="border-y border-[#e7e1d6] bg-[#fbfaf6] px-6 py-10"><div className="mx-auto grid max-w-[1280px] gap-4 sm:grid-cols-3">{['Secure checkout','Fast fulfilment','Human support'].map(v=><div key={v} className="rounded-2xl bg-white p-5 text-center shadow-sm"><p className="text-sm font-extrabold">{v}</p></div>)}</div></section>;
    case 'faq':
      return <section className="mx-auto max-w-[900px] px-6 py-14"><h2 className="text-3xl font-black" style={{ color: text }}>{title || 'Questions, answered'}</h2><div className="mt-6 divide-y rounded-2xl border bg-white">{['What are your delivery times?','What is your returns policy?','How can I contact support?'].map(q=><details key={q} className="p-5"><summary className="cursor-pointer text-sm font-bold">{q}</summary><p className="mt-3 text-sm leading-6 text-[#697687]">{body || 'Add the answer in your section settings.'}</p></details>)}</div></section>;
    case 'newsletter':
      return <section className="mx-auto max-w-[900px] px-6 py-16 text-center"><h2 className="text-3xl font-black" style={{ color: text }}>{title || 'Stay in the loop'}</h2><p className="mt-2 text-sm text-[#697687]">{subtitle || body || 'Get new products and offers.'}</p><div className="mx-auto mt-6 flex max-w-lg gap-2"><input className="h-12 min-w-0 flex-1 rounded-full border border-[#d9d2c4] px-5" placeholder="Email address"/><button className="rounded-full px-5 text-sm font-bold text-white" style={{ backgroundColor: accent }}>Subscribe</button></div></section>;
    case 'countdown':
      return <section className="mx-auto max-w-[900px] px-6 py-12 text-center"><p className="font-mono text-[10px] uppercase tracking-[.18em]" style={{ color: accent }}>Limited time</p><h2 className="mt-2 text-3xl font-black" style={{ color: text }}>{title || 'Offer ends soon'}</h2><p className="mt-2 text-sm text-[#697687]">{body || 'Set the campaign end time in your promotion tooling.'}</p></section>;
    case 'logo_cloud':
      return <section className="border-y px-6 py-10"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-8 text-sm font-black uppercase tracking-[.16em] text-[#7c8490]">{['Partner','Featured','Trusted','Press'].map(item=><span key={item}>{item}</span>)}</div></section>;
    case 'rich_text':
      return <section className="mx-auto max-w-[900px] px-6 py-14"><h2 className="text-3xl font-black" style={{ color: text }}>{title}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#697687]">{body || subtitle}</p></section>;
    case 'spacer':
      return <div style={{ height: Math.min(Math.max(Number(s.height ?? 80), 20), 320) }} aria-hidden="true" />;
    case 'contact':
      return <section id="contact" className="mx-auto max-w-[900px] px-6 py-14"><h2 className="text-3xl font-black" style={{ color: text }}>{title || 'Contact us'}</h2><p className="mt-3 text-sm leading-7 text-[#697687]">{body || 'Questions about an order or product?'}</p></section>;
    case 'policies': {
      const policies = [
        ['Shipping policy', s.shippingPolicy],
        ['Returns policy', s.returnsPolicy],
        ['Privacy policy', s.privacyPolicy],
        ['Terms of service', s.termsPolicy],
      ] as const;
      return <section className="mx-auto max-w-[1100px] px-6 py-14"><h2 className="text-3xl font-black" style={{ color: text }}>{title || 'Store policies'}</h2><div className="mt-7 grid gap-4 md:grid-cols-2">{policies.map(([label, value]) => <details key={label} className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer text-sm font-extrabold">{label}</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#697687]">{typeof value === 'string' && value.trim() ? value : 'No policy has been published for this section yet.'}</p></details>)}</div></section>;
    }
    case 'footer':
      return <footer id="contact" className="bg-[#182333] px-6 py-12 text-white"><div className="mx-auto max-w-[1280px]"><strong className="text-xl">{title || 'Your Store'}</strong><p className="mt-2 max-w-md text-sm leading-6 text-[#b9c1ca]">{subtitle || body || 'Built with Lunavo.'}</p>{theme.showLunavoBranding !== false && <p className="mt-4 text-[11px] text-[#8f99a6]">Powered by <a href="/" className="font-bold underline">Lunavo</a></p>}</div></footer>;
    case 'custom_code': {
      const html = typeof s.html === 'string' ? s.html : '';
      const css = typeof s.css === 'string' ? s.css : '';
      const srcDoc = [
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'">',
        '<style>body{margin:0;font-family:system-ui,sans-serif;color:', text, ';background:', background, '}', css, '</style></head><body>',
        html,
        '</body></html>',
      ].join('');
      return <iframe title={title || 'Custom storefront content'} sandbox="" loading="lazy" className="h-[360px] w-full border-0" srcDoc={srcDoc} />;
    }
    default:
      return <section className="mx-auto max-w-[1280px] px-6 py-12"><h2 className="text-2xl font-black" style={{ color: text }}>{title}</h2>{subtitle&&<p className="mt-2 text-sm text-[#697687]">{subtitle}</p>}</section>;
  }
}
