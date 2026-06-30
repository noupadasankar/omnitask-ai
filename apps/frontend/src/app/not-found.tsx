'use client';

/* eslint-disable @next/next/no-page-custom-font */
import './globals.css';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex h-[calc(100vh-4.5rem)] w-full flex-col items-center justify-center p-6">
      <h2 className="mb-4 text-center text-2xl font-bold">
        This page could not be found.
      </h2>
      <Button onClick={() => window.location.reload()}>Go Home</Button>
    </main>
  );
}