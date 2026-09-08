export type StoreSectionType = 'announcement'|'header'|'hero'|'featured_collection'|'product_grid'|'category_grid'|'image_with_text'|'video'|'testimonials'|'reviews'|'benefits'|'faq'|'newsletter'|'countdown'|'logo_cloud'|'rich_text'|'spacer'|'contact'|'footer';
export type StoreSection = { id:string; type:StoreSectionType; visible:boolean; settings:Record<string,unknown> };
