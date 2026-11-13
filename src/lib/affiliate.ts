import matrix from "@/data/faultProducts.json";

/**
 * Amazon Associates tag. Configure with NEXT_PUBLIC_AMAZON_ASSOCIATES_TAG in .env.local
 * (see .env.example). YOUR-TAG-20 is a PLACEHOLDER: replace it after Associates approval.
 */
export const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATES_TAG || "YOUR-TAG-20";
export const IS_PLACEHOLDER_TAG = AMAZON_TAG === "YOUR-TAG-20";

export interface Product {
  name: string;
  blurb: string;
  searchQuery: string;
  asin: string | null;
}

export interface FaultEntry {
  title: string;
  why: string;
  drill: { name: string; steps: string[] };
  products: Product[];
}

export const FAULTS = matrix.faults as Record<string, FaultEntry>;

export function amazonLink(p: Product): string {
  const tag = encodeURIComponent(AMAZON_TAG);
  if (p.asin) return `https://www.amazon.com/dp/${encodeURIComponent(p.asin)}?tag=${tag}`;
  return `https://www.amazon.com/s?k=${encodeURIComponent(p.searchQuery)}&tag=${tag}`;
}
