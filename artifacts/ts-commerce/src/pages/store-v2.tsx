import { StorefrontSection } from '@/components/storefront-section';
import type { StoreSection } from '@/lib/assistant-types';

const defaultSections: StoreSection[] = [
  { id: 'announcement', type: 'announcement', visible: true, settings: { title: 'Free shipping on qualifying orders' } },
  { id: 'header', type: 'header', visible: true, settings: { title: 'Your Store' } },
  { id: 'hero', type: 'hero', visible: true, settings: { title: 'Built around your brand', subtitle: 'New collection', body: 'A polished storefront with your products, your story and your campaigns.', buttonText: 'Shop now' } },
  { id: 'featured', type: 'featured_collection', visible: true, settings: { title: 'Featured products', subtitle: 'Customer favourites' } },
  { id: 'benefits', type: 'benefits', visible: true, settings: {} },
  { id: 'image-text', type: 'image_with_text', visible: true, settings: { title: 'The story behind the store', body: 'Tell customers what makes your brand different.' } },
  { id: 'newsletter', type: 'newsletter', visible: true, settings: { title: 'Join the list', subtitle: 'New products and useful updates.' } },
  { id: 'footer', type: 'footer', visible: true, settings: { title: 'Your Store' } },
];

export function StoreV2Preview({ products = [], sections = defaultSections }: { products?: Array<{ id:number; title:string; imageUrl?:string|null; sellingPrice?:number|null; currency?:string|null }>; sections?: StoreSection[] }) {
  return <div className="min-h-screen bg-white text-[#182333]">{sections.map(section => <StorefrontSection key={section.id} section={section} products={products} />)}</div>;
}
