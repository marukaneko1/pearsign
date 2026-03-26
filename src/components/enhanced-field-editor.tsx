"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Plus,
  Trash2,
  Type,
  Mail,
  Calendar,
  PenTool,
  Hash,
  CheckSquare,
  Upload,
  Building2,
  MapPin,
  Phone,
  GripVertical,
  Settings2,
  AlertCircle,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ChevronDown,
  Info,
  Edit3,
  FileText,
  Paperclip,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ================== TYPES ==================

export type FieldType =
  | 'signature'
  | 'initials'
  | 'text'
  | 'email'
  | 'date'
  | 'number'
  | 'checkbox'
  | 'company'
  | 'address'
  | 'phone'
  | 'upload'
  | 'name'
  | 'title';

export interface EnhancedField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  assignedTo: string; // Recipient/signer role ID

  // Text field specific
  placeholder?: string;
  defaultValue?: string;
  tooltip?: string;
  dataLabel?: string;
  readOnly?: boolean;
  validation?: {
    type: 'none' | 'email' | 'number' | 'phone' | 'date' | 'regex';
    pattern?: string;
    message?: string;
  };

  // Checkbox specific
  groupId?: string;
  groupValidation?: 'none' | 'at_least_one' | 'exactly_one' | 'all';
  checkboxLabel?: string;

  // Upload specific
  acceptedFileTypes?: string;
  maxFiles?: number;
}

export interface FieldTypeConfig {
  type: FieldType;
  label: string;
  icon: React.ElementType;
  width: number;
  height: number;
  color: string;
  bgColor: string;
  hasSubMenu?: boolean;
}

// ================== CONSTANTS ==================

export const FIELD_TYPES: FieldTypeConfig[] = [
  { type: 'signature', label: 'Signature', icon: PenTool, width: 200, height: 60, color: '#2563eb', bgColor: 'bg-blue-100 dark:bg-blue-950' },
  { type: 'initials', label: 'Initials', icon: Type, width: 80, height: 50, color: '#3b82f6', bgColor: 'bg-blue-50 dark:bg-blue-900' },
  { type: 'date', label: 'Date Signed', icon: Calendar, width: 150, height: 32, color: '#f97316', bgColor: 'bg-orange-100 dark:bg-orange-950' },
  { type: 'name', label: 'Full Name', icon: User, width: 200, height: 32, color: '#6b7280', bgColor: 'bg-gray-100 dark:bg-gray-800' },
  { type: 'email', label: 'Email', icon: Mail, width: 220, height: 32, color: '#10b981', bgColor: 'bg-emerald-100 dark:bg-emerald-950' },
  { type: 'text', label: 'Text Field', icon: Type, width: 200, height: 32, color: '#6b7280', bgColor: 'bg-gray-100 dark:bg-gray-800', hasSubMenu: true },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, width: 24, height: 24, color: '#14b8a6', bgColor: 'bg-teal-100 dark:bg-teal-950' },
  { type: 'company', label: 'Company', icon: Building2, width: 200, height: 32, color: '#6366f1', bgColor: 'bg-indigo-100 dark:bg-indigo-950' },
  { type: 'title', label: 'Job Title', icon: Edit3, width: 180, height: 32, color: '#8b5cf6', bgColor: 'bg-purple-100 dark:bg-purple-950' },
  { type: 'upload', label: 'Document Upload', icon: Paperclip, width: 200, height: 60, color: '#06b6d4', bgColor: 'bg-cyan-100 dark:bg-cyan-950' },
  { type: 'number', label: 'Number', icon: Hash, width: 100, height: 32, color: '#8b5cf6', bgColor: 'bg-purple-100 dark:bg-purple-950' },
  { type: 'phone', label: 'Phone', icon: Phone, width: 150, height: 32, color: '#f59e0b', bgColor: 'bg-amber-100 dark:bg-amber-950' },
  { type: 'address', label: 'Address', icon: MapPin, width: 250, height: 60, color: '#f43f5e', bgColor: 'bg-rose-100 dark:bg-rose-950' },
];

export const getFieldTypeConfig = (type: FieldType): FieldTypeConfig => {
  return FIELD_TYPES.find(f => f.type === type) || FIELD_TYPES[0];
};

