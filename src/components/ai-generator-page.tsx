"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Send,
  Sparkles,
  FileText,
  Loader2,
  Download,
  Bot,
  User,
  Check,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  FileSignature,
  Shield,
  Briefcase,
  Handshake,
  Building2,
  Users,
  Scale,
  Copy,
  Wand2,
  MessageSquare,
  Zap,
  PenTool,
  Gavel,
  ScrollText,
  FileCheck,
  Car,
  X,
  FileType,
  Settings,
  AlertCircle,
  Upload,
  FolderOpen,
  Star,
  Clock,
  TrendingUp,
  BarChart3,
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  Eye,
  LayoutGrid,
  BookOpen,
  FileUp,
  FilePlus,
  Globe,
  Lock,
  Hash,
  CheckCircle2,
  ArrowUpRight,
  Layers,
  Palette,
  RefreshCw,
  Mic,
  MessageCircle,
  ArrowDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { generateDocument as generateDocumentFromTemplate } from "@/lib/document-templates";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface DocumentType {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  category: string;
  questions: string[];
  color: string;
  popularity: number;
}

const DOCUMENT_TYPES: DocumentType[] = [
  {
    id: "nda",
    name: "Non-Disclosure Agreement",
    description: "Protect confidential information shared between parties",
    icon: Shield,
    category: "Confidentiality",
    questions: [
      "What is the name of the disclosing party (the one sharing confidential information)?",
      "What is the name of the receiving party?",
      "What type of confidential information will be shared?",
      "How long should the confidentiality obligation last?",
    ],
    color: "from-blue-500 to-indigo-600",
    popularity: 95,
  },
  {
    id: "service",
    name: "Service Agreement",
    description: "Define terms for professional services between parties",
    icon: Briefcase,
    category: "Services",
    questions: [
      "What is the name of the service provider?",
      "What is the name of the client?",
      "What services will be provided?",
      "What is the payment amount and schedule?",
    ],
    color: "from-emerald-500 to-teal-600",
    popularity: 88,
  },
  {
    id: "employment",
    name: "Employment Contract",
    description: "Establish employment terms and conditions",
    icon: Users,
    category: "Employment",
    questions: [
      "What is the employer's company name?",
      "What is the employee's full name?",
      "What is the job title and responsibilities?",
      "What is the salary and benefits package?",
    ],
    color: "from-violet-500 to-purple-600",
    popularity: 92,
  },
  {
    id: "partnership",
    name: "Partnership Agreement",
    description: "Define partnership terms and profit sharing",
    icon: Handshake,
    category: "Business",
    questions: [
      "What are the names of all partners?",
      "What is the nature of the business?",
      "How will profits and losses be shared?",
      "What are each partner's responsibilities?",
    ],
    color: "from-amber-500 to-orange-600",
    popularity: 74,
  },
  {
    id: "rental",
    name: "Rental/Lease Agreement",
    description: "Terms for renting property or equipment",
    icon: Building2,
    category: "Property",
    questions: [
      "What is the landlord's name?",
      "What is the tenant's name?",
      "What is the property address?",
      "What is the monthly rent and lease duration?",
    ],
    color: "from-rose-500 to-pink-600",
    popularity: 81,
  },
  {
    id: "consulting",
    name: "Consulting Agreement",
    description: "Terms for consulting or advisory services",
    icon: Scale,
    category: "Services",
    questions: [
      "What is the consultant's name or company?",
      "What is the client's name?",
      "What consulting services will be provided?",
      "What is the project timeline and deliverables?",
    ],
    color: "from-cyan-500 to-blue-600",
    popularity: 79,
  },
  {
    id: "poa",
    name: "Power of Attorney",
    description: "Authorize someone to act on your behalf",
    icon: Gavel,
    category: "Legal",
    questions: [
      "What is the principal's full legal name (person granting power)?",
      "What is the agent's full legal name (person receiving power)?",
      "What specific powers are being granted?",
      "Is this a durable power of attorney (remains valid if principal becomes incapacitated)?",
    ],
    color: "from-slate-500 to-gray-700",
    popularity: 65,
  },
  {
    id: "tos",
    name: "Terms of Service",
    description: "Terms and conditions for using a service or website",
    icon: ScrollText,
    category: "Legal",
    questions: [
      "What is the company or website name?",
      "What type of service or product do you offer?",
      "What are the key user obligations and restrictions?",
      "What is your liability limitation policy?",
    ],
    color: "from-teal-500 to-emerald-600",
    popularity: 71,
  },
  {
    id: "privacy",
    name: "Privacy Policy",
    description: "How you collect, use, and protect user data",
    icon: FileCheck,
    category: "Legal",
    questions: [
      "What is the company or website name?",
      "What personal data do you collect from users?",
      "How is the data used and stored?",
      "Do you share data with third parties?",
    ],
    color: "from-green-500 to-emerald-600",
    popularity: 69,
  },
  {
    id: "vehicle",
    name: "Vehicle Sale Agreement",
    description: "Terms for selling or buying a vehicle",
    icon: Car,
    category: "Property",
    questions: [
      "What is the seller's full name?",
      "What is the buyer's full name?",
      "What is the vehicle make, model, year, and VIN?",
      "What is the sale price and payment terms?",
    ],
    color: "from-orange-500 to-red-600",
    popularity: 58,
  },
];

const CATEGORIES = ["All", "Confidentiality", "Services", "Employment", "Business", "Property", "Legal"];

type Step = "hub" | "select-type" | "questionnaire" | "generating" | "chat" | "ai-chat";
type HubTab = "overview" | "create" | "templates" | "upload";

interface AIGeneratorPageProps {
  onSendForSignature?: (documentContent: string, documentTitle: string) => void;
}

