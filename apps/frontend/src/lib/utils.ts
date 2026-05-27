import { type ClassValue, clsx } from 'clsx';

import { twMerge } from 'tailwind-merge';

export function cn(
  ...inputs: ClassValue[]
) {
  return twMerge(clsx(inputs));
}
export function formatDate(
  value?: string | Date,
) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

export function truncate(
  value: string,
  length = 50,
) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length)}...`;
}

export function generateId() {
  return crypto.randomUUID();
}