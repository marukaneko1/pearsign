"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Save,
  Download,
  Send,
  FileText,
  ArrowLeft,
  Trash2,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DocumentEditorProps {
  doc: {
    id: string;
    title: string;
    content: string;
    type: string;
    createdAt: Date;
  };
  onSave: (id: string, title: string, content: string) => void;
  onBack: () => void;
  onDelete: (id: string) => void;
}

export function DocumentEditor({
  doc,
  onSave,
  onBack,
  onDelete,
}: DocumentEditorProps) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    onSave(doc.id, title, content);
    setTimeout(() => setIsSaving(false), 1000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    // Could add a toast notification here
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this document?")) {
      onDelete(doc.id);
      onBack();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {doc.type}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Created {doc.createdAt.toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Title Editor */}
        <div>
          <label className="text-sm font-medium mb-2 block">Document Title</label>
          <Input
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            className="text-lg font-semibold"
            placeholder="Untitled Document"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Text
          </Button>
          <Button
            variant="outline"
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 border-0"
          >
            <Send className="h-4 w-4 mr-2" />
            Send for Signature
          </Button>
          <Button
            variant="outline"
            className="ml-auto text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="p-6 min-h-full">
          <div className="max-w-4xl mx-auto">
            <textarea
              value={content}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
              className="w-full min-h-[600px] p-4 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--pearsign-primary))] resize-none"
              placeholder="Start editing your document..."
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
