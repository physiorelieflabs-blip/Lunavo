import type { ImportedSupplierProduct } from "./public-supplier";
import { completeLocalVisionJson, selfHostedAiConfigured } from "./self-hosted-ai";
import { completeLunavoBrain } from "./ai-provider";

type Structured = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  brand?: unknown;
  specifications?: unknown;
  variants?: unknown;
  shippingInformation?: unknown;
  attributes?: unknown;
  evidence?: unknown;
};

function cleanString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function cleanRecord(value: unknown, maxEntries = 30): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const k = cleanString(key, 120);
        const v = cleanString(item, 500);
        return k && v ? [k, v] : null;
      })
      .filter((item): item is [string, string] => Boolean(item))
      .slice(0, maxEntries),
  );
}

function cleanVariants(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of ["name", "sku", "color", "size", "material"]) {
      const v = cleanString(source[key], 160);
      if (v) out[key] = v;
    }
    return Object.keys(out).length ? [out] : [];
  });
}

function parseJson(content: string): Structured {
  const normalized = content.trim().replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/i, "");
  const value = JSON.parse(normalized) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Supplier AI returned invalid structured data");
  return value as Structured;
}

function evidencePayload(product: ImportedSupplierProduct): string {
  return JSON.stringify({
    sourceUrl: product.sourceUrl,
    sourceDomain: product.sourceDomain,
    extractedTitle: product.title,
    extractedDescription: product.description,
    sourcePrice: product.price,
    sourceSalePrice: product.salePrice,
    sourceCurrency: product.currency,
    sourceSku: product.sku,
    sourceProductId: product.sourceProductId,
    extractedVariants: product.variants,
    extractedAttributes: product.attributes,
    extractedAvailability: product.availability,
    extractedQuantity: product.availabilityQuantity,
    extractedCategory: product.category,
    extractedSpecifications: product.specifications,
    extractedBrand: product.brand,
    extractedShippingInformation: product.shippingInformation,
  });
}

function merge(product: ImportedSupplierProduct, ai: Structured, model: string, mode: "text" | "vision", profile?: string): ImportedSupplierProduct {
  const title = cleanString(ai.title, 300);
  const description = cleanString(ai.description, 2000);
  const category = cleanString(ai.category, 160);
  const brand = cleanString(ai.brand, 160);
  const specifications = cleanRecord(ai.specifications);
  const attributes = cleanRecord(ai.attributes, 20);
  const variants = cleanVariants(ai.variants);
  const shippingInformation = ai.shippingInformation && typeof ai.shippingInformation === "object" && !Array.isArray(ai.shippingInformation)
    ? ai.shippingInformation as Record<string, unknown>
    : null;
  const fieldCandidates: Array<[string, boolean]> = [
    ["title", !product.title && Boolean(title)],
    ["description", !product.description && Boolean(description)],
    ["category", !product.category && Boolean(category)],
    ["brand", !product.brand && Boolean(brand)],
    ["specifications", Object.keys(product.specifications).length === 0 && Object.keys(specifications).length > 0],
    ["attributes", Object.keys(product.attributes).length === 0 && Object.keys(attributes).length > 0],
    ["variants", product.variants.length === 0 && variants.length > 0],
    ["shippingInformation", !product.shippingInformation && Boolean(shippingInformation)],
  ];
  const generatedFields = fieldCandidates.filter(([, generated]) => generated).map(([field]) => field);
  return {
    ...product,
    title: product.title || title || product.title,
    description: product.description || description || null,
    category: product.category || category || null,
    brand: product.brand || brand || null,
    specifications: Object.keys(product.specifications).length ? product.specifications : specifications,
    attributes: Object.keys(product.attributes).length ? product.attributes : attributes,
    variants: product.variants.length ? product.variants : variants,
    shippingInformation: product.shippingInformation || shippingInformation,
    sourceMetadata: {
      ...product.sourceMetadata,
      aiEnrichment: {
        enabled: true,
        provider: "self-hosted-local",
        model,
        profile: profile ?? null,
        mode,
        generatedAt: new Date().toISOString(),
        sourceContext: {
          sourceUrl: product.sourceUrl,
          sourceDomain: product.sourceDomain,
          sourceFieldsRemainAuthoritative: ["price", "salePrice", "currency", "availability", "availabilityQuantity"],
        },
        provenance: {
          source: "supplier_public_page",
          extracted: "structured/public supplier content",
          generated: generatedFields,
          inferred: [],
          recommended: [],
        },
        fieldsOnlyWhenSourceMissing: true,
        evidence: cleanRecord(ai.evidence, 20),
      },
    },
  };
}

export async function enrichSupplierProduct(product: ImportedSupplierProduct): Promise<ImportedSupplierProduct> {
  if (!selfHostedAiConfigured()) return product;
  const prompt = [
    "You are Lunavo Supplier Intelligence.",
    "Analyze ONLY the supplied evidence. Never invent a product specification, variant, shipping promise, certification, price, discount, stock quantity, brand, or capability.",
    "Return JSON with keys: title, description, category, brand, specifications, variants, shippingInformation, attributes, evidence.",
    "For every field that cannot be supported by the evidence, return null or an empty object/array.",
    "Do not change or infer pricing. The source parser is authoritative for price, salePrice, currency, availability and quantity.",
    "Title and description may be cleaned for ecommerce readability, but must not add claims not supported by the evidence.",
    "Variants must contain only visually or textually supported variant names/SKUs/options.",
    "Shipping information must be a factual extraction only; do not estimate delivery times or costs.",
    evidencePayload(product),
  ].join("\n");

  try {
    const response = await completeLunavoBrain(
      "Enrich this supplier product from public evidence. Preserve authoritative source fields and only fill missing descriptive fields.",
      prompt,
      {
        json: true,
        maxTokens: 3500,
        roles: ["researcher", "merchandiser", "reviewer"],
        reasoningEffort: "high",
        contextLabel: "supplier product evidence",
      },
    );
    return merge(product, parseJson(response.content), response.model, "text", "brain");
  } catch {
    // Image enrichment is best-effort. A supplier import remains truthful when the provider is unavailable.
    if (!product.imageUrl) return product;
    try {
      const visualPrompt = [
        "You are performing visual product understanding for Lunavo.",
        "Return strict JSON with keys: title, description, category, brand, specifications, variants, shippingInformation, attributes, evidence.",
        "Use only information visibly present in the image or supplied below. Never infer hidden specs, dimensions, materials, certifications, prices, shipping, stock, or model numbers.",
        evidencePayload(product),
      ].join("\n");
      const response = await completeLocalVisionJson(visualPrompt, product.imageUrl, { maxTokens: 2500 });
      return merge(product, parseJson(response.content), response.model, "vision", response.profile);
    } catch {
      return product;
    }
  }
}
