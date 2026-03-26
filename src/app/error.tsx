'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Please try again, or contact support if the problem persists.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Error ID: {error.digest}</p>
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Go home
          </Button>
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
