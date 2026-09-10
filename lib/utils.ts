import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins conditional class values and resolves clashing Tailwind utilities so
 * the last one wins, which is what lets a caller override a component default.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
