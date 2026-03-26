"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, CheckCircle2, Edit, Send, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { VisualPDFEditor } from "./visual-pdf-editor";

interface DragDropZoneProps {
  onUploadComplete?: () => void;
}

export function DragDropZone({ onUploadComplete }: DragDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [showPDFEditor, setShowPDFEditor] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        setCurrentFile(file);
        setShowOptions(true);
      } else {
        setUploadedFile(file.name);
        setTimeout(() => setUploadedFile(null), 3000);
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        setCurrentFile(file);
        setShowOptions(true);
      } else {
        setUploadedFile(file.name);
        setTimeout(() => setUploadedFile(null), 3000);
      }
    }
  }, []);

  const handleEditPDF = () => {
    setShowOptions(false);
    setShowPDFEditor(true);
  };

  const handleSendDirectly = () => {
    setShowOptions(false);
    if (currentFile) {
      setUploadedFile(currentFile.name);
      setTimeout(() => {
        setUploadedFile(null);
        setCurrentFile(null);
      }, 3000);
    }
  };

  const handleSendForSignature = (file: File) => {
    setShowPDFEditor(false);
    setUploadedFile(file.name);
    setTimeout(() => {
      setUploadedFile(null);
      setCurrentFile(null);
    }, 3000);
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        isDragging
          ? "border-[hsl(var(--pearsign-primary))] border-2 bg-[hsl(var(--pearsign-primary))]/5 scale-[1.01]"
          : "border-dashed border-2 border-border/60 hover:border-border",
        uploadedFile && "border-solid border-green-500 bg-green-50 dark:bg-green-950/20"
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-8 md:p-12">
        {!uploadedFile ? (
          <div className="flex flex-col items-center justify-center text-center">
            {/* Animated upload icon */}
            <div
              className={cn(
                "relative mb-6 transition-all duration-300",
                isDragging && "scale-110"
              )}
            >
              <div className={cn(
                "w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300",
                isDragging
                  ? "bg-[hsl(var(--pearsign-primary))] shadow-lg shadow-[hsl(var(--pearsign-primary))]/30"
                  : "bg-muted"
              )}>
                <Upload
                  className={cn(
                    "h-9 w-9 transition-all duration-300",
                    isDragging
                      ? "text-white animate-bounce"
                      : "text-muted-foreground"
                  )}
                />
              </div>
              {/* Animated rings when dragging */}
              {isDragging && (
                <>
                  <div className="absolute inset-0 rounded-2xl border-2 border-[hsl(var(--pearsign-primary))] animate-ping opacity-20" />
                  <div className="absolute inset-[-8px] rounded-3xl border-2 border-[hsl(var(--pearsign-primary))] animate-ping opacity-10" style={{ animationDelay: "0.2s" }} />
                </>
              )}
            </div>

            {/* Text */}
            <h3 className="text-xl font-semibold mb-2">
              {isDragging ? "Drop your file here" : "Quick Send"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              {isDragging
                ? "Release to upload and start the signature process"
                : "Drag & drop a PDF or document here, or browse to get started quickly"}
            </p>

            {/* Browse Button */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="file"
                id="file-upload"
                className="sr-only"
                accept=".pdf,.doc,.docx"
                onChange={handleFileSelect}
              />
              <Button
                asChild
                size="lg"
                className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
              >
                <label htmlFor="file-upload" className="cursor-pointer">
                  <FileText className="mr-2 h-5 w-5" />
                  Browse Files
                </label>
              </Button>
              <span className="text-sm text-muted-foreground">
                PDF, Word, Excel, PowerPoint (Max 10MB)
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center animate-in fade-in-0 zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-2xl bg-green-500 flex items-center justify-center mb-6 shadow-lg shadow-green-500/30">
              <CheckCircle2 className="h-9 w-9 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-green-700 dark:text-green-400 mb-2">
              Document Uploaded!
            </h3>
            <p className="text-muted-foreground">
              <span className="font-medium">{uploadedFile}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Opening signature workflow...
            </p>
          </div>
        )}
      </div>

      {/* Options Dialog */}
      <Dialog open={showOptions} onOpenChange={setShowOptions}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>What would you like to do?</DialogTitle>
            <DialogDescription>
              You've uploaded {currentFile?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-4">
            <button
              onClick={handleSendDirectly}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-muted/50 hover:bg-muted hover:border-[hsl(var(--pearsign-primary))]/30 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center shrink-0">
                <Send className="h-6 w-6 text-[hsl(var(--pearsign-primary))]" />
              </div>
              <div className="flex-1">
                <div className="font-semibold mb-0.5">Send for Signature</div>
                <div className="text-sm text-muted-foreground">
                  Add recipients and signature fields
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-[hsl(var(--pearsign-primary))] group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={handleEditPDF}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-muted/50 hover:bg-muted hover:border-violet-500/30 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <Edit className="h-6 w-6 text-violet-600" />
              </div>
              <div className="flex-1">
                <div className="font-semibold mb-0.5">Edit PDF First</div>
                <div className="text-sm text-muted-foreground">
                  Make changes before sending
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-violet-600 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Editor Modal */}
      <Dialog open={showPDFEditor} onOpenChange={setShowPDFEditor}>
        <DialogContent className="max-w-[98vw] w-full h-[98vh] p-0">
          <DialogTitle className="sr-only">PDF Editor</DialogTitle>
          {currentFile ? (
            <VisualPDFEditor
              file={currentFile}
              onBack={() => setShowPDFEditor(false)}
              onSendForSignature={handleSendForSignature}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p>No file selected</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
