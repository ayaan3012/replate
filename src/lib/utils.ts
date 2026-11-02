import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class names, deduplicating conflicting utilities.
 * Used by shadcn-style components in src/components/ui/.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
