'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[OnboardingError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Onboarding error</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong during setup. Your account has been created — please try logging in.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => (window.location.href = '/login')}>
            Go to login
          </Button>
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
