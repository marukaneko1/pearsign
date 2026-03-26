"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Save,
  Download,
  Send,
  FileText,
  Edit3,
  Eye,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface PDFEditorProps {
  file: File;
  onBack: () => void;
  onSendForSignature: (file: File) => void;
}

export function PDFEditor({ file, onBack, onSendForSignature }: PDFEditorProps) {
  const [extractedText, setExtractedText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [fileName, setFileName] = useState(file.name);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPDF();
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [file]);

  const loadPDF = async () => {
    try {
      setIsLoading(true);

      // Create URL for preview
      const url = URL.createObjectURL(file);
      setPdfUrl(url);

      // Extract text from PDF using pdfjs-dist
      const arrayBuffer = await file.arrayBuffer();
      const pdfData = new Uint8Array(arrayBuffer);
      const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

      let allText = "";
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        if (pageText.trim()) {
          allText += pageText + "\n\n";
        }
      }

      const extracted = allText.trim() || `[No extractable text found in ${file.name}]`;
      setExtractedText(extracted);
      setEditedText(extracted);

      setIsLoading(false);
    } catch (error) {
      console.error("Error loading PDF:", error);
      setExtractedText("Error loading PDF. Please try again.");
      setEditedText("Error loading PDF. Please try again.");
      setIsLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
      setIsSaving(true);

      // Create a new PDF with the edited text
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // Standard letter size

      const { height } = page.getSize();
      const fontSize = 12;
      const margin = 50;

      // Split text into lines and add to PDF
      const lines = editedText.split('\n');
      let yPosition = height - margin;

      for (const line of lines) {
        if (yPosition < margin) {
          // Add new page if needed
          const newPage = pdfDoc.addPage([612, 792]);
          yPosition = newPage.getSize().height - margin;
        }

        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: fontSize,
        });

        yPosition -= fontSize + 4; // Line spacing
      }

      // Save the PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const newFile = new File([blob], fileName, { type: 'application/pdf' });

      // Update preview
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      setIsSaving(false);
      setIsEditing(false);

      // Show success feedback
      alert("✅ Changes saved! Your edited PDF is ready.");
    } catch (error) {
      console.error("Error saving PDF:", error);
      alert("Error saving changes. Please try again.");
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendForSignature = async () => {
    // Create final file from edited content
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { height } = page.getSize();
    const fontSize = 12;
    const margin = 50;

    const lines = editedText.split('\n');
    let yPosition = height - margin;

    for (const line of lines) {
      if (yPosition < margin) {
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = newPage.getSize().height - margin;
      }

      page.drawText(line, {
        x: margin,
        y: yPosition,
        size: fontSize,
      });

      yPosition -= fontSize + 4;
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const finalFile = new File([blob], fileName, { type: 'application/pdf' });

    onSendForSignature(finalFile);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30">
              <Sparkles className="h-3 w-3 mr-1" />
              Revolutionary Feature
            </Badge>
          </div>
        </div>

        {/* File Name */}
        <div>
          <label className="text-sm font-medium mb-2 block">File Name</label>
          <Input
            value={fileName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFileName(e.target.value)}
            className="font-semibold"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {!isEditing ? (
            <>
              <Button
                onClick={() => setIsEditing(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Document
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                onClick={handleSendForSignature}
                className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
              >
                <Send className="h-4 w-4 mr-2" />
                Send for Signature
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditedText(extractedText);
                  setIsEditing(false);
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
        </div>

        {/* Info Banner */}
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800 p-4">
          <div className="flex items-start gap-3">
            <Wand2 className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                🚀 Industry-First Feature!
              </h4>
              <p className="text-sm text-purple-800 dark:text-purple-200">
                <strong>No other e-signature platform lets you edit PDFs directly.</strong> DocuSign,
                PandaDoc, Adobe Sign - they all force you to download, edit in external tools, and re-upload.
                PearSign lets you edit instantly, right here. This saves you minutes on every document!
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex gap-4 p-4">
        {/* PDF Preview */}
        {!isEditing && (
          <div className="w-1/2 border rounded-lg p-4 overflow-auto bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                PDF Preview
              </h3>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading PDF...</p>
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-[600px] border rounded"
                title="PDF Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No preview available</p>
              </div>
            )}
          </div>
        )}

        {/* Text Editor */}
        <div className={isEditing ? "w-full" : "w-1/2"}>
          <Card className="p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {isEditing ? "Edit Document Content" : "Extracted Text"}
              </h3>
              {isEditing && (
                <Badge variant="outline" className="text-purple-600 border-purple-600">
                  <Edit3 className="h-3 w-3 mr-1" />
                  Editing Mode
                </Badge>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center flex-1">
                <p className="text-muted-foreground">Extracting text...</p>
              </div>
            ) : (
              <textarea
                value={editedText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditedText(e.target.value)}
                disabled={!isEditing}
                className={`flex-1 w-full p-4 border rounded-lg font-mono text-sm resize-none ${
                  isEditing
                    ? "focus:outline-none focus:ring-2 focus:ring-purple-500"
                    : "bg-gray-50 dark:bg-gray-900 cursor-default"
                }`}
                placeholder="PDF content will appear here..."
              />
            )}

            {isEditing && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  💡 <strong>Tip:</strong> Make your changes here. Click "Save Changes" to update the PDF.
                  Your edits will be preserved in the document.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
