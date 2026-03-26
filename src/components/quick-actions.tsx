"use client";
import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, ArrowRight, Send, CheckCircle2, PenLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickActionsProps {
  onSendDocument?: (file?: File) => void;
  onUploadAndSign?: (file?: File) => void;
  onUseTemplate?: () => void;
  onOpenAIWizard?: () => void;
}

export function QuickActions({ onSendDocument, onUploadAndSign, onUseTemplate, onOpenAIWizard }: QuickActionsProps) {
  const [greeting, setGreeting] = useState("Hello");
  const [isDraggingSend, setIsDraggingSend] = useState(false);
  const [isDraggingSign, setIsDraggingSign] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  // Drag handlers for Send Document
  const handleDragEnterSend = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSend(true);
  }, []);

  const handleDragLeaveSend = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSend(false);
  }, []);

  const handleDragOverSend = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDropSend = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSend(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      setUploadedFileName(file.name);
      setTimeout(() => {
        setUploadedFileName(null);
        onSendDocument?.(file);
      }, 800);
    }
  }, [onSendDocument]);

  // Drag handlers for Upload & Sign
  const handleDragEnterSign = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSign(true);
  }, []);

  const handleDragLeaveSign = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSign(false);
  }, []);

  const handleDragOverSign = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDropSign = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSign(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      setUploadedFileName(file.name);
      setTimeout(() => {
        setUploadedFileName(null);
        onUploadAndSign?.(file);
      }, 800);
    }
  }, [onUploadAndSign]);

  // File input handlers
  const handleFileSelectSend = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setUploadedFileName(file.name);
      setTimeout(() => {
        setUploadedFileName(null);
        onSendDocument?.(file);
      }, 800);
    }
    e.target.value = '';
  }, [onSendDocument]);

  const handleFileSelectSign = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setUploadedFileName(file.name);
      setTimeout(() => {
        setUploadedFileName(null);
        onUploadAndSign?.(file);
      }, 800);
    }
    e.target.value = '';
  }, [onUploadAndSign]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-normal text-foreground">
          {greeting}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Start a new document or pick up where you left off
        </p>
      </div>

      {/* Uploaded file indicator */}
      {uploadedFileName && (
        <div role="status" aria-live="polite" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-sm border border-green-200 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium">{uploadedFileName}</span>
          <span className="text-green-600 dark:text-green-500">uploaded</span>
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4" data-tour="quick-actions">
        {/* Send Document Card */}
        <div
          data-tour="send-document"
          role="button"
          tabIndex={0}
          aria-label="Send a document for signature — click or drag and drop a file"
          className={cn(
            "group relative rounded-md border bg-card p-5 transition-all cursor-pointer",
            isDraggingSend
              ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
              : "border-border/60 hover:border-border hover:shadow-sm"
          )}
          onDragEnter={handleDragEnterSend}
          onDragLeave={handleDragLeaveSend}
          onDragOver={handleDragOverSend}
          onDrop={handleDropSend}
          onClick={() => document.getElementById('file-upload-send')?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('file-upload-send')?.click(); } }}
        >
          <input
            type="file"
            id="file-upload-send"
            className="sr-only"
            accept=".pdf,.doc,.docx"
            aria-label="Upload file to send for signature"
            onChange={handleFileSelectSend}
          />

          <div className="flex items-start gap-4">
            <div className={cn(
              "w-11 h-11 rounded-lg flex items-center justify-center transition-colors shrink-0",
              isDraggingSend
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary"
            )}>
              {isDraggingSend ? (
                <Upload className="h-5 w-5 animate-bounce" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground mb-0.5">
                {isDraggingSend ? "Drop to upload" : "Send for signature"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isDraggingSend ? "Release to start" : "Get documents signed by others"}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
          </div>
        </div>

        {/* Upload & Sign Card */}
        <div
          data-tour="sign-yourself"
          role="button"
          tabIndex={0}
          aria-label="Sign a document yourself — click or drag and drop a file"
          className={cn(
            "group relative rounded-md border bg-card p-5 transition-all cursor-pointer",
            isDraggingSign
              ? "border-violet-500/50 bg-violet-500/5 ring-1 ring-violet-500/30"
              : "border-border/60 hover:border-border hover:shadow-sm"
          )}
          onDragEnter={handleDragEnterSign}
          onDragLeave={handleDragLeaveSign}
          onDragOver={handleDragOverSign}
          onDrop={handleDropSign}
          onClick={() => document.getElementById('file-upload-sign')?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('file-upload-sign')?.click(); } }}
        >
          <input
            type="file"
            id="file-upload-sign"
            className="sr-only"
            accept=".pdf,.doc,.docx"
            aria-label="Upload file to sign yourself"
            onChange={handleFileSelectSign}
          />

          <div className="flex items-start gap-4">
            <div className={cn(
              "w-11 h-11 rounded-lg flex items-center justify-center transition-colors shrink-0",
              isDraggingSign
                ? "bg-violet-500 text-white"
                : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
            )}>
              {isDraggingSign ? (
                <Upload className="h-5 w-5 animate-bounce" />
              ) : (
                <PenLine className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground mb-0.5">
                {isDraggingSign ? "Drop to upload" : "Sign yourself"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isDraggingSign ? "Release to start" : "Upload and sign a document"}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
          </div>
        </div>

        {/* Use Template Card */}
        <button
          data-tour="use-template"
          onClick={onUseTemplate}
          className="group relative rounded-md border border-border/60 bg-card p-5 text-left transition-all hover:border-border hover:shadow-sm"
        >
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground mb-0.5">Use a template</h3>
              <p className="text-sm text-muted-foreground">Start from a saved template</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
          </div>
        </button>

        {/* AI Document Wizard Card */}
        {onOpenAIWizard && (
          <button
            onClick={onOpenAIWizard}
            className="group relative rounded-md border border-border/60 bg-card p-5 text-left transition-all hover:border-border hover:shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground mb-0.5">AI document</h3>
                <p className="text-sm text-muted-foreground">Generate with AI</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </div>
          </button>
        )}
      </div>

    </div>
  );
}
