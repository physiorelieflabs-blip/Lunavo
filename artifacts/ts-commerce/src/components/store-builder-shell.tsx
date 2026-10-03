import { useMemo, useState } from 'react';
import { Eye, GripVertical, Monitor, Smartphone, Sparkles, Trash2, Undo2, Redo2, Plus, Save } from 'lucide-react';
import type { StoreSection, StoreSectionType } from '@/lib/assistant-types';

const SECTION_LIBRARY: Array<{type:StoreSectionType;label:string;description:string}> = [
  {type:'announcement',label:'Announcement bar',description:'Promotions, shipping or urgent notices'},
  {type:'header',label:'Header & navigation',description:'Logo, navigation and cart entry'},
  {type:'hero',label:'Hero banner',description:'Headline, story, CTA and imagery'},
  {type:'featured_collection',label:'Featured collection',description:'Curated products'},
  {type:'product_grid',label:'Product grid',description:'Responsive product catalogue'},
  {type:'category_grid',label:'Category grid',description:'Shop by category'},
  {type:'image_with_text',label:'Image + story',description:'Editorial brand storytelling'},
  {type:'video',label:'Video',description:'Campaign or brand video'},
  {type:'testimonials',label:'Testimonials',description:'Customer quotes'},
  {type:'reviews',label:'Reviews',description:'Ratings and verified reviews'},
  {type:'benefits',label:'Trust & benefits',description:'Shipping, returns, support'},
  {type:'faq',label:'FAQ',description:'Common customer questions'},
  {type:'newsletter',label:'Email capture',description:'Grow your audience'},
  {type:'countdown',label:'Countdown',description:'Timed campaigns'},
  {type:'logo_cloud',label:'Logo cloud',description:'Partners or press'},
  {type:'rich_text',label:'Rich text',description:'Flexible content'},
  {type:'spacer',label:'Spacer',description:'Breathing room'},
  {type:'contact',label:'Contact',description:'Customer contact options'},
  {type:'footer',label:'Footer',description:'Links and store information'},
  {type:'policies',label:'Policies',description:'Shipping, returns, privacy and terms'},
  {type:'custom_code',label:'Custom HTML / CSS',description:'Sandboxed markup and styles without JavaScript'},
];

type Props = {
  initialSections: StoreSection[];
  onSave: (sections: StoreSection[]) => Promise<void> | void;
  onGenerateWithAI?: () => Promise<void> | void;
};