interface RecentActivity {
  id: string;
  type: "created" | "signed" | "downloaded" | "shared";
  documentName: string;
  timestamp: string;
  icon: React.ElementType;
  color: string;
}

export function AIGeneratorPage({ onSendForSignature }: AIGeneratorPageProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("hub");
  const [hubTab, setHubTab] = useState<HubTab>("overview");
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedDocument, setGeneratedDocument] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("All");
  const [templateView, setTemplateView] = useState<"grid" | "list">("grid");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("doc-center-favorites");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    }
    return new Set<string>();
  });

  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: number; type: string; uploadedAt: Date }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [documentTitle, setDocumentTitle] = useState<string>("Untitled Document");

  useEffect(() => {
    const checkAIConfig = async () => {
      try {
        const response = await fetch('/api/ai/generate-document', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await response.json();
        if (data.success) {
          setAiConfigured(data.configured);
          setAiProvider(data.provider);
        }
      } catch (error) {
        console.error('Failed to check AI config:', error);
        setAiConfigured(false);
      }
    };
    checkAIConfig();
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("doc-center-favorites", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSelectType = (type: DocumentType) => {
    setSelectedType(type);
    setQuestionAnswers({});
    setCurrentQuestionIndex(0);
    setStep("questionnaire");
  };

  const handleAnswerQuestion = () => {
    if (!selectedType) return;
    const currentQuestion = selectedType.questions[currentQuestionIndex];
    const answer = questionAnswers[currentQuestion];

    if (!answer?.trim()) {
      toast({
        title: "Please provide an answer",
        description: "This field is required to generate your document.",
        variant: "destructive",
      });
      return;
    }

    if (currentQuestionIndex < selectedType.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      generateDocument();
    }
  };

  const generateDocument = async () => {
    if (!selectedType) return;
    setStep("generating");
    setIsLoading(true);

    let docContent: string;

    if (aiConfigured) {
      try {
        const response = await fetch('/api/ai/generate-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            documentType: selectedType.id,
            documentName: selectedType.name,
            answers: questionAnswers,
          }),
        });

        const data = await response.json();

        if (data.success && data.content) {
          docContent = data.content;
          toast({
            title: `Generated with ${data.provider === 'openai' ? 'OpenAI' : 'Claude'}`,
            description: `Using ${data.model} model`,
          });
        } else if (data.error === 'NO_AI_CONFIGURED') {
          docContent = generateDemoDocument(selectedType, questionAnswers);
        } else {
          throw new Error(data.error || 'AI generation failed');
        }
      } catch (error) {
        console.error('AI generation error:', error);
        docContent = generateDemoDocument(selectedType, questionAnswers);
        toast({
          title: "Using template generation",
          description: "AI generation failed, using built-in template instead.",
          variant: "destructive",
        });
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 1500));
      docContent = generateDemoDocument(selectedType, questionAnswers);
    }

    setGeneratedDocument(docContent);

    const aiNote = aiConfigured && aiProvider
      ? `\n\n*Generated using ${aiProvider === 'openai' ? 'OpenAI GPT-4' : 'Anthropic Claude'}*`
      : '';

    setMessages([
      {
        id: "1",
        role: "assistant",
        content: `I've generated your ${selectedType.name} based on the information you provided. You can review the document on the right, or ask me to make any changes. For example, you can say:\n\n- "Add a clause about intellectual property"\n- "Change the duration to 2 years"\n- "Make the language more formal"${aiNote}`,
        timestamp: new Date(),
      },
    ]);

    setIsLoading(false);
    setStep("chat");
  };

  const generateDemoDocument = (type: DocumentType, answers: Record<string, string>): string => {
    return generateDocumentFromTemplate(type.id, answers);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !selectedType) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const userRequest = input;
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/modify-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentDocument: generatedDocument,
          userRequest,
          documentType: selectedType.id,
          documentName: selectedType.name,
        }),
      });

      const data = await response.json();

      if (data.success && data.document) {
        setGeneratedDocument(data.document);

        const aiNote = data.usedAI && data.provider
          ? `\n\n*Modified using ${data.provider === 'openai' ? 'OpenAI' : 'Claude'}*`
          : '';

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `${data.description}. The document has been updated - you can see the changes in the preview on the right.${aiNote}\n\nWould you like any other modifications?`,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, assistantMessage]);
        toast({ title: "Document updated", description: data.description });
      } else {
        throw new Error(data.error || 'Failed to modify document');
      }
    } catch (error) {
      console.error('Modification error:', error);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I encountered an issue while trying to modify the document. Please try again or make the changes manually in the document editor.\n\nIf this issue persists, please check your AI integration settings.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      toast({ title: "Modification failed", description: "Unable to modify document. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStreamChat = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = input;
    setInput("");
    setIsLoading(true);
    setIsStreaming(true);

    const assistantMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    }]);

    try {
      const allMessages = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: allMessages,
          currentDocument: generatedDocument || undefined,
          documentType: selectedType?.id || documentTitle,
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullContent += data.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantMessageId ? { ...m, content: fullContent } : m
              ));
            }
            if (data.done) break;
            if (data.error) throw new Error(data.error);
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }

      const docMatch = fullContent.match(/<document>([\s\S]*?)<\/document>/);
      if (docMatch) {
        const docContent = docMatch[1].trim();
        setGeneratedDocument(docContent);
        const firstLine = docContent.split('\n')[0].replace(/^[#\s*]+/, '').trim();
        if (firstLine) {
          setDocumentTitle(firstLine.substring(0, 100));
        }
        const cleanContent = fullContent
          .replace(/<document>[\s\S]*?<\/document>/, '')
          .trim();
        if (cleanContent) {
          setMessages(prev => prev.map(m =>
            m.id === assistantMessageId ? { ...m, content: cleanContent } : m
          ));
        }
      }
    } catch (error) {
      console.error('Stream chat error:', error);
      setMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? { ...m, content: m.content || "I'm sorry, I encountered an issue. Please try again." }
          : m
      ));
      toast({
        title: "Chat error",
        description: "Failed to get a response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleCopyDocument = () => {
    navigator.clipboard.writeText(generatedDocument);
    toast({ title: "Copied to clipboard", description: "Document content has been copied." });
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([generatedDocument], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(selectedType?.name || documentTitle).toLowerCase().replace(/ /g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Download started", description: "Your document is being downloaded as text." });
  };

  const handleDownloadDocx = async () => {
    if ((!selectedType && !documentTitle) || !generatedDocument) return;
    setIsDownloadingDocx(true);
    try {
      const docName = selectedType?.name || documentTitle;
      const response = await fetch('/api/documents/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: generatedDocument, title: docName }),
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docName.toLowerCase().replace(/ /g, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Word document downloaded", description: "Your document has been exported as a Word file." });
    } catch (error) {
      console.error('DOCX export error:', error);
      toast({ title: "Export failed", description: "Failed to export as Word document. Try downloading as text instead.", variant: "destructive" });
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  const handleDownloadPdf = async () => {
    if ((!selectedType && !documentTitle) || !generatedDocument) return;
    setIsDownloadingPdf(true);
    try {
      const docName = selectedType?.name || documentTitle;
      const { contentToPdf } = await import('@/lib/html-to-pdf');
      const pdfBytes = await contentToPdf(generatedDocument, docName);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docName.toLowerCase().replace(/ /g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF downloaded", description: "Your document has been exported as a PDF file." });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({ title: "Export failed", description: "Failed to export as PDF. Try downloading as text instead.", variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleStartOver = () => {
    setStep("hub");
    setSelectedType(null);
    setQuestionAnswers({});
    setCurrentQuestionIndex(0);
    setMessages([]);
    setGeneratedDocument("");
  };

  const handleFileUpload = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f =>
      f.type === 'application/pdf' ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.type === 'application/msword' ||
      f.type === 'text/plain'
    );

    if (validFiles.length === 0) {
      toast({ title: "Invalid file type", description: "Please upload PDF, Word, or text files.", variant: "destructive" });
      return;
    }

    const newFiles = validFiles.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type,
      uploadedAt: new Date(),
    }));

    setUploadedFiles(prev => [...newFiles, ...prev]);
    toast({ title: `${validFiles.length} file${validFiles.length > 1 ? 's' : ''} uploaded`, description: "Files are ready for processing." });
  }, [toast]);

  const filteredTemplates = DOCUMENT_TYPES.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.description.toLowerCase().includes(templateSearch.toLowerCase());
    const matchesCategory = templateCategory === "All" || t.category === templateCategory;
    return matchesSearch && matchesCategory;
  });

  const recentActivity: RecentActivity[] = [
    { id: "1", type: "created", documentName: "Service Agreement - Acme Corp", timestamp: "2 hours ago", icon: FilePlus, color: "text-emerald-500" },
    { id: "2", type: "signed", documentName: "NDA - TechVentures", timestamp: "5 hours ago", icon: FileSignature, color: "text-blue-500" },
    { id: "3", type: "downloaded", documentName: "Employment Contract - J. Smith", timestamp: "1 day ago", icon: Download, color: "text-violet-500" },
    { id: "4", type: "shared", documentName: "Partnership Agreement", timestamp: "2 days ago", icon: Send, color: "text-amber-500" },
    { id: "5", type: "created", documentName: "Consulting Agreement - Global Inc", timestamp: "3 days ago", icon: FilePlus, color: "text-emerald-500" },
  ];

  if (step === "hub") {
    return (
      <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-document-center-title">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              Document Center
            </h1>
            <p className="text-xs sm:text-base text-muted-foreground mt-1">
              Create, manage, and organize your documents
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {aiConfigured !== null && (
              <Badge
                variant={aiConfigured ? "default" : "secondary"}
                className={cn(
                  "text-xs",
                  aiConfigured
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                )}
                data-testid="badge-ai-status"
              >
                {aiConfigured ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    {aiProvider === 'openai' ? 'OpenAI' : aiProvider === 'anthropic' ? 'Claude' : 'AI'} Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Using Templates
                  </>
                )}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMessages([]);
                setGeneratedDocument("");
                setDocumentTitle("Untitled Document");
                setInput("");
                setStep("ai-chat");
              }}
              data-testid="button-ai-assistant"
            >
              <MessageCircle className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">AI Assistant</span>
            </Button>
            <Button
              size="sm"
              onClick={() => { setHubTab("create"); }}
              className="bg-[hsl(var(--pearsign-primary))]"
              data-testid="button-new-document"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Document</span>
            </Button>
          </div>
        </div>

        <Tabs value={hubTab} onValueChange={(v) => setHubTab(v as HubTab)} className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-document-center">
            <TabsTrigger value="overview" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-1 sm:px-3" data-testid="tab-overview">
              <LayoutGrid className="h-4 w-4 hidden sm:block" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-1 sm:px-3" data-testid="tab-create">
              <Wand2 className="h-4 w-4 hidden sm:block" />
              Create
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-1 sm:px-3" data-testid="tab-templates">
              <BookOpen className="h-4 w-4 hidden sm:block" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-1 sm:px-3" data-testid="tab-upload">
              <Upload className="h-4 w-4 hidden sm:block" />
              Upload
            </TabsTrigger>
          </TabsList>

          {/* ======================== OVERVIEW TAB ======================== */}
          <TabsContent value="overview" className="space-y-4 sm:space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              <Card className="p-3 sm:p-5" data-testid="card-stat-created">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] sm:text-xs bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 hidden sm:flex">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +12%
                  </Badge>
                </div>
                <p className="text-xl sm:text-2xl font-bold">24</p>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Documents Created</p>
              </Card>
              <Card className="p-3 sm:p-5" data-testid="card-stat-signed">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] sm:text-xs bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 hidden sm:flex">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +8%
                  </Badge>
                </div>
                <p className="text-xl sm:text-2xl font-bold">18</p>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Signed This Month</p>
              </Card>
              <Card className="p-3 sm:p-5" data-testid="card-stat-templates">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-violet-500" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-bold">{DOCUMENT_TYPES.length}</p>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Templates Available</p>
              </Card>
              <Card className="p-3 sm:p-5" data-testid="card-stat-favorites">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Star className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-bold">{favorites.size}</p>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Favorite Templates</p>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Quick Actions */}
              <div className="lg:col-span-1 space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
                <div className="space-y-2">
                  <Card
                    className="p-4 cursor-pointer hover-elevate transition-all group"
                    onClick={() => setHubTab("create")}
                    data-testid="card-action-create"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                        <Wand2 className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">Create with AI</p>
                        <p className="text-xs text-muted-foreground">Generate a document using AI</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Card>
                  <Card
                    className="p-4 cursor-pointer hover-elevate transition-all group"
                    onClick={() => setHubTab("upload")}
                    data-testid="card-action-upload"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <FileUp className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">Upload Document</p>
                        <p className="text-xs text-muted-foreground">Import PDF, Word, or text files</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Card>
                  <Card
                    className="p-4 cursor-pointer hover-elevate transition-all group"
                    onClick={() => setHubTab("templates")}
                    data-testid="card-action-browse"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">Browse Templates</p>
                        <p className="text-xs text-muted-foreground">{DOCUMENT_TYPES.length} professional templates</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Card>
                  <Card
                    className="p-4 cursor-pointer hover-elevate transition-all group"
                    onClick={() => {
                      setMessages([]);
                      setGeneratedDocument("");
                      setDocumentTitle("Untitled Document");
                      setInput("");
                      setStep("ai-chat");
                    }}
                    data-testid="card-action-assistant"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                        <MessageCircle className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">AI Assistant</p>
                        <p className="text-xs text-muted-foreground">Chat to build any document</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Card>
                  {!aiConfigured && aiConfigured !== null && (
                    <Card
                      className="p-4 cursor-pointer hover-elevate transition-all group border-amber-200 dark:border-amber-800"
                      onClick={() => { window.location.href = '/?tab=integrations'; }}
                      data-testid="card-action-connect-ai"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                          <Settings className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">Connect AI Provider</p>
                          <p className="text-xs text-muted-foreground">Enable AI-powered generation</p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
                      </div>
                    </Card>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Recent Activity</h3>
                </div>
                <Card className="divide-y divide-border" data-testid="card-recent-activity">
                  {recentActivity.map((activity) => {
                    const ActivityIcon = activity.icon;
                    return (
                      <div key={activity.id} className="flex items-center gap-4 p-4 hover-elevate">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-muted")}>
                          <ActivityIcon className={cn("h-4 w-4", activity.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{activity.documentName}</p>
                          <p className="text-xs text-muted-foreground capitalize">{activity.type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.timestamp}</span>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            </div>

            {/* Popular Templates Row */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Popular Templates</h3>
                <Button variant="ghost" size="sm" onClick={() => setHubTab("templates")} data-testid="button-view-all-templates">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {DOCUMENT_TYPES.slice(0, 3).map((type) => {
                  const Icon = type.icon;
                  return (
                    <Card
                      key={type.id}
                      className="overflow-hidden cursor-pointer hover-elevate group"
                      onClick={() => handleSelectType(type)}
                      data-testid={`card-popular-template-${type.id}`}
                    >
                      <div className={cn("h-2 bg-gradient-to-r", type.color)} />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className={cn("w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center", type.color)}>
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(type.id); }}
                            className="p-1"
                            data-testid={`button-favorite-${type.id}`}
                          >
                            <Star className={cn("h-4 w-4 transition-colors", favorites.has(type.id) ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                          </button>
                        </div>
                        <h4 className="font-semibold text-sm mb-1">{type.name}</h4>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{type.description}</p>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs">{type.category}</Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <BarChart3 className="h-3 w-3" />
                            {type.popularity}% popular
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ======================== CREATE TAB ======================== */}
          <TabsContent value="create" className="space-y-4 sm:space-y-6">
            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 sm:p-8 md:p-10">
              <div className="absolute top-0 right-0 w-48 sm:w-96 h-48 sm:h-96 bg-[hsl(var(--pearsign-primary))]/20 rounded-full blur-[80px] sm:blur-[120px]" />
              <div className="absolute bottom-0 left-1/4 w-32 sm:w-64 h-32 sm:h-64 bg-violet-500/20 rounded-full blur-[60px] sm:blur-[100px]" />
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
                <div className="max-w-xl">
                  <Badge className="mb-2 sm:mb-3 bg-white/10 text-white/90 border-white/20 text-[10px] sm:text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI-Powered Generation
                  </Badge>
                  <h2 className="text-lg sm:text-2xl md:text-3xl font-bold text-white mb-1 sm:mb-2">
                    Create a Professional Document
                  </h2>
                  <p className="text-white/60 text-xs sm:text-sm md:text-base">
                    Choose a template below and answer a few questions. Our AI will generate a complete, legally-sound document ready for signature.
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="text-center p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 min-w-[64px] sm:min-w-[80px]">
                    <p className="text-lg sm:text-2xl font-bold text-white">{DOCUMENT_TYPES.length}</p>
                    <p className="text-[10px] sm:text-xs text-white/50">Templates</p>
                  </div>
                  <div className="text-center p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 min-w-[64px] sm:min-w-[80px]">
                    <p className="text-lg sm:text-2xl font-bold text-white">{CATEGORIES.length - 1}</p>
                    <p className="text-[10px] sm:text-xs text-white/50">Categories</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Template Selection Grid */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h3 className="font-semibold text-sm sm:text-base">Select Document Type</h3>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <Button
                      key={cat}
                      variant={templateCategory === cat ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTemplateCategory(cat)}
                      className={cn("text-xs sm:text-sm h-7 sm:h-8 px-2 sm:px-3", templateCategory === cat && "bg-[hsl(var(--pearsign-primary))]")}
                      data-testid={`button-category-${cat.toLowerCase()}`}
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((type) => {
                  const Icon = type.icon;
                  return (
                    <Card
                      key={type.id}
                      className="overflow-hidden cursor-pointer hover-elevate group"
                      onClick={() => handleSelectType(type)}
                      data-testid={`card-template-${type.id}`}
                    >
                      <div className={cn("h-1.5 bg-gradient-to-r", type.color)} />
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0", type.color)}>
                            <Icon className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <h4 className="font-semibold text-sm">{type.name}</h4>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{type.description}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{type.category}</Badge>
                              <span className="text-xs text-muted-foreground">{type.questions.length} questions</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No templates found for this category.</p>
                  <Button variant="ghost" size="sm" onClick={() => setTemplateCategory("All")} className="mt-2">
                    Show all templates
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ======================== TEMPLATES TAB ======================== */}
          <TabsContent value="templates" className="space-y-4 sm:space-y-6">
            {/* Search & Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-template-search"
                />
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="default" data-testid="button-filter-category">
                      <Filter className="h-4 w-4 mr-2" />
                      {templateCategory}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {CATEGORIES.map(cat => (
                      <DropdownMenuItem key={cat} onClick={() => setTemplateCategory(cat)}>
                        {cat}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex items-center border rounded-md">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("rounded-r-none", templateView === "grid" && "bg-muted")}
                    onClick={() => setTemplateView("grid")}
                    data-testid="button-view-grid"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("rounded-l-none", templateView === "list" && "bg-muted")}
                    onClick={() => setTemplateView("list")}
                    data-testid="button-view-list"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Favorites Section */}
            {favorites.size > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
                  Favorites
                </h3>
                <div className={cn(
                  templateView === "grid"
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                    : "space-y-2"
                )}>
                  {DOCUMENT_TYPES.filter(t => favorites.has(t.id)).map((type) => (
                    <TemplateCard
                      key={type.id}
                      type={type}
                      view={templateView}
                      isFavorite={true}
                      onSelect={handleSelectType}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Templates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  {templateCategory === "All" ? "All Templates" : templateCategory}
                  <span className="text-muted-foreground font-normal ml-2">({filteredTemplates.length})</span>
                </h3>
              </div>
              <div className={cn(
                templateView === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  : "space-y-2"
              )}>
                {filteredTemplates.map((type) => (
                  <TemplateCard
                    key={type.id}
                    type={type}
                    view={templateView}
                    isFavorite={favorites.has(type.id)}
                    onSelect={handleSelectType}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>

              {filteredTemplates.length === 0 && (
                <div className="text-center py-16">
                  <Search className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                  <p className="font-medium mb-1">No templates found</p>
                  <p className="text-sm text-muted-foreground mb-4">Try adjusting your search or filter criteria</p>
                  <Button variant="outline" onClick={() => { setTemplateSearch(""); setTemplateCategory("All"); }}>
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ======================== UPLOAD TAB ======================== */}
          <TabsContent value="upload" className="space-y-4 sm:space-y-6">
            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
              {/* Upload Zone */}
              <div
                className={cn(
                  "relative border-2 border-dashed rounded-xl sm:rounded-2xl p-6 sm:p-12 text-center transition-all cursor-pointer",
                  uploadDragging
                    ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5 scale-[1.02]"
                    : "border-muted-foreground/25 hover:border-[hsl(var(--pearsign-primary))]/50 hover:bg-muted/30"
                )}
                onDragEnter={(e) => { e.preventDefault(); setUploadDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setUploadDragging(false); }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setUploadDragging(false);
                  handleFileUpload(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-upload"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) handleFileUpload(e.target.files);
                  }}
                  data-testid="input-file-upload"
                />
                <div className={cn(
                  "w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-colors",
                  uploadDragging
                    ? "bg-[hsl(var(--pearsign-primary))]/20"
                    : "bg-muted"
                )}>
                  <Upload className={cn(
                    "h-8 w-8 transition-colors",
                    uploadDragging ? "text-[hsl(var(--pearsign-primary))]" : "text-muted-foreground"
                  )} />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {uploadDragging ? "Drop files here" : "Upload Documents"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Drag and drop your files here, or click to browse
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Badge variant="secondary" className="text-xs gap-1">
                    <FileText className="h-3 w-3" />
                    PDF
                  </Badge>
                  <Badge variant="secondary" className="text-xs gap-1">
                    <FileType className="h-3 w-3" />
                    Word (.docx)
                  </Badge>
                  <Badge variant="secondary" className="text-xs gap-1">
                    <FileText className="h-3 w-3" />
                    Plain Text
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Max file size: 25 MB per file
                </p>
              </div>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Uploaded Files ({uploadedFiles.length})</h3>
                    <Button variant="ghost" size="sm" onClick={() => setUploadedFiles([])} data-testid="button-clear-uploads">
                      Clear All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {uploadedFiles.map((file, idx) => (
                      <Card key={idx} className="p-4" data-testid={`card-uploaded-file-${idx}`}>
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            file.type.includes('pdf') ? "bg-red-100 dark:bg-red-900/30" :
                            file.type.includes('word') ? "bg-blue-100 dark:bg-blue-900/30" :
                            "bg-gray-100 dark:bg-gray-800"
                          )}>
                            <FileText className={cn(
                              "h-5 w-5",
                              file.type.includes('pdf') ? "text-red-600 dark:text-red-400" :
                              file.type.includes('word') ? "text-blue-600 dark:text-blue-400" :
                              "text-gray-600 dark:text-gray-400"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              <Check className="h-3 w-3 mr-1" />
                              Uploaded
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                              data-testid={`button-remove-file-${idx}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button variant="outline" data-testid="button-send-uploaded-for-signing">
                      <FileSignature className="h-4 w-4 mr-2" />
                      Send for Signature
                    </Button>
                  </div>
                </div>
              )}

              {/* Upload Tips */}
              <Card className="p-5 bg-muted/30">
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Upload Tips
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">Uploaded PDFs can be sent directly for signature</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">Word documents are converted to PDF automatically</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">Add signature fields after uploading</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">All documents are encrypted at rest</p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  /* ======================== QUESTIONNAIRE STEP ======================== */
  if (step === "questionnaire" && selectedType) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleStartOver} data-testid="button-back-to-hub">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{selectedType.name}</h1>
              <p className="text-sm text-muted-foreground">
                Question {currentQuestionIndex + 1} of {selectedType.questions.length}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">{selectedType.category}</Badge>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 order-2 lg:order-1">
              <Card className="p-5 sticky top-4">
                <div className="flex items-center gap-3 pb-4 border-b border-border mb-4">
                  <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center", selectedType.color)}>
                    <selectedType.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{selectedType.name}</h3>
                    <p className="text-xs text-muted-foreground">{selectedType.category}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  {selectedType.questions.map((question, index) => {
                    const isCompleted = index < currentQuestionIndex || (index === currentQuestionIndex && questionAnswers[question]?.trim());
                    const isCurrent = index === currentQuestionIndex;
                    const isUpcoming = index > currentQuestionIndex;

                    return (
                      <button
                        key={index}
                        onClick={() => { if (index <= currentQuestionIndex) setCurrentQuestionIndex(index); }}
                        disabled={isUpcoming}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all",
                          isCurrent && "bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-200 dark:ring-blue-800",
                          isCompleted && !isCurrent && "hover:bg-muted/50 cursor-pointer",
                          isUpcoming && "opacity-50 cursor-not-allowed"
                        )}
                        data-testid={`button-question-step-${index}`}
                      >
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all",
                          isCurrent && "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900",
                          isCompleted && !isCurrent && "bg-emerald-500 text-white",
                          isUpcoming && "bg-muted text-muted-foreground border border-border"
                        )}>
                          {isCompleted && !isCurrent ? <Check className="h-4 w-4" /> : index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm line-clamp-2",
                            isCurrent && "font-medium text-blue-900 dark:text-blue-100",
                            isCompleted && !isCurrent && "text-foreground",
                            isUpcoming && "text-muted-foreground"
                          )}>{question}</p>
                          {isCompleted && questionAnswers[question] && !isCurrent && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{questionAnswers[question]}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>Progress</span>
                    <span className="font-medium text-foreground">{currentQuestionIndex + 1} / {selectedType.questions.length}</span>
                  </div>
                  <Progress value={((currentQuestionIndex + 1) / selectedType.questions.length) * 100} className="h-2" />
                </div>
              </Card>
            </div>

            <div className="lg:col-span-8 order-1 lg:order-2">
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 px-6 py-4 border-b border-blue-100 dark:border-blue-900">
                  <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                    <FileText className="h-3.5 w-3.5" />
                    Question {currentQuestionIndex + 1} of {selectedType.questions.length}
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {selectedType.questions[currentQuestionIndex]}
                  </h2>
                </div>

                <div className="p-6">
                  <Textarea
                    value={questionAnswers[selectedType.questions[currentQuestionIndex]] || ""}
                    onChange={(e) =>
                      setQuestionAnswers({
                        ...questionAnswers,
                        [selectedType.questions[currentQuestionIndex]]: e.target.value,
                      })
                    }
                    placeholder="Type your answer here..."
                    className="min-h-[180px] text-base resize-none border-2 focus:border-blue-500 focus:ring-0 rounded-xl transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.metaKey) handleAnswerQuestion();
                    }}
                    autoFocus
                    data-testid="textarea-answer"
                  />

                  <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
                      <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Tip</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        {currentQuestionIndex === 0 && "Include the full legal name as it should appear on the document."}
                        {currentQuestionIndex === 1 && "Make sure to include the complete legal name of the other party."}
                        {currentQuestionIndex === 2 && "Be specific - the more detail you provide, the better your document will be."}
                        {currentQuestionIndex === 3 && "Consider standard terms (e.g., '2 years', '$5,000/month') for clarity."}
                        {currentQuestionIndex > 3 && "Provide clear, specific information for accurate document generation."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-muted/30 border-t flex items-center justify-between">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (currentQuestionIndex > 0) setCurrentQuestionIndex(prev => prev - 1);
                      else setStep("hub");
                    }}
                    className="gap-2"
                    data-testid="button-previous-question"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {currentQuestionIndex > 0 ? 'Previous' : 'Back'}
                  </Button>

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                      <kbd className="px-2 py-1 rounded bg-muted border text-xs font-mono">Cmd</kbd>
                      <span>+</span>
                      <kbd className="px-2 py-1 rounded bg-muted border text-xs font-mono">Enter</kbd>
                    </div>
                    <Button
                      onClick={handleAnswerQuestion}
                      size="lg"
                      className="gap-2 px-6 bg-[hsl(var(--pearsign-primary))]"
                      data-testid="button-next-question"
                    >
                      {currentQuestionIndex < selectedType.questions.length - 1 ? (
                        <>Continue <ArrowRight className="h-4 w-4" /></>
                      ) : (
                        <>Generate Document <Sparkles className="h-4 w-4" /></>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ======================== GENERATING STEP ======================== */
  if (step === "generating") {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center space-y-6">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full bg-[hsl(var(--pearsign-primary))]/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-[hsl(var(--pearsign-primary))] animate-spin" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-xl mb-2">Generating your document...</h3>
            <p className="text-muted-foreground">
              {aiConfigured ? "AI is crafting your document" : "Building from professional template"}
            </p>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Analyzing requirements
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: "0.5s" }} />
              Structuring clauses
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" style={{ animationDelay: "1s" }} />
              Formatting document
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ======================== CHAT + PREVIEW STEP ======================== */
  if (step === "chat") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleStartOver} data-testid="button-back-from-chat">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{selectedType?.name}</h1>
              <p className="text-sm text-muted-foreground">Review and refine with AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCopyDocument} title="Copy to clipboard" data-testid="button-copy-doc">
              <Copy className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default" data-testid="button-download-menu">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleDownloadDocx} disabled={isDownloadingDocx} data-testid="button-download-docx">
                  {isDownloadingDocx ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileType className="h-4 w-4 mr-2 text-blue-600" />}
                  <span>Word (.docx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadPdf} disabled={isDownloadingPdf} data-testid="button-download-pdf">
                  {isDownloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2 text-red-600" />}
                  <span>PDF (.pdf)</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDownloadTxt} data-testid="button-download-txt">
                  <FileText className="h-4 w-4 mr-2 text-gray-500" />
                  <span>Plain Text (.txt)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              className="bg-[hsl(var(--pearsign-primary))]"
              onClick={() => {
                if (onSendForSignature && selectedType) {
                  onSendForSignature(generatedDocument, selectedType.name);
                } else {
                  toast({ title: "Send for Signature", description: "Your document is ready to be sent for signature." });
                }
              }}
              data-testid="button-send-for-signature"
            >
              <FileSignature className="h-4 w-4 mr-2" />
              Send for Signature
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-220px)] min-h-[400px] sm:min-h-[500px]">
          {/* Chat Panel */}
          <Card className="flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm sm:text-base">AI Assistant</h3>
                  <p className="text-xs text-muted-foreground">Ask me to modify your document</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    message.role === "user" ? "bg-[hsl(var(--pearsign-primary))]" : "bg-muted"
                  )}>
                    {message.role === "user" ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={cn(
                    "rounded-xl px-4 py-2.5 max-w-[80%]",
                    message.role === "user" ? "bg-[hsl(var(--pearsign-primary))] text-white" : "bg-muted"
                  )}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className={cn("text-xs mt-1", message.role === "user" ? "text-white/70" : "text-muted-foreground")}>
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-muted rounded-xl px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" />
                      <div className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" style={{ animationDelay: "0.15s" }} />
                      <div className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" style={{ animationDelay: "0.3s" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me to make changes..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                  }}
                  disabled={isLoading}
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  className="bg-[hsl(var(--pearsign-primary))]"
                  data-testid="button-send-chat"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Document Preview Panel */}
          <Card className="flex flex-col overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{selectedType?.name}</h3>
                  <p className="text-xs text-muted-foreground">Generated document</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-950">
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed" data-testid="text-document-preview">
                {generatedDocument}
              </pre>
            </div>

            <div className="p-4 border-t flex items-center justify-between">
              <Button variant="outline" onClick={handleStartOver} data-testid="button-create-another">
                Create Another
              </Button>
              <Button
                className="bg-[hsl(var(--pearsign-primary))]"
                onClick={() => {
                  if (onSendForSignature && selectedType) {
                    onSendForSignature(generatedDocument, selectedType.name);
                  } else {
                    toast({ title: "Send for Signature", description: "Your document is ready to be sent for signature." });
                  }
                }}
                data-testid="button-send-for-signature-preview"
              >
                <FileSignature className="h-4 w-4 mr-2" />
                Send for Signature
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "ai-chat") {
    const suggestedPrompts = [
      { text: "Draft an NDA", desc: "Non-disclosure agreement between two parties", icon: Shield },
      { text: "Create a service contract", desc: "Professional services agreement", icon: Briefcase },
      { text: "Write an employment offer", desc: "Employment contract with terms", icon: Users },
      { text: "Generate a privacy policy", desc: "GDPR-compliant privacy policy", icon: Lock },
    ];

    const hasMessages = messages.length > 0;
    const hasDocument = generatedDocument.length > 0;

    return (
      <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleStartOver} data-testid="button-back-from-ai-chat">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">AI Document Assistant</h1>
                <p className="text-sm text-muted-foreground">Describe what you need - I'll draft it for you</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasDocument && (
              <>
                <Button variant="ghost" size="icon" onClick={handleCopyDocument} title="Copy document" data-testid="button-copy-ai-doc">
                  <Copy className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="default" data-testid="button-download-ai-menu">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={handleDownloadDocx} disabled={isDownloadingDocx} data-testid="button-ai-download-docx">
                      {isDownloadingDocx ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileType className="h-4 w-4 mr-2 text-blue-600" />}
                      <span>Word (.docx)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPdf} disabled={isDownloadingPdf} data-testid="button-ai-download-pdf">
                      {isDownloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2 text-red-600" />}
                      <span>PDF (.pdf)</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDownloadTxt} data-testid="button-ai-download-txt">
                      <FileText className="h-4 w-4 mr-2 text-gray-500" />
                      <span>Plain Text (.txt)</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  className="bg-[hsl(var(--pearsign-primary))]"
                  onClick={() => {
                    if (onSendForSignature) {
                      onSendForSignature(generatedDocument, documentTitle);
                    } else {
                      toast({ title: "Send for Signature", description: "Your document is ready to be sent for signature." });
                    }
                  }}
                  data-testid="button-ai-send-signature"
                >
                  <FileSignature className="h-4 w-4 mr-2" />
                  Send for Signature
                </Button>
              </>
            )}
          </div>
        </div>

        <div className={cn(
          "flex-1 min-h-0",
          hasDocument ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col"
        )}>
          <Card className="flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">PearSign AI</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-muted-foreground">{isStreaming ? "Typing..." : "Online"}</span>
                </div>
              </div>
              {hasMessages && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setMessages([]);
                    setGeneratedDocument("");
                  }}
                  title="Clear chat"
                  data-testid="button-clear-chat"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!hasMessages ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(var(--pearsign-primary))]/10 to-blue-600/10 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-[hsl(var(--pearsign-primary))]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">How can I help you today?</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md">
                    Tell me what document you need and I'll draft it for you. You can also ask me to modify, explain, or improve any document.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                    {suggestedPrompts.map((prompt, i) => {
                      const PromptIcon = prompt.icon;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(prompt.text);
                          }}
                          className="flex items-start gap-3 p-3 rounded-xl border border-border hover-elevate text-left transition-all"
                          data-testid={`button-suggested-prompt-${i}`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <PromptIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{prompt.text}</p>
                            <p className="text-xs text-muted-foreground">{prompt.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}
                      data-testid={`message-${message.role}-${message.id}`}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        message.role === "user" ? "bg-[hsl(var(--pearsign-primary))]" : "bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600"
                      )}>
                        {message.role === "user" ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
                      </div>
                      <div className={cn(
                        "rounded-2xl px-4 py-3 max-w-[85%]",
                        message.role === "user"
                          ? "bg-[hsl(var(--pearsign-primary))] text-white"
                          : "bg-muted"
                      )}>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
                        {message.content && (
                          <p className={cn(
                            "text-xs mt-1.5",
                            message.role === "user" ? "text-white/60" : "text-muted-foreground"
                          )}>
                            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && !isStreaming && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-muted rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" />
                          <div className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" style={{ animationDelay: "0.15s" }} />
                          <div className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" style={{ animationDelay: "0.3s" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <div className="p-3 border-t">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={hasDocument ? "Ask me to modify the document..." : "Describe the document you need..."}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleStreamChat(); }
                  }}
                  disabled={isLoading}
                  className="flex-1"
                  data-testid="input-ai-chat-message"
                />
                <Button
                  onClick={handleStreamChat}
                  disabled={!input.trim() || isLoading}
                  className="bg-[hsl(var(--pearsign-primary))]"
                  data-testid="button-send-ai-chat"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                AI-generated documents should be reviewed by legal counsel before execution
              </p>
            </div>
          </Card>

          {hasDocument && (
            <Card className="flex flex-col overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{documentTitle}</h3>
                    <p className="text-xs text-muted-foreground">Generated document</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Ready
                </Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-950">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed" data-testid="text-ai-document-preview">
                  {generatedDocument}
                </pre>
              </div>
              <div className="p-3 border-t flex items-center justify-end gap-2">
                <Button variant="outline" size="default" onClick={handleCopyDocument} data-testid="button-copy-ai-preview">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button
                  className="bg-[hsl(var(--pearsign-primary))]"
                  onClick={() => {
                    if (onSendForSignature) {
                      onSendForSignature(generatedDocument, documentTitle);
                    } else {
                      toast({ title: "Send for Signature", description: "Your document is ready to be sent for signature." });
                    }
                  }}
                  data-testid="button-ai-preview-send-signature"
                >
                  <FileSignature className="h-4 w-4 mr-2" />
                  Send for Signature
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return null;
}

/* ======================== TEMPLATE CARD COMPONENT ======================== */

interface TemplateCardProps {
  type: DocumentType;
  view: "grid" | "list";
  isFavorite: boolean;
  onSelect: (type: DocumentType) => void;
  onToggleFavorite: (id: string) => void;
}

function TemplateCard({ type, view, isFavorite, onSelect, onToggleFavorite }: TemplateCardProps) {
  const Icon = type.icon;

  if (view === "list") {
    return (
      <Card
        className="p-4 cursor-pointer hover-elevate group"
        onClick={() => onSelect(type)}
        data-testid={`card-template-list-${type.id}`}
      >
        <div className="flex items-center gap-4">
          <div className={cn("w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", type.color)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">{type.name}</h4>
            <p className="text-xs text-muted-foreground truncate">{type.description}</p>
          </div>
          <Badge variant="secondary" className="text-xs hidden sm:flex">{type.category}</Badge>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              {type.questions.length}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(type.id); }}
              className="p-1"
              data-testid={`button-fav-list-${type.id}`}
            >
              <Star className={cn("h-4 w-4", isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
            </button>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="overflow-hidden cursor-pointer hover-elevate group"
      onClick={() => onSelect(type)}
      data-testid={`card-template-grid-${type.id}`}
    >
      <div className={cn("h-24 bg-gradient-to-br flex items-center justify-center relative", type.color)}>
        <Icon className="h-10 w-10 text-white/80" />
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(type.id); }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/20 hover:bg-black/40 transition-colors"
          data-testid={`button-fav-grid-${type.id}`}
        >
          <Star className={cn("h-4 w-4", isFavorite ? "fill-amber-400 text-amber-400" : "text-white/70")} />
        </button>
        <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-black/20 to-transparent" />
      </div>
      <div className="p-4">
        <h4 className="font-semibold text-sm mb-1">{type.name}</h4>
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{type.description}</p>
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">{type.category}</Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <BarChart3 className="h-3 w-3" />
            {type.popularity}%
          </div>
        </div>
      </div>
    </Card>
  );
}
