'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function SignError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[SignError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Unable to load signing page</h1>
        <p className="text-sm text-muted-foreground">
          This signing link may have expired or is no longer valid. Please contact the sender for a new link.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <Button variant="outline" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
