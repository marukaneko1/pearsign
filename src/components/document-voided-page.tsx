"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ban, Mail, HelpCircle } from "lucide-react";

interface DocumentVoidedPageProps {
  documentTitle?: string;
  voidedAt?: string;
  voidReason?: string;
  senderEmail?: string;
}

export function DocumentVoidedPage({
  documentTitle = "Document",
  voidedAt,
  voidReason,
  senderEmail,
}: DocumentVoidedPageProps) {
  const formattedDate = voidedAt
    ? new Date(voidedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8 text-center shadow-xl border-border/50">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mb-6">
          <Ban className="h-10 w-10 text-red-600 dark:text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mb-2">Document Voided</h1>

        {/* Document Name */}
        <p className="text-lg text-muted-foreground mb-6">
          "{documentTitle}"
        </p>

        {/* Explanation */}
        <div className="bg-muted/50 rounded-lg p-4 mb-6 text-left">
          <p className="text-sm text-muted-foreground mb-3">
            The sender has voided this document, which means:
          </p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              <span>This document is no longer valid and cannot be signed</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              <span>Any previous signatures on this document have been invalidated</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              <span>You do not need to take any action</span>
            </li>
          </ul>
        </div>

        {/* Void Details */}
        {(formattedDate || voidReason) && (
          <div className="border rounded-lg p-4 mb-6 text-left space-y-2">
            {formattedDate && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Voided on:</span>
                <span className="font-medium">{formattedDate}</span>
              </div>
            )}
            {voidReason && (
              <div className="text-sm">
                <span className="text-muted-foreground">Reason: </span>
                <span>{voidReason}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {senderEmail && (
            <Button variant="outline" className="w-full" asChild>
              <a href={`mailto:${senderEmail}`}>
                <Mail className="h-4 w-4 mr-2" />
                Contact Sender
              </a>
            </Button>
          )}
          <Button variant="ghost" className="w-full text-muted-foreground">
            <HelpCircle className="h-4 w-4 mr-2" />
            Learn More About Voided Documents
          </Button>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center text-white text-xs font-bold">
              P
            </div>
            <span>Powered by PearSign</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
