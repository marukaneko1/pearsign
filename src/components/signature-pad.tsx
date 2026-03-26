"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  PenTool,
  Type,
  Upload,
  Trash2,
  Undo2,
  Check,
  X,
  Palette,
  Minus,
  Plus,
} from "lucide-react";

interface SignaturePadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (signatureData: string, signatureType: "draw" | "type" | "upload") => void;
  signerName?: string;
  title?: string;
  description?: string;
}

interface Point {
  x: number;
  y: number;
  pressure?: number;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

const PEN_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Blue", value: "#1e40af" },
  { name: "Navy", value: "#1e3a5f" },
];

const SIGNATURE_FONTS = [
  { name: "Elegant", value: "font-signature-elegant", fontFamily: "var(--font-dancing-script), 'Dancing Script', cursive" },
  { name: "Classic", value: "font-signature-classic", fontFamily: "var(--font-great-vibes), 'Great Vibes', cursive" },
  { name: "Modern", value: "font-signature-modern", fontFamily: "var(--font-caveat), 'Caveat', cursive" },
  { name: "Bold", value: "font-signature-bold", fontFamily: "var(--font-permanent-marker), 'Permanent Marker', cursive" },
];

export function SignaturePad({
  open,
  onOpenChange,
  onSave,
  signerName = "",
  title = "Add Your Signature",
  description = "Draw, type, or upload your signature",
}: SignaturePadProps) {
  const [activeTab, setActiveTab] = useState<"draw" | "type" | "upload">("draw");
  const [penColor, setPenColor] = useState(PEN_COLORS[0].value);
  const [penWidth, setPenWidth] = useState(3);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [typedName, setTypedName] = useState(signerName);
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].value);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize canvas
  useEffect(() => {
    if (!open) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size based on container
    const updateCanvasSize = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = 200 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = "200px";

      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Redraw existing strokes
      redrawCanvas();
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [open, strokes]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Draw signature line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 170);
    ctx.lineTo(canvas.width / dpr - 20, 170);
    ctx.stroke();

    // Draw "Sign here" text
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px sans-serif";
    ctx.fillText("Sign above the line", 20, 190);

    // Redraw all strokes
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        const p0 = stroke.points[i - 1];
        const p1 = stroke.points[i];
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
      }

      ctx.stroke();
    });
  }, [strokes]);

  const getPointFromEvent = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      const touch = e.touches[0];
      // Touch.force is available on iOS for pressure-sensitive drawing
      const touchWithForce = touch as Touch & { force?: number };
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        pressure: touchWithForce.force || 0.5,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: 0.5,
      };
    }
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const point = getPointFromEvent(e);
    if (!point) return;

    setIsDrawing(true);
    setCurrentStroke({
      points: [point],
      color: penColor,
      width: penWidth,
    });
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !currentStroke) return;
    e.preventDefault();

    const point = getPointFromEvent(e);
    if (!point) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Add point to current stroke
    const newStroke = {
      ...currentStroke,
      points: [...currentStroke.points, point],
    };
    setCurrentStroke(newStroke);

    // Draw the new segment
    const points = newStroke.points;
    if (points.length < 2) return;

    ctx.strokeStyle = newStroke.color;
    ctx.lineWidth = newStroke.width;
    ctx.beginPath();

    const p0 = points[points.length - 2];
    const p1 = points[points.length - 1];

    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (isDrawing && currentStroke && currentStroke.points.length > 1) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setIsDrawing(false);
    setCurrentStroke(null);
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke(null);
    redrawCanvas();
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const generateSignatureData = (): string | null => {
    if (activeTab === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || strokes.length === 0) return null;

      // Create a new canvas with just the signature (no guide lines)
      const exportCanvas = document.createElement("canvas");
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return null;

      const dpr = window.devicePixelRatio || 1;
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw strokes only
      strokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;

        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

        for (let i = 1; i < stroke.points.length; i++) {
          const p0 = stroke.points[i - 1];
          const p1 = stroke.points[i];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }

        ctx.stroke();
      });

      return exportCanvas.toDataURL("image/png");
    } else if (activeTab === "type") {
      if (!typedName.trim()) return null;

      // Find the selected font's fontFamily
      const fontConfig = SIGNATURE_FONTS.find(f => f.value === selectedFont);
      const fontFamily = fontConfig?.fontFamily || "'Dancing Script', cursive";

      // Create canvas with typed signature
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      canvas.width = 500;
      canvas.height = 120;

      ctx.fillStyle = "transparent";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = penColor;
      ctx.font = `48px ${fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.fillText(typedName, 20, 60);

      return canvas.toDataURL("image/png");
    } else if (activeTab === "upload") {
      return uploadedImage;
    }

    return null;
  };

  const handleSave = () => {
    const signatureData = generateSignatureData();
    if (signatureData) {
      onSave(signatureData, activeTab);
      onOpenChange(false);
      // Reset state
      setStrokes([]);
      setTypedName(signerName);
      setUploadedImage(null);
    }
  };

  const hasSignature =
    (activeTab === "draw" && strokes.length > 0) ||
    (activeTab === "type" && typedName.trim().length > 0) ||
    (activeTab === "upload" && uploadedImage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-[hsl(var(--pearsign-primary))]/5 to-transparent">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center text-white">
              <PenTool className="h-5 w-5" />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <div className="px-6">
            <TabsList className="w-full grid grid-cols-3 h-12">
              <TabsTrigger value="draw" className="gap-2 data-[state=active]:bg-[hsl(var(--pearsign-primary))]/10">
                <PenTool className="h-4 w-4" />
                Draw
              </TabsTrigger>
              <TabsTrigger value="type" className="gap-2 data-[state=active]:bg-[hsl(var(--pearsign-primary))]/10">
                <Type className="h-4 w-4" />
                Type
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-2 data-[state=active]:bg-[hsl(var(--pearsign-primary))]/10">
                <Upload className="h-4 w-4" />
                Upload
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Draw Tab */}
          <TabsContent value="draw" className="m-0 p-6 pt-4">
            {/* Pen Controls */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  {PEN_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setPenColor(color.value)}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 transition-all",
                        penColor === color.value
                          ? "border-[hsl(var(--pearsign-primary))] scale-110"
                          : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPenWidth(Math.max(1, penWidth - 1))}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-xs w-8 text-center font-mono">{penWidth}px</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPenWidth(Math.min(8, penWidth + 1))}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={strokes.length === 0}
                  className="gap-1"
                >
                  <Undo2 className="h-4 w-4" />
                  Undo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  disabled={strokes.length === 0}
                  className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>

            {/* Drawing Canvas */}
            <div
              ref={containerRef}
              className="relative border-2 border-dashed border-border rounded-xl bg-white overflow-hidden cursor-crosshair"
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                style={{ touchAction: "none" }}
                className="block w-full"
              />
              {strokes.length === 0 && !isDrawing && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-muted-foreground text-sm">Draw your signature here</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Type Tab */}
          <TabsContent value="type" className="m-0 p-6 pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="typed-name">Type your name</Label>
                <Input
                  id="typed-name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Your full name"
                  className="h-12 text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label>Choose a style</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SIGNATURE_FONTS.map((font) => (
                    <button
                      key={font.value}
                      onClick={() => setSelectedFont(font.value)}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-left",
                        selectedFont === font.value
                          ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5"
                          : "border-border hover:border-muted-foreground/50"
                      )}
                    >
                      <p className="text-xs text-muted-foreground mb-1">{font.name}</p>
                      <p
                        className={cn("text-2xl truncate", font.value)}
                        style={{ color: penColor }}
                      >
                        {typedName || "Your Name"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color selector for typed signature */}
              <div className="flex items-center gap-3">
                <Label className="text-sm">Color:</Label>
                {PEN_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setPenColor(color.value)}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-all",
                      penColor === color.value
                        ? "border-[hsl(var(--pearsign-primary))] scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="m-0 p-6 pt-4">
            <div className="space-y-4">
              {uploadedImage ? (
                <div className="relative">
                  <div className="border-2 border-dashed border-border rounded-xl p-4 bg-white">
                    <img
                      src={uploadedImage}
                      alt="Uploaded signature"
                      className="max-h-32 mx-auto object-contain"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadedImage(null)}
                    className="absolute top-2 right-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="block">
                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/5 transition-colors">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium mb-1">Upload signature image</p>
                    <p className="text-sm text-muted-foreground">
                      PNG, JPG or GIF with transparent background preferred
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}

              <div className="p-4 rounded-xl bg-muted/50 border">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> For best results, use a signature with a transparent
                  background. You can sign on white paper, take a photo, and remove the
                  background using free online tools.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="p-6 pt-4 border-t bg-muted/30">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-muted-foreground">
              By signing, you agree to be legally bound by this signature
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasSignature}
                className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600 hover:from-[hsl(var(--pearsign-primary))]/90 hover:to-blue-600/90"
              >
                <Check className="h-4 w-4 mr-2" />
                Apply Signature
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
