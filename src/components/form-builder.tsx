"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  Save,
  Eye,
  Globe,
  Settings,
  Plus,
  Trash2,
  GripVertical,
  Type,
  Mail,
  Phone,
  Hash,
  Calendar,
  CheckSquare,
  Circle,
  List,
  FileText,
  Upload,
  Link2,
  Star,
  MessageSquare,
  MapPin,
  User,
  Building,
  Briefcase,
  AlignLeft,
  ToggleLeft,
  Loader2,
  Copy,
  Code,
  ExternalLink,
  Zap,
} from "lucide-react";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  helpText?: string;
  options?: string[]; // For select, radio, checkbox
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'textarea'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'url'
  | 'rating'
  | 'address'
  | 'name'
  | 'company'
  | 'heading'
  | 'paragraph';

interface FormBuilderProps {
  formId?: string;
  onClose: () => void;
  onSave?: (form: { name: string; description: string; fields: FormField[] }) => void;
}

const FIELD_TYPES = [
  { type: 'heading' as const, label: 'Heading', icon: Type, category: 'layout' },
  { type: 'paragraph' as const, label: 'Paragraph', icon: AlignLeft, category: 'layout' },
  { type: 'text' as const, label: 'Short Text', icon: Type, category: 'basic' },
  { type: 'textarea' as const, label: 'Long Text', icon: MessageSquare, category: 'basic' },
  { type: 'email' as const, label: 'Email', icon: Mail, category: 'basic' },
  { type: 'phone' as const, label: 'Phone', icon: Phone, category: 'basic' },
  { type: 'number' as const, label: 'Number', icon: Hash, category: 'basic' },
  { type: 'date' as const, label: 'Date', icon: Calendar, category: 'basic' },
  { type: 'select' as const, label: 'Dropdown', icon: List, category: 'choice' },
  { type: 'radio' as const, label: 'Single Choice', icon: Circle, category: 'choice' },
  { type: 'checkbox' as const, label: 'Multiple Choice', icon: CheckSquare, category: 'choice' },
  { type: 'file' as const, label: 'File Upload', icon: Upload, category: 'advanced' },
  { type: 'url' as const, label: 'URL', icon: Link2, category: 'advanced' },
  { type: 'rating' as const, label: 'Rating', icon: Star, category: 'advanced' },
  { type: 'name' as const, label: 'Full Name', icon: User, category: 'contact' },
  { type: 'company' as const, label: 'Company', icon: Building, category: 'contact' },
  { type: 'address' as const, label: 'Address', icon: MapPin, category: 'contact' },
];