// ================== ALIGNMENT GUIDES ==================

export interface AlignmentGuide {
  position: number;
  direction: 'horizontal' | 'vertical';
  type: 'edge' | 'center';
}

const SNAP_THRESHOLD = 8; // pixels
const GRID_SIZE = 10; // pixels for grid snapping

// ================== DRAG PREVIEW COMPONENT ==================

// Generic field interface for drag preview
interface DragPreviewField {
  id: string;
  type: string;
  name?: string;
  width: number;
  height: number;
  required?: boolean;
}

interface DragPreviewProps {
  field: DragPreviewField | null;
  position: { x: number; y: number };
  color: string;
  isVisible: boolean;
}

export function DragPreview({ field, position, color, isVisible }: DragPreviewProps) {
  if (!isVisible || !field) return null;

  const config = getFieldTypeConfig(field.type as FieldType);
  const Icon = config.icon;

  return (
    <div
      className="fixed pointer-events-none z-[100] transition-none"
      style={{
        left: position.x,
        top: position.y,
        width: field.width,
        height: field.height,
        opacity: 0.9,
      }}
    >
      {/* High-fidelity preview matching final appearance */}
      <div
        className="w-full h-full rounded-md border-2 flex flex-col shadow-xl"
        style={{
          borderColor: color,
          backgroundColor: `${color}20`,
        }}
      >
        {/* Field Header */}
        <div
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium truncate"
          style={{ color }}
        >
          <GripVertical className="h-3 w-3 opacity-50" />
          <Icon className="h-3 w-3" />
          <span className="truncate">{config.label}</span>
          <span
            className={cn(
              "ml-auto text-[10px] px-1 rounded",
              field.required
                ? "bg-red-100 text-red-600"
                : "bg-gray-100 text-gray-500"
            )}
          >
            {field.required ? 'REQ' : 'OPT'}
          </span>
        </div>

        {/* Checkbox rendering */}
        {field.type === 'checkbox' && (
          <div className="flex-1 flex items-center justify-center">
            <div
              className="w-4 h-4 border-2 rounded-sm"
              style={{ borderColor: color }}
            />
          </div>
        )}
      </div>

      {/* Drop shadow effect */}
      <div
        className="absolute inset-0 -z-10 rounded-md blur-md opacity-30"
        style={{ backgroundColor: color, transform: 'translate(4px, 4px)' }}
      />
    </div>
  );
}

// ================== TEXT FIELD SUB-MENU ==================

interface TextFieldSubMenuProps {
  field: EnhancedField;
  onUpdate: (updates: Partial<EnhancedField>) => void;
  onClose: () => void;
  color: string;
}

