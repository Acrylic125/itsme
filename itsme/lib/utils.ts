import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function benchmark<T>(label: string, fn: () => T) {
  const startTime = Date.now();
  const result = fn();
  const endTime = Date.now();
  console.log(`${label} took ${endTime - startTime}ms`);
  return result;
}

export async function benchmarkAsync<T>(label: string, fn: () => Promise<T>) {
  const startTime = Date.now();
  const result = await fn();
  const endTime = Date.now();
  console.log(`${label} took ${endTime - startTime}ms`);
  return result;
}