const generateId = () => `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export function FormBuilder({ formId, onClose, onSave }: FormBuilderProps) {
  const [formName, setFormName] = useState(formId ? 'Client Intake Form' : 'Untitled Form');
  const [formDescription, setFormDescription] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'settings' | 'share'>('build');

  // Drag state
  const [draggedFieldType, setDraggedFieldType] = useState<FieldType | null>(null);

  const addField = (type: FieldType) => {
    const fieldConfig = FIELD_TYPES.find(f => f.type === type);
    const newField: FormField = {
      id: generateId(),
      type,
      label: fieldConfig?.label || 'New Field',
      placeholder: '',
      required: false,
      options: ['select', 'radio', 'checkbox'].includes(type) ? ['Option 1', 'Option 2', 'Option 3'] : undefined,
    };
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFields(newFields);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    onSave?.({ name: formName, description: formDescription, fields });
    setIsSaving(false);
  };

  const handlePublish = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsPublished(true);
    setIsSaving(false);
    setActiveTab('share');
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);

  const getFieldIcon = (type: FieldType) => {
    const config = FIELD_TYPES.find(f => f.type === type);
    return config?.icon || Type;
  };

  const renderFieldPreview = (field: FormField) => {
    const Icon = getFieldIcon(field.type);

    switch (field.type) {
      case 'heading':
        return <h3 className="text-lg font-semibold">{field.label}</h3>;
      case 'paragraph':
        return <p className="text-muted-foreground">{field.label}</p>;
      case 'textarea':
        return (
          <div>
            <Label className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea placeholder={field.placeholder} className="mt-1" disabled />
            {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
          </div>
        );
      case 'select':
        return (
          <div>
            <Label className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <select className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm" disabled>
              <option>{field.placeholder || 'Select an option'}</option>
              {field.options?.map((opt, i) => <option key={i}>{opt}</option>)}
            </select>
            {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
          </div>
        );
      case 'radio':
        return (
          <div>
            <Label className="flex items-center gap-1 mb-2">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <div className="space-y-2">
              {field.options?.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={field.id} disabled className="h-4 w-4" />
                  {opt}
                </label>
              ))}
            </div>
            {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
          </div>
        );
      case 'checkbox':
        return (
          <div>
            <Label className="flex items-center gap-1 mb-2">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <div className="space-y-2">
              {field.options?.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled className="h-4 w-4 rounded" />
                  {opt}
                </label>
              ))}
            </div>
            {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
          </div>
        );
      case 'rating':
        return (
          <div>
            <Label className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} className="h-6 w-6 text-muted-foreground/30" />
              ))}
            </div>
            {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
          </div>
        );
      case 'file':
        return (
          <div>
            <Label className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <div className="mt-1 border-2 border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
              <Upload className="h-6 w-6 mx-auto mb-2" />
              Click or drag to upload
            </div>
            {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
          </div>
        );
      default:
        return (
          <div>
            <Label className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              placeholder={field.placeholder}
              className="mt-1"
              disabled
            />
            {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 h-auto py-0 px-1 w-auto min-w-[200px]"
            />
          </div>
          {isPublished && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
              Published
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={isSaving || fields.length === 0}
            className="bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
            Publish
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30">
        {[
          { id: 'build', label: 'Build', icon: Plus },
          { id: 'settings', label: 'Settings', icon: Settings },
          { id: 'share', label: 'Share', icon: Link2 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'build' && (
          <>
            {/* Left Sidebar - Field Types */}
            <div className="w-64 border-r bg-card p-4 overflow-y-auto">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
                Add Fields
              </h3>

              {/* Layout Fields */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Layout</p>
                <div className="space-y-1">
                  {FIELD_TYPES.filter(f => f.category === 'layout').map(fieldType => (
                    <button
                      key={fieldType.type}
                      onClick={() => addField(fieldType.type)}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                    >
                      <fieldType.icon className="h-4 w-4 text-muted-foreground" />
                      {fieldType.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic Fields */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Basic</p>
                <div className="space-y-1">
                  {FIELD_TYPES.filter(f => f.category === 'basic').map(fieldType => (
                    <button
                      key={fieldType.type}
                      onClick={() => addField(fieldType.type)}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                    >
                      <fieldType.icon className="h-4 w-4 text-muted-foreground" />
                      {fieldType.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Choice Fields */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Choice</p>
                <div className="space-y-1">
                  {FIELD_TYPES.filter(f => f.category === 'choice').map(fieldType => (
                    <button
                      key={fieldType.type}
                      onClick={() => addField(fieldType.type)}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                    >
                      <fieldType.icon className="h-4 w-4 text-muted-foreground" />
                      {fieldType.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact Fields */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Contact Info</p>
                <div className="space-y-1">
                  {FIELD_TYPES.filter(f => f.category === 'contact').map(fieldType => (
                    <button
                      key={fieldType.type}
                      onClick={() => addField(fieldType.type)}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                    >
                      <fieldType.icon className="h-4 w-4 text-muted-foreground" />
                      {fieldType.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Fields */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Advanced</p>
                <div className="space-y-1">
                  {FIELD_TYPES.filter(f => f.category === 'advanced').map(fieldType => (
                    <button
                      key={fieldType.type}
                      onClick={() => addField(fieldType.type)}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                    >
                      <fieldType.icon className="h-4 w-4 text-muted-foreground" />
                      {fieldType.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Center - Form Preview */}
            <div className="flex-1 bg-muted/30 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                {/* Form Header */}
                <Card className="p-6 mb-4">
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 p-0 mb-2"
                    placeholder="Form Title"
                  />
                  <Textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="border-none shadow-none focus-visible:ring-0 p-0 resize-none text-muted-foreground"
                    placeholder="Add a description..."
                    rows={2}
                  />
                </Card>

                {/* Fields */}
                {fields.length === 0 ? (
                  <Card className="p-12 text-center border-2 border-dashed">
                    <div className="w-16 h-16 mx-auto bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center mb-4">
                      <Plus className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Start building your form</h3>
                    <p className="text-muted-foreground mb-4">
                      Click on a field type from the left panel to add it to your form
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <Card
                        key={field.id}
                        className={`p-4 cursor-pointer transition-all ${
                          selectedFieldId === field.id
                            ? 'ring-2 ring-orange-500 shadow-lg'
                            : 'hover:shadow-md'
                        }`}
                        onClick={() => setSelectedFieldId(field.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col gap-1 pt-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); moveField(index, 'up'); }}
                              disabled={index === 0}
                              className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
                            >
                              <ChevronLeft className="h-3 w-3 rotate-90" />
                            </button>
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <button
                              onClick={(e) => { e.stopPropagation(); moveField(index, 'down'); }}
                              disabled={index === fields.length - 1}
                              className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
                            >
                              <ChevronLeft className="h-3 w-3 -rotate-90" />
                            </button>
                          </div>
                          <div className="flex-1">
                            {renderFieldPreview(field)}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                            className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Submit Button Preview */}
                {fields.length > 0 && (
                  <Card className="p-6 mt-4">
                    <Button className="w-full bg-gradient-to-r from-orange-500 to-pink-600" disabled>
                      Submit
                    </Button>
                  </Card>
                )}
              </div>
            </div>

            {/* Right Sidebar - Field Properties */}
            <div className="w-80 border-l bg-card p-4 overflow-y-auto">
              {selectedField ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Field Properties</h3>
                    <Badge variant="secondary" className="text-xs">
                      {FIELD_TYPES.find(f => f.type === selectedField.type)?.label}
                    </Badge>
                  </div>

                  <Separator />

                  {/* Label */}
                  <div>
                    <Label>Label</Label>
                    <Input
                      value={selectedField.label}
                      onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  {/* Placeholder */}
                  {!['heading', 'paragraph', 'radio', 'checkbox', 'rating', 'file'].includes(selectedField.type) && (
                    <div>
                      <Label>Placeholder</Label>
                      <Input
                        value={selectedField.placeholder || ''}
                        onChange={(e) => updateField(selectedField.id, { placeholder: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {/* Help Text */}
                  {!['heading', 'paragraph'].includes(selectedField.type) && (
                    <div>
                      <Label>Help Text</Label>
                      <Input
                        value={selectedField.helpText || ''}
                        onChange={(e) => updateField(selectedField.id, { helpText: e.target.value })}
                        className="mt-1"
                        placeholder="Additional instructions..."
                      />
                    </div>
                  )}

                  {/* Required Toggle */}
                  {!['heading', 'paragraph'].includes(selectedField.type) && (
                    <div className="flex items-center justify-between">
                      <Label>Required</Label>
                      <button
                        onClick={() => updateField(selectedField.id, { required: !selectedField.required })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          selectedField.required ? 'bg-orange-500' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            selectedField.required ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {/* Options for choice fields */}
                  {['select', 'radio', 'checkbox'].includes(selectedField.type) && (
                    <div>
                      <Label>Options</Label>
                      <div className="mt-2 space-y-2">
                        {selectedField.options?.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const newOptions = [...(selectedField.options || [])];
                                newOptions[i] = e.target.value;
                                updateField(selectedField.id, { options: newOptions });
                              }}
                              className="flex-1"
                            />
                            <button
                              onClick={() => {
                                const newOptions = selectedField.options?.filter((_, idx) => idx !== i);
                                updateField(selectedField.id, { options: newOptions });
                              }}
                              className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            const newOptions = [...(selectedField.options || []), `Option ${(selectedField.options?.length || 0) + 1}`];
                            updateField(selectedField.id, { options: newOptions });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Option
                        </Button>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => deleteField(selectedField.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Field
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center mb-3">
                    <Settings className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select a field to edit its properties
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-6">
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Form Settings</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Form Name</Label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4">Submission Settings</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Collect email addresses</p>
                      <p className="text-sm text-muted-foreground">Require respondents to enter email</p>
                    </div>
                    <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Confirmation message</p>
                      <p className="text-sm text-muted-foreground">Show message after submission</p>
                    </div>
                    <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'share' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-6">
              {isPublished ? (
                <>
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                        <Globe className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Your form is live!</h3>
                        <p className="text-sm text-muted-foreground">Share it with the world</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <code className="flex-1 text-sm truncate">
                        https://forms.pearsign.com/f/{formName.toLowerCase().replace(/\s+/g, '-')}
                      </code>
                      <Button variant="outline" size="sm">
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="font-semibold mb-4">Embed Code</h3>
                    <div className="p-3 bg-muted rounded-lg mb-3">
                      <code className="text-xs text-muted-foreground break-all">
                        {`<iframe src="https://forms.pearsign.com/f/${formName.toLowerCase().replace(/\s+/g, '-')}" width="100%" height="600" frameborder="0"></iframe>`}
                      </code>
                    </div>
                    <Button variant="outline" size="sm">
                      <Code className="h-4 w-4 mr-1" />
                      Copy Embed Code
                    </Button>
                  </Card>

                  <Card className="p-6">
                    <h3 className="font-semibold mb-4">Share Options</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline">
                        <Mail className="h-4 w-4 mr-2" />
                        Email Link
                      </Button>
                      <Button variant="outline">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Form
                      </Button>
                    </div>
                  </Card>
                </>
              ) : (
                <Card className="p-12 text-center">
                  <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
                    <Globe className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Publish to share</h3>
                  <p className="text-muted-foreground mb-4">
                    Your form needs to be published before you can share it
                  </p>
                  <Button
                    onClick={handlePublish}
                    disabled={fields.length === 0}
                    className="bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700"
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Publish Form
                  </Button>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
