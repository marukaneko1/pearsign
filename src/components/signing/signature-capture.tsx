"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PenTool, Type, Upload, RotateCcw } from "lucide-react";

interface Field {
  id: string;
  type: string;
  label: string;
}

interface SignatureCaptureProps {
  field: Field;
  onSave: (data: string, type: string) => void;
  onCancel: () => void;
}

export function SignatureCapture({ field, onSave, onCancel }: SignatureCaptureProps) {
  const [activeTab, setActiveTab] = useState<"draw" | "type" | "upload">("draw");
  const [typedText, setTypedText] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (activeTab === "draw" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, [activeTab]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);

    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSave = () => {
    if (activeTab === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        alert("Please draw your signature");
        return;
      }

      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL("image/png");
      onSave(dataUrl, "drawn");
    } else if (activeTab === "type") {
      if (!typedText.trim()) {
        alert("Please type your signature");
        return;
      }

      onSave(typedText, "typed");
    }
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl" data-testid="signature-capture-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <PenTool className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            </div>
            {field.label}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as "draw" | "type" | "upload")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draw" data-testid="tab-draw">
              <PenTool className="mr-2 h-4 w-4" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="type" data-testid="tab-type">
              <Type className="mr-2 h-4 w-4" />
              Type
            </TabsTrigger>
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </TabsTrigger>
          </TabsList>

          {/* Draw Tab */}
          <TabsContent value="draw" className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="relative p-3">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="w-full cursor-crosshair rounded-lg bg-slate-50 dark:bg-slate-800"
                  data-testid="signature-canvas"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                />
                <div className="absolute bottom-6 left-12 right-12 h-px bg-slate-300 dark:bg-slate-600" />
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-slate-400 dark:text-slate-500 text-sm">Draw your signature here</span>
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Use your mouse, trackpad, or finger to sign</span>
                <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-slate-500" data-testid="button-clear-signature">
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel} data-testid="button-cancel-signature">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasDrawn} data-testid="button-adopt-sign">
                Adopt and Sign
              </Button>
            </div>
          </TabsContent>

          {/* Type Tab */}
          <TabsContent value="type" className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="p-6">
                <Input
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="Type your full name"
                  data-testid="input-typed-signature"
                  className="text-3xl font-serif text-center border-none focus-visible:ring-0 bg-transparent"
                  style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive" }}
                />
                <div className="mt-3 h-px bg-slate-300 dark:bg-slate-600 mx-4" />
              </div>
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700">
                <span className="text-xs text-slate-500 dark:text-slate-400">Your name will appear as a handwritten signature</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel} data-testid="button-cancel-type">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!typedText.trim()} data-testid="button-adopt-type">
                Adopt and Sign
              </Button>
            </div>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-4">
            <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-10 bg-slate-50 dark:bg-slate-800/50 text-center hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer" data-testid="upload-area">
              <div className="h-14 w-14 mx-auto mb-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <Upload className="h-6 w-6 text-slate-500 dark:text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Upload a signature image
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                PNG, JPG or SVG (transparent background recommended)
              </p>
              <Input
                type="file"
                accept="image/*"
                className="max-w-xs mx-auto"
                data-testid="input-upload-signature"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel} data-testid="button-cancel-upload">
                Cancel
              </Button>
              <Button onClick={handleSave} data-testid="button-adopt-upload">Adopt and Sign</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
