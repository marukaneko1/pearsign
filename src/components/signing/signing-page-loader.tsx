import { Loader2 } from "lucide-react";

export function SigningPageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center mx-auto">
          <Loader2 className="h-8 w-8 text-[hsl(var(--pearsign-primary))] animate-spin" />
        </div>
        <h2 className="text-xl font-semibold">Loading document...</h2>
        <p className="text-sm text-muted-foreground">
          Please wait while we prepare your signing experience
        </p>
      </div>
    </div>
  );
}
