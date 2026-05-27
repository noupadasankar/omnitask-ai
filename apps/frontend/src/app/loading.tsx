'use client';

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-4.5rem)] w-full flex-col items-center justify-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/5">
        <div className="h-4 w-4 bg-primary"></div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}