import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface DeclineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecline: (reason: string) => void;
}

export function DeclineDialog({ open, onOpenChange, onDecline }: DeclineDialogProps) {
  const [reason, setReason] = useState("");

  const handleDecline = () => {
    if (!reason.trim()) {
      alert("Please provide a reason for declining");
      return;
    }

    onDecline(reason);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline to Sign</DialogTitle>
          <DialogDescription>
            Please provide a reason for declining this document
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
            placeholder="Enter your reason..."
            className="min-h-[100px]"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDecline}>
            Decline Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