export function TextFieldSubMenu({ field, onUpdate, onClose, color }: TextFieldSubMenuProps) {
  const [localPlaceholder, setLocalPlaceholder] = useState(field.placeholder || '');
  const [localDefaultValue, setLocalDefaultValue] = useState(field.defaultValue || '');
  const [localTooltip, setLocalTooltip] = useState(field.tooltip || '');
  const [localDataLabel, setLocalDataLabel] = useState(field.dataLabel || '');
  const [localReadOnly, setLocalReadOnly] = useState(field.readOnly || false);
  const [localValidationType, setLocalValidationType] = useState<string>(field.validation?.type || 'none');
  const [localValidationPattern, setLocalValidationPattern] = useState(field.validation?.pattern || '');
  const [localValidationMessage, setLocalValidationMessage] = useState(field.validation?.message || '');

  const handleSave = () => {
    onUpdate({
      placeholder: localPlaceholder,
      defaultValue: localDefaultValue,
      tooltip: localTooltip,
      dataLabel: localDataLabel,
      readOnly: localReadOnly,
      validation: {
        type: localValidationType as 'none' | 'email' | 'number' | 'phone' | 'date' | 'regex',
        pattern: localValidationPattern,
        message: localValidationMessage,
      },
    });
    onClose();
  };

  return (
    <div className="p-4 space-y-4 w-80">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm flex items-center gap-2" style={{ color }}>
          <Type className="h-4 w-4" />
          Text Field Properties
        </h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Custom Text / Placeholder */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Placeholder Text
          <Info className="inline h-3 w-3 ml-1 opacity-50" />
        </Label>
        <Input
          value={localPlaceholder}
          onChange={(e) => setLocalPlaceholder(e.target.value)}
          placeholder="Enter placeholder..."
          className="h-8 text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Shown to signer when field is empty
        </p>
      </div>

      {/* Default Value */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Pre-fill Value (Default)
        </Label>
        <Input
          value={localDefaultValue}
          onChange={(e) => setLocalDefaultValue(e.target.value)}
          placeholder="Pre-fill this field..."
          className="h-8 text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Signer will see this value pre-filled
        </p>
      </div>

      {/* Tooltip */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Tooltip (Help Text)
        </Label>
        <Textarea
          value={localTooltip}
          onChange={(e) => setLocalTooltip(e.target.value)}
          placeholder="Explain what to enter..."
          className="h-16 text-sm resize-none"
        />
        <p className="text-[10px] text-muted-foreground">
          Shown on hover to guide the signer
        </p>
      </div>

      {/* Data Label */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Data Label (For Export)
        </Label>
        <Input
          value={localDataLabel}
          onChange={(e) => setLocalDataLabel(e.target.value)}
          placeholder="e.g., customer_name"
          className="h-8 text-sm font-mono"
        />
        <p className="text-[10px] text-muted-foreground">
          Used when exporting form data
        </p>
      </div>

      {/* Read Only */}
      <div className="flex items-center justify-between py-2">
        <div>
          <Label className="text-xs font-medium">Read-Only</Label>
          <p className="text-[10px] text-muted-foreground">
            Signer cannot edit this field
          </p>
        </div>
        <Switch
          checked={localReadOnly}
          onCheckedChange={setLocalReadOnly}
        />
      </div>

      {/* Validation */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Validation Rule
        </Label>
        <Select value={localValidationType} onValueChange={setLocalValidationType}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select validation..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="email">Email Format</SelectItem>
            <SelectItem value="number">Numbers Only</SelectItem>
            <SelectItem value="phone">Phone Number</SelectItem>
            <SelectItem value="date">Date Format</SelectItem>
            <SelectItem value="regex">Custom Regex</SelectItem>
          </SelectContent>
        </Select>

        {localValidationType === 'regex' && (
          <>
            <Input
              value={localValidationPattern}
              onChange={(e) => setLocalValidationPattern(e.target.value)}
              placeholder="^[A-Z]{2}[0-9]{4}$"
              className="h-8 text-sm font-mono"
            />
            <Input
              value={localValidationMessage}
              onChange={(e) => setLocalValidationMessage(e.target.value)}
              placeholder="Error message if invalid..."
              className="h-8 text-sm"
            />
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t">
        <Button variant="outline" className="flex-1 h-8 text-xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="flex-1 h-8 text-xs"
          onClick={handleSave}
          style={{ backgroundColor: color }}
        >
          Apply Changes
        </Button>
      </div>
    </div>
  );
}

// ================== CHECKBOX GROUP MANAGER ==================

interface CheckboxGroupManagerProps {
  fields: EnhancedField[];
  groupId: string;
  onUpdateGroup: (groupId: string, updates: Partial<EnhancedField>) => void;
  onAlignGroup: (groupId: string, alignment: 'left' | 'center' | 'right' | 'distribute-h' | 'distribute-v') => void;
  onAddToGroup: (groupId: string) => void;
  color: string;
}

export function CheckboxGroupManager({
  fields,
  groupId,
  onUpdateGroup,
  onAlignGroup,
  onAddToGroup,
  color,
}: CheckboxGroupManagerProps) {
  const groupFields = fields.filter(f => f.groupId === groupId);
  const firstField = groupFields[0];

  if (!firstField) return null;

  return (
    <div className="p-3 space-y-3 w-72">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2" style={{ color }}>
          <CheckSquare className="h-4 w-4" />
          Checkbox Group ({groupFields.length})
        </h4>
      </div>

      {/* Group Validation */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Selection Requirement
        </Label>
        <Select
          value={firstField.groupValidation || 'none'}
          onValueChange={(value) => onUpdateGroup(groupId, {
            groupValidation: value as 'none' | 'at_least_one' | 'exactly_one' | 'all'
          })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No requirement</SelectItem>
            <SelectItem value="at_least_one">At least one selected</SelectItem>
            <SelectItem value="exactly_one">Exactly one selected</SelectItem>
            <SelectItem value="all">All must be selected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alignment Tools */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Align Checkboxes
        </Label>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAlignGroup(groupId, 'left')}
            title="Align Left"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAlignGroup(groupId, 'center')}
            title="Align Center"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAlignGroup(groupId, 'right')}
            title="Align Right"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <div className="w-px bg-border mx-1" />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAlignGroup(groupId, 'distribute-h')}
            title="Distribute Horizontally"
          >
            <AlignHorizontalDistributeCenter className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAlignGroup(groupId, 'distribute-v')}
            title="Distribute Vertically"
          >
            <AlignVerticalDistributeCenter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Add Another */}
      <Button
        variant="outline"
        className="w-full h-8 text-xs"
        onClick={() => onAddToGroup(groupId)}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Another Checkbox
      </Button>
    </div>
  );
}

// ================== ENHANCED FIELD COMPONENT ==================

interface EnhancedFieldComponentProps {
  field: EnhancedField;
  isSelected: boolean;
  isDragging: boolean;
  color: string;
  recipientName?: string;
  zoom?: number;
  onSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onUpdate: (updates: Partial<EnhancedField>) => void;
  onDelete: () => void;
  onAddCheckbox?: () => void;
  showGroupBoundary?: boolean;
  alignmentGuides?: AlignmentGuide[];
  containerBounds?: { width: number; height: number };
  allFields?: EnhancedField[];
  onAlignGroup?: (groupId: string, alignment: 'left' | 'center' | 'right' | 'distribute-h' | 'distribute-v') => void;
}

export function EnhancedFieldComponent({
  field,
  isSelected,
  isDragging,
  color,
  recipientName,
  zoom = 1,
  onSelect,
  onDragStart,
  onUpdate,
  onDelete,
  onAddCheckbox,
  showGroupBoundary,
  allFields = [],
  onAlignGroup,
}: EnhancedFieldComponentProps) {
  const config = getFieldTypeConfig(field.type);
  const Icon = config.icon;
  const [showTextMenu, setShowTextMenu] = useState(false);
  const [showCheckboxMenu, setShowCheckboxMenu] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, fieldX: 0, fieldY: 0 });

  // Handle resize
  const handleResizeStart = (e: React.MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeCorner(corner);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: field.width,
      height: field.height,
      fieldX: field.x,
      fieldY: field.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - resizeStartRef.current.x) / zoom;
      const deltaY = (moveEvent.clientY - resizeStartRef.current.y) / zoom;

      let newX = resizeStartRef.current.fieldX;
      let newY = resizeStartRef.current.fieldY;
      let newWidth = resizeStartRef.current.width;
      let newHeight = resizeStartRef.current.height;

      switch (corner) {
        case 'se':
          newWidth = Math.max(30, resizeStartRef.current.width + deltaX);
          newHeight = Math.max(20, resizeStartRef.current.height + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(30, resizeStartRef.current.width - deltaX);
          newHeight = Math.max(20, resizeStartRef.current.height + deltaY);
          newX = resizeStartRef.current.fieldX + (resizeStartRef.current.width - newWidth);
          break;
        case 'ne':
          newWidth = Math.max(30, resizeStartRef.current.width + deltaX);
          newHeight = Math.max(20, resizeStartRef.current.height - deltaY);
          newY = resizeStartRef.current.fieldY + (resizeStartRef.current.height - newHeight);
          break;
        case 'nw':
          newWidth = Math.max(30, resizeStartRef.current.width - deltaX);
          newHeight = Math.max(20, resizeStartRef.current.height - deltaY);
          newX = resizeStartRef.current.fieldX + (resizeStartRef.current.width - newWidth);
          newY = resizeStartRef.current.fieldY + (resizeStartRef.current.height - newHeight);
          break;
      }

      onUpdate({ x: newX, y: newY, width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeCorner(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <>
      {/* Group boundary for checkboxes */}
      {showGroupBoundary && field.groupId && (
        <div
          className="absolute border-2 border-dashed rounded-md pointer-events-none"
          style={{
            borderColor: `${color}50`,
            left: field.x - 4,
            top: field.y - 4,
            width: field.width + 8,
            height: field.height + 8,
          }}
        />
      )}

      <div
        className={cn(
          "absolute rounded-md flex flex-col transition-shadow group/field",
          isSelected
            ? "ring-2 ring-offset-2 z-20"
            : "hover:shadow-md",
          isDragging ? "cursor-grabbing opacity-70" : "cursor-grab",
          isResizing && "cursor-nwse-resize"
        )}
        style={{
          left: field.x,
          top: field.y,
          width: field.width,
          height: showTextMenu || showCheckboxMenu ? 'auto' : field.height,
          minHeight: field.height,
          borderWidth: 2,
          borderStyle: isSelected ? 'solid' : 'dashed',
          borderColor: color,
          backgroundColor: `${color}15`,
          ...(isSelected && { '--tw-ring-color': color } as React.CSSProperties),
        }}
        onMouseDown={(e) => {
          // Don't start drag if clicking on menu or resize handle
          if ((e.target as HTMLElement).closest('.field-menu, .resize-handle')) return;
          onDragStart(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {/* Field Header */}
        <div
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium"
          style={{ color }}
        >
          <GripVertical className="h-3 w-3 opacity-50 cursor-grab" />
          <Icon className="h-3 w-3" />
          <span className="flex-1 truncate">{field.name || config.label}</span>

          {/* Required/Optional Badge */}
          <span
            className={cn(
              "text-[10px] px-1 rounded font-medium",
              field.required
                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            {field.required ? 'REQ' : 'OPT'}
          </span>

          {/* Settings button for text fields */}
          {field.type === 'text' && (
            <Popover open={showTextMenu} onOpenChange={setShowTextMenu}>
              <PopoverTrigger asChild>
                <button
                  className="opacity-50 hover:opacity-100 transition-opacity field-menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTextMenu(!showTextMenu);
                  }}
                >
                  <Settings2 className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start" side="right">
                <TextFieldSubMenu
                  field={field}
                  onUpdate={onUpdate}
                  onClose={() => setShowTextMenu(false)}
                  color={color}
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Settings button for checkboxes (group management) */}
          {field.type === 'checkbox' && field.groupId && (
            <Popover open={showCheckboxMenu} onOpenChange={setShowCheckboxMenu}>
              <PopoverTrigger asChild>
                <button
                  className="opacity-50 hover:opacity-100 transition-opacity field-menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCheckboxMenu(!showCheckboxMenu);
                  }}
                >
                  <Settings2 className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start" side="right">
                <CheckboxGroupManager
                  fields={allFields}
                  groupId={field.groupId}
                  onUpdateGroup={(groupId, updates) => {
                    // Update all checkboxes in the group
                    allFields
                      .filter(f => f.groupId === groupId)
                      .forEach(f => onUpdate({ ...updates }));
                  }}
                  onAlignGroup={onAlignGroup || (() => {})}
                  onAddToGroup={() => onAddCheckbox?.()}
                  color={color}
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Delete button */}
          <button
            className="opacity-50 hover:opacity-100 hover:text-red-500 transition-all field-menu"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Recipient Badge */}
        {recipientName && (
          <div
            className="absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded text-white font-medium whitespace-nowrap"
            style={{ backgroundColor: color }}
          >
            {recipientName}
          </div>
        )}

        {/* Checkbox visual */}
        {field.type === 'checkbox' && (
          <div className="flex-1 flex items-center justify-center">
            <div
              className="w-4 h-4 border-2 rounded-sm"
              style={{ borderColor: color }}
            />
            {field.checkboxLabel && (
              <span className="ml-1 text-xs" style={{ color }}>
                {field.checkboxLabel}
              </span>
            )}
          </div>
        )}

        {/* + Add Another Checkbox Button */}
        {field.type === 'checkbox' && isSelected && onAddCheckbox && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddCheckbox();
            }}
            className="absolute -right-8 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform z-20 field-menu"
            style={{ backgroundColor: color }}
            title="Add another checkbox to group"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}

        {/* Prefill/placeholder preview */}
        {!showTextMenu && (field.defaultValue || field.placeholder) && (
          <div className="px-2 pb-1 text-xs truncate opacity-60" style={{ color }}>
            {field.defaultValue ? `"${field.defaultValue}"` : field.placeholder}
          </div>
        )}

        {/* Tooltip indicator */}
        {field.tooltip && (
          <div
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: color }}
            title={field.tooltip}
          >
            <Info className="h-2.5 w-2.5" />
          </div>
        )}

        {/* Resize Handles (shown when selected) */}
        {isSelected && (
          <>
            {['nw', 'ne', 'sw', 'se'].map((corner) => (
              <div
                key={corner}
                className={cn(
                  "resize-handle absolute w-3 h-3 rounded-sm border-2 border-white shadow-md transition-transform hover:scale-125",
                  corner === 'nw' && "-top-1.5 -left-1.5 cursor-nw-resize",
                  corner === 'ne' && "-top-1.5 -right-1.5 cursor-ne-resize",
                  corner === 'sw' && "-bottom-1.5 -left-1.5 cursor-sw-resize",
                  corner === 'se' && "-bottom-1.5 -right-1.5 cursor-se-resize"
                )}
                style={{ backgroundColor: color }}
                onMouseDown={(e) => handleResizeStart(e, corner as 'nw' | 'ne' | 'sw' | 'se')}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

// ================== FIELD SIDEBAR ITEM WITH SUB-MENU ==================

interface FieldSidebarItemProps {
  fieldType: FieldTypeConfig;
  isActive: boolean;
  onSelect: () => void;
  onAddWithConfig?: (config: Partial<EnhancedField>) => void;
}

export function FieldSidebarItem({
  fieldType,
  isActive,
  onSelect,
  onAddWithConfig,
}: FieldSidebarItemProps) {
  const [showSubMenu, setShowSubMenu] = useState(false);
  const Icon = fieldType.icon;

  // For text fields, show sub-menu on click
  if (fieldType.hasSubMenu) {
    return (
      <Popover open={showSubMenu} onOpenChange={setShowSubMenu}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-full h-11 rounded-lg flex items-center gap-3 px-3 transition-all text-left border",
              isActive
                ? "bg-[hsl(var(--pearsign-primary))] text-white shadow-md border-[hsl(var(--pearsign-primary))]"
                : "hover:bg-muted border-transparent hover:border-border"
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                isActive ? "bg-white/20" : fieldType.bgColor
              )}
            >
              <Icon
                className="h-4 w-4"
                style={{ color: isActive ? "white" : fieldType.color }}
              />
            </div>
            <span
              className={cn(
                "text-sm font-medium flex-1",
                isActive ? "text-white" : "text-foreground"
              )}
            >
              {fieldType.label}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                showSubMenu && "rotate-180"
              )}
              style={{ color: isActive ? "white" : "currentColor" }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" side="right" align="start">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Icon className="h-4 w-4" style={{ color: fieldType.color }} />
              Add Text Field
            </h4>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start h-9"
                onClick={() => {
                  onAddWithConfig?.({ type: 'text', placeholder: '', required: true });
                  setShowSubMenu(false);
                }}
              >
                <Type className="h-4 w-4 mr-2" />
                Empty Text Field
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-9"
                onClick={() => {
                  onAddWithConfig?.({ type: 'text', placeholder: 'Enter your response...', required: true });
                  setShowSubMenu(false);
                }}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                With Placeholder
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-9"
                onClick={() => {
                  onAddWithConfig?.({ type: 'text', readOnly: true, defaultValue: 'Read-only text', required: false });
                  setShowSubMenu(false);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Read-Only Field
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Click to add, then click on document to place. Configure properties in field settings.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full h-11 rounded-lg flex items-center gap-3 px-3 transition-all text-left border",
        isActive
          ? "bg-[hsl(var(--pearsign-primary))] text-white shadow-md border-[hsl(var(--pearsign-primary))]"
          : "hover:bg-muted border-transparent hover:border-border"
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
          isActive ? "bg-white/20" : fieldType.bgColor
        )}
      >
        <Icon
          className="h-4 w-4"
          style={{ color: isActive ? "white" : fieldType.color }}
        />
      </div>
      <span
        className={cn(
          "text-sm font-medium",
          isActive ? "text-white" : "text-foreground"
        )}
      >
        {fieldType.label}
      </span>
    </button>
  );
}

// ================== ALIGNMENT GUIDES RENDERER ==================

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
  containerWidth: number;
  containerHeight: number;
}

export function AlignmentGuidesRenderer({ guides, containerWidth, containerHeight }: AlignmentGuidesProps) {
  return (
    <>
      {guides.map((guide, index) => (
        <div
          key={index}
          className="absolute pointer-events-none z-50"
          style={{
            backgroundColor: guide.type === 'center' ? '#3b82f6' : '#10b981',
            ...(guide.direction === 'horizontal'
              ? { left: 0, width: containerWidth, top: guide.position, height: 1 }
              : { top: 0, height: containerHeight, left: guide.position, width: 1 }),
          }}
        />
      ))}
    </>
  );
}

// ================== UTILITY FUNCTIONS ==================

// Generic field interface for alignment calculations
interface FieldBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateAlignmentGuides<T extends FieldBounds>(
  movingField: T,
  otherFields: T[],
  containerWidth: number,
  containerHeight: number
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = [];
  const movingRect = {
    left: movingField.x,
    right: movingField.x + movingField.width,
    top: movingField.y,
    bottom: movingField.y + movingField.height,
    centerX: movingField.x + movingField.width / 2,
    centerY: movingField.y + movingField.height / 2,
  };

  // Check against container edges
  if (Math.abs(movingRect.left) < SNAP_THRESHOLD) {
    guides.push({ position: 0, direction: 'vertical', type: 'edge' });
  }
  if (Math.abs(movingRect.right - containerWidth) < SNAP_THRESHOLD) {
    guides.push({ position: containerWidth, direction: 'vertical', type: 'edge' });
  }
  if (Math.abs(movingRect.top) < SNAP_THRESHOLD) {
    guides.push({ position: 0, direction: 'horizontal', type: 'edge' });
  }
  if (Math.abs(movingRect.bottom - containerHeight) < SNAP_THRESHOLD) {
    guides.push({ position: containerHeight, direction: 'horizontal', type: 'edge' });
  }

  // Check against center of container
  if (Math.abs(movingRect.centerX - containerWidth / 2) < SNAP_THRESHOLD) {
    guides.push({ position: containerWidth / 2, direction: 'vertical', type: 'center' });
  }
  if (Math.abs(movingRect.centerY - containerHeight / 2) < SNAP_THRESHOLD) {
    guides.push({ position: containerHeight / 2, direction: 'horizontal', type: 'center' });
  }

  // Check against other fields
  otherFields.forEach(field => {
    if (field.id === movingField.id) return;

    const fieldRect = {
      left: field.x,
      right: field.x + field.width,
      top: field.y,
      bottom: field.y + field.height,
      centerX: field.x + field.width / 2,
      centerY: field.y + field.height / 2,
    };

    // Vertical alignment (left, right, center)
    if (Math.abs(movingRect.left - fieldRect.left) < SNAP_THRESHOLD) {
      guides.push({ position: fieldRect.left, direction: 'vertical', type: 'edge' });
    }
    if (Math.abs(movingRect.right - fieldRect.right) < SNAP_THRESHOLD) {
      guides.push({ position: fieldRect.right, direction: 'vertical', type: 'edge' });
    }
    if (Math.abs(movingRect.centerX - fieldRect.centerX) < SNAP_THRESHOLD) {
      guides.push({ position: fieldRect.centerX, direction: 'vertical', type: 'center' });
    }

    // Horizontal alignment (top, bottom, center)
    if (Math.abs(movingRect.top - fieldRect.top) < SNAP_THRESHOLD) {
      guides.push({ position: fieldRect.top, direction: 'horizontal', type: 'edge' });
    }
    if (Math.abs(movingRect.bottom - fieldRect.bottom) < SNAP_THRESHOLD) {
      guides.push({ position: fieldRect.bottom, direction: 'horizontal', type: 'edge' });
    }
    if (Math.abs(movingRect.centerY - fieldRect.centerY) < SNAP_THRESHOLD) {
      guides.push({ position: fieldRect.centerY, direction: 'horizontal', type: 'center' });
    }
  });

  return guides;
}

export function snapToGuides<T extends FieldBounds>(
  field: T,
  guides: AlignmentGuide[]
): { x: number; y: number } {
  let { x, y } = field;

  guides.forEach(guide => {
    if (guide.direction === 'vertical') {
      // Snap left edge
      if (Math.abs(x - guide.position) < SNAP_THRESHOLD) {
        x = guide.position;
      }
      // Snap right edge
      if (Math.abs(x + field.width - guide.position) < SNAP_THRESHOLD) {
        x = guide.position - field.width;
      }
      // Snap center
      if (Math.abs(x + field.width / 2 - guide.position) < SNAP_THRESHOLD) {
        x = guide.position - field.width / 2;
      }
    } else {
      // Snap top edge
      if (Math.abs(y - guide.position) < SNAP_THRESHOLD) {
        y = guide.position;
      }
      // Snap bottom edge
      if (Math.abs(y + field.height - guide.position) < SNAP_THRESHOLD) {
        y = guide.position - field.height;
      }
      // Snap center
      if (Math.abs(y + field.height / 2 - guide.position) < SNAP_THRESHOLD) {
        y = guide.position - field.height / 2;
      }
    }
  });

  // Grid snapping
  x = Math.round(x / GRID_SIZE) * GRID_SIZE;
  y = Math.round(y / GRID_SIZE) * GRID_SIZE;

  return { x, y };
}

export function generateFieldId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createNewField(
  type: FieldType,
  x: number,
  y: number,
  page: number,
  assignedTo: string,
  additionalConfig?: Partial<EnhancedField>
): EnhancedField {
  const config = getFieldTypeConfig(type);
  const fieldCount = 0; // This should be passed in from parent

  return {
    id: generateFieldId(),
    name: `${config.label} ${fieldCount + 1}`,
    type,
    required: type === 'signature' || type === 'initials',
    x,
    y,
    width: config.width,
    height: config.height,
    page,
    assignedTo,
    groupId: type === 'checkbox' ? `group-${Date.now()}` : undefined,
    ...additionalConfig,
  };
}

export function alignCheckboxGroup(
  fields: EnhancedField[],
  groupId: string,
  alignment: 'left' | 'center' | 'right' | 'distribute-h' | 'distribute-v'
): EnhancedField[] {
  const groupFields = fields.filter(f => f.groupId === groupId);
  if (groupFields.length < 2) return fields;

  const otherFields = fields.filter(f => f.groupId !== groupId);

  let updatedGroupFields: EnhancedField[];

  switch (alignment) {
    case 'left': {
      const minX = Math.min(...groupFields.map(f => f.x));
      updatedGroupFields = groupFields.map(f => ({ ...f, x: minX }));
      break;
    }
    case 'center': {
      const avgX = groupFields.reduce((sum, f) => sum + f.x + f.width / 2, 0) / groupFields.length;
      updatedGroupFields = groupFields.map(f => ({ ...f, x: avgX - f.width / 2 }));
      break;
    }
    case 'right': {
      const maxX = Math.max(...groupFields.map(f => f.x + f.width));
      updatedGroupFields = groupFields.map(f => ({ ...f, x: maxX - f.width }));
      break;
    }
    case 'distribute-h': {
      const sortedByX = [...groupFields].sort((a, b) => a.x - b.x);
      const minX = sortedByX[0].x;
      const maxX = sortedByX[sortedByX.length - 1].x;
      const spacing = (maxX - minX) / (groupFields.length - 1);
      updatedGroupFields = sortedByX.map((f, i) => ({ ...f, x: minX + spacing * i }));
      break;
    }
    case 'distribute-v': {
      const sortedByY = [...groupFields].sort((a, b) => a.y - b.y);
      const minY = sortedByY[0].y;
      const maxY = sortedByY[sortedByY.length - 1].y;
      const spacing = (maxY - minY) / (groupFields.length - 1);
      updatedGroupFields = sortedByY.map((f, i) => ({ ...f, y: minY + spacing * i }));
      break;
    }
    default:
      updatedGroupFields = groupFields;
  }

  return [...otherFields, ...updatedGroupFields];
}