export function StoreBuilderShell({ initialSections, onSave, onGenerateWithAI }: Props) {
  const [sections, setSections] = useState(initialSections);
  const [selected, setSelected] = useState(sections[0]?.id ?? '');
  const [history, setHistory] = useState<StoreSection[][]>([]);
  const [future, setFuture] = useState<StoreSection[][]>([]);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const snapshot = () => setHistory((currentHistory) => [...currentHistory, sections]);
  const update = (next: StoreSection[]) => {
    snapshot();
    setSections(next);
    setFuture([]);
  };
  const current = sections.find((section) => section.id === selected);
  const previewSections = useMemo(() => sections.filter((section) => section.visible), [sections]);

  const add = (type: StoreSectionType) => {
    const id = `${type}-${crypto.randomUUID().slice(0, 10)}`;
    update([
      ...sections,
      {
        id,
        type,
        visible: true,
        settings: { title: SECTION_LIBRARY.find((item) => item.type === type)?.label || 'Section' },
      },
    ]);
    setSelected(id);
  };
  const remove = (id: string) => update(sections.filter((section) => section.id !== id));
  const toggle = (id: string) => update(sections.map((section) => section.id === id ? { ...section, visible: !section.visible } : section));
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((currentFuture) => [sections, ...currentFuture]);
    setSections(previous);
    setHistory((currentHistory) => currentHistory.slice(0, -1));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((currentHistory) => [...currentHistory, sections]);
    setSections(next);
    setFuture((currentFuture) => currentFuture.slice(1));
  };
  const reorder = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = sections.findIndex((section) => section.id === sourceId);
    const targetIndex = sections.findIndex((section) => section.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...sections];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved!);
    update(next);
  };

  const applyTemplate = (name: 'editorial'|'conversion'|'minimal') => {
    const prefix = name === 'editorial' ? 'Editorial' : name === 'conversion' ? 'Conversion' : 'Minimal';
    const templates: Record<typeof name, StoreSection[]> = {
      editorial: [
        { id: 'template-announce', type: 'announcement', visible: true, settings: { title: 'Free shipping on qualifying orders' } },
        { id: 'template-header', type: 'header', visible: true, settings: { title: 'Your Store' } },
        { id: 'template-hero', type: 'hero', visible: true, settings: { title: 'A storefront built around your brand', subtitle: 'New collection', body: 'Introduce the value of your products clearly and beautifully.', buttonText: 'Shop now' } },
        { id: 'template-featured', type: 'featured_collection', visible: true, settings: { title: 'Featured products', subtitle: 'Curated for your customers' } },
        { id: 'template-story', type: 'image_with_text', visible: true, settings: { title: 'Why customers choose us', subtitle: 'Our point of view', body: 'Tell the story behind the products and the people who make them.' } },
        { id: 'template-benefits', type: 'benefits', visible: true, settings: { title: 'Shop with confidence' } },
        { id: 'template-newsletter', type: 'newsletter', visible: true, settings: { title: 'Stay in the loop', subtitle: 'New products and offers, without the noise.' } },
        { id: 'template-policies', type: 'policies', visible: true, settings: { title: 'Store policies' } },
        { id: 'template-footer', type: 'footer', visible: true, settings: { title: 'Your Store' } },
      ],
      conversion: [
        { id: 'template-hero', type: 'hero', visible: true, settings: { title: 'Make the next purchase easy', subtitle: 'Shop with confidence', body: 'A focused storefront for discovering your best products quickly.', buttonText: 'Shop now' } },
        { id: 'template-products', type: 'product_grid', visible: true, settings: { title: 'Best sellers', subtitle: 'Popular with customers right now' } },
        { id: 'template-benefits', type: 'benefits', visible: true, settings: { title: 'Why buy from us' } },
        { id: 'template-testimonials', type: 'testimonials', visible: true, settings: { title: 'Customer stories' } },
        { id: 'template-faq', type: 'faq', visible: true, settings: { title: 'Questions, answered' } },
        { id: 'template-footer', type: 'footer', visible: true, settings: { title: 'Your Store' } },
      ],
      minimal: [
        { id: 'template-header', type: 'header', visible: true, settings: { title: 'Your Store' } },
        { id: 'template-hero', type: 'hero', visible: true, settings: { title: 'Simple. Clear. Yours.', body: 'A quiet storefront that puts the product first.', buttonText: 'Browse products' } },
        { id: 'template-products', type: 'product_grid', visible: true, settings: { title: 'Shop' } },
        { id: 'template-rich', type: 'rich_text', visible: true, settings: { title: 'About the brand', body: 'Add your values, process and story here.' } },
        { id: 'template-footer', type: 'footer', visible: true, settings: { title: 'Your Store' } },
      ],
    };
    const next = templates[name].map((section) => ({ ...section, id: `${prefix.toLowerCase()}-${section.id}-${crypto.randomUUID().slice(0, 6)}` }));
    update(next);
    setSelected(next[0]?.id ?? '');
  };

  const updateSetting = (key: string, value: string) => {
    if (!current) return;
    update(sections.map((section) => section.id === current.id ? { ...section, settings: { ...section.settings, [key]: value } } : section));
  };

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[720px] overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#f4f1e9]">
      <aside className="w-[290px] shrink-0 overflow-y-auto border-r border-[#d9d2c4] bg-[#fbfaf6] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Store Builder</p>
            <h2 className="mt-1 font-extrabold">Page structure</h2>
          </div>
          <button type="button" onClick={() => onGenerateWithAI?.()} className="rounded-lg bg-[#182333] p-2 text-white" title="Generate with AI"><Sparkles className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => applyTemplate('editorial')} className="rounded-lg border bg-white px-2.5 py-1.5 text-[10px] font-extrabold">Editorial</button>
          <button type="button" onClick={() => applyTemplate('conversion')} className="rounded-lg border bg-white px-2.5 py-1.5 text-[10px] font-extrabold">Conversion</button>
          <button type="button" onClick={() => applyTemplate('minimal')} className="rounded-lg border bg-white px-2.5 py-1.5 text-[10px] font-extrabold">Minimal</button>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={undo} disabled={!history.length} className="rounded-lg border p-2 disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!future.length} className="rounded-lg border p-2 disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 space-y-2">
          {sections.map((section) => (
            <div key={section.id} draggable onDragStart={() => setDraggingId(section.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingId) reorder(draggingId, section.id); setDraggingId(null); }} onDragEnd={() => setDraggingId(null)} className={`group flex cursor-grab items-center gap-2 rounded-xl border p-3 ${selected === section.id ? 'border-[#315e6c] bg-[#eef7f8]' : 'border-[#e1dbcf] bg-white'}`}>
              <GripVertical className="h-4 w-4 shrink-0 text-[#9ca5ad]" />
              <button type="button" onClick={() => setSelected(section.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-bold">{SECTION_LIBRARY.find((item) => item.type === section.type)?.label || section.type}</p>
                <p className="mt-1 text-[10px] text-[#697687]">{section.visible ? 'Visible' : 'Hidden'}</p>
              </button>
              <button type="button" onClick={() => toggle(section.id)} className="rounded p-1 text-[#697687]" aria-label="Toggle visibility"><Eye className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(section.id)} className="rounded p-1 text-[#697687]" aria-label="Delete section"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#697687]">Add section</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {SECTION_LIBRARY.map((item) => (
              <button type="button" key={item.type} onClick={() => add(item.type)} className="rounded-xl border border-[#ded8cd] bg-white p-3 text-left hover:bg-[#f4f1e9]">
                <Plus className="h-3.5 w-3.5 text-[#a2772e]" />
                <p className="mt-2 text-xs font-extrabold">{item.label}</p>
                <p className="mt-1 text-[9px] leading-4 text-[#697687]">{item.description}</p>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-[#d9d2c4] bg-white px-4">
          <div className="flex items-center gap-1 rounded-lg bg-[#f4f1e9] p-1">
            <button type="button" onClick={() => setDevice('desktop')} className={`rounded-md px-3 py-1.5 ${device === 'desktop' ? 'bg-white shadow-sm' : ''}`}><Monitor className="h-4 w-4" /></button>
            <button type="button" onClick={() => setDevice('mobile')} className={`rounded-md px-3 py-1.5 ${device === 'mobile' ? 'bg-white shadow-sm' : ''}`}><Smartphone className="h-4 w-4" /></button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void onSave(sections)} className="inline-flex items-center gap-2 rounded-lg bg-[#182333] px-4 py-2 text-xs font-extrabold text-white"><Save className="h-3.5 w-3.5" />Save draft</button>
          </div>
        </div>
        <div className="flex h-[calc(100%-56px)] items-start justify-center overflow-auto bg-[#e9e4d9] p-6">
          <div className={device === 'mobile' ? 'w-[390px]' : 'w-full max-w-[1240px]'}>
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
              {previewSections.map((section) => (
                <div key={section.id} className={selected === section.id ? 'ring-2 ring-inset ring-[#315e6c]' : ''} onClick={() => setSelected(section.id)}>
                  <div className="min-h-[100px] p-0">
                    {section.type === 'custom_code' ? (
                      <iframe title="Custom code preview" sandbox="" className="h-[360px] w-full border-0" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif}${String(section.settings.css ?? '')}</style></head><body>${String(section.settings.html ?? '')}</body></html>`} />
                    ) : section.type === 'hero' ? (
                      <div className="grid min-h-[430px] place-items-center bg-[#f5f1e9] p-12 text-center">
                        <div>
                          <p className="text-xs font-mono uppercase tracking-[.18em] text-[#a2772e]">{String(section.settings.subtitle || 'Your brand')}</p>
                          <h1 className="mt-4 text-5xl font-black tracking-[-.06em]">{String(section.settings.title || 'Your storefront')}</h1>
                          <p className="mx-auto mt-4 max-w-xl text-sm text-[#697687]">{String(section.settings.body || 'Tell customers why they should buy from you.')}</p>
                          <span className="mt-6 inline-flex rounded-full bg-[#182333] px-5 py-3 text-xs font-extrabold text-white">{String(section.settings.buttonText || 'Shop now')}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-10">
                        <p className="text-xl font-black">{String(section.settings.title || SECTION_LIBRARY.find((item) => item.type === section.type)?.label || section.type)}</p>
                        {section.type !== 'spacer' && <p className="mt-2 text-sm text-[#697687]">{String(section.settings.subtitle || SECTION_LIBRARY.find((item) => item.type === section.type)?.description || 'Edit this section in the settings panel.')}</p>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <aside className="hidden w-[310px] shrink-0 overflow-y-auto border-l border-[#d9d2c4] bg-[#fbfaf6] p-5 xl:block">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Settings</p>
        {current ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-extrabold">{SECTION_LIBRARY.find((item) => item.type === current.type)?.label || current.type}</p>
              <p className="mt-1 text-xs text-[#697687]">Edit content and visual direction.</p>
            </div>
            {['title', 'subtitle', 'body', 'buttonText', 'imageUrl', 'imageAlt'].map((key) => (
              <label key={key} className="block text-xs font-bold capitalize">
                {key}
                <input value={String(current.settings[key] ?? '')} onChange={(event) => updateSetting(key, event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm font-normal" />
              </label>
            ))}
            {current.type === 'policies' && (
              <div className="space-y-4">
                {['shippingPolicy', 'returnsPolicy', 'privacyPolicy', 'termsPolicy'].map((key) => (
                  <label key={key} className="block text-xs font-bold capitalize">
                    {key.replace('Policy', ' policy')}
                    <textarea value={String(current.settings[key] ?? '')} onChange={(event) => updateSetting(key, event.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                ))}
              </div>
            )}
            {current.type === 'custom_code' && (
              <div className="space-y-4">
                <label className="block text-xs font-bold">HTML
                  <textarea value={String(current.settings.html ?? '')} onChange={(event) => updateSetting('html', event.target.value)} rows={10} className="mt-1 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 py-2 font-mono text-[11px]" placeholder="<div>Your content</div>" />
                </label>
                <label className="block text-xs font-bold">CSS
                  <textarea value={String(current.settings.css ?? '')} onChange={(event) => updateSetting('css', event.target.value)} rows={10} className="mt-1 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 py-2 font-mono text-[11px]" placeholder=".hero { ... }" />
                </label>
                <p className="text-[10px] leading-4 text-[#697687]">JavaScript is not available. The preview uses a sandboxed frame.</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#697687]">Select a section to edit.</p>
        )}
      </aside>
    </div>
  );
}
