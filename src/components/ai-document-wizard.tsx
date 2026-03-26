"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Send,
  Sparkles,
  FileText,
  Loader2,
  Download,
  Edit,
  X,
  Bot,
  User,
  Check,
  Clock,
  ChevronRight,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentEditor } from "./document-editor";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface DocumentData {
  type: string;
  parties: string[];
  effectiveDate?: string;
  expirationDate?: string;
  jurisdiction?: string;
  [key: string]: string | string[] | undefined;
}

interface SavedDocument {
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

const DOCUMENT_TYPES = [
  { id: "nda", name: "Non-Disclosure Agreement (NDA)", icon: "🔒" },
  { id: "contract", name: "Service Agreement", icon: "📋" },
  { id: "employment", name: "Employment Contract", icon: "💼" },
  { id: "partnership", name: "Partnership Agreement", icon: "🤝" },
];

export function AIDocumentWizard({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! 👋 I'm your AI document assistant. I can help you create professional legal documents in minutes. What type of document would you like to create today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [generatedDocument, setGeneratedDocument] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [savedDocuments, setSavedDocuments] = useState<SavedDocument[]>([]);
  const [currentView, setCurrentView] = useState<"chat" | "editor">("chat");
  const [selectedDocument, setSelectedDocument] = useState<SavedDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved documents from localStorage on mount
  useEffect(() => {
    const loadDocuments = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('ai_documents');
        if (saved) {
          const docs = JSON.parse(saved);
          // Convert date strings back to Date objects
          const parsedDocs = docs.map((doc: SavedDocument) => ({
            ...doc,
            createdAt: new Date(doc.createdAt),
            updatedAt: new Date(doc.updatedAt),
          }));
          setSavedDocuments(parsedDocs);
        }
      }
    };
    loadDocuments();
  }, []);

  // Save documents to localStorage whenever they change
  const saveDocumentsToStorage = (docs: SavedDocument[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_documents', JSON.stringify(docs));
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const saveDocument = (document: SavedDocument) => {
    const updatedDocs = [...savedDocuments, document];
    setSavedDocuments(updatedDocs);
    saveDocumentsToStorage(updatedDocs);
  };

  const updateDocument = (id: string, title: string, content: string) => {
    const updatedDocs = savedDocuments.map(doc =>
      doc.id === id
        ? { ...doc, title, content, updatedAt: new Date() }
        : doc
    );
    setSavedDocuments(updatedDocs);
    saveDocumentsToStorage(updatedDocs);
  };

  const deleteDocument = (id: string) => {
    const updatedDocs = savedDocuments.filter(doc => doc.id !== id);
    setSavedDocuments(updatedDocs);
    saveDocumentsToStorage(updatedDocs);
  };

  const openDocument = (doc: SavedDocument) => {
    setSelectedDocument(doc);
    setCurrentView("editor");
  };

  const backToChat = () => {
    setCurrentView("chat");
    setSelectedDocument(null);
  };

  const filteredDocuments = savedDocuments.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getApiKey = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('openai_api_key');
    }
    return null;
  };

  const generateAIResponse = async (userMessage: string, conversationHistory: Message[]) => {
    const apiKey = getApiKey();

    if (!apiKey) {
      return "I need an OpenAI API key to help you. Please add your API key in Settings → AI Document Generation.";
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a helpful legal document assistant for PearSign. Your job is to gather information from users to create professional legal documents like NDAs, contracts, and agreements.

Ask questions one at a time in a friendly, conversational manner. Gather essential information like:
- Party names (full legal names)
- Effective dates
- Jurisdiction/state
- Key terms and conditions
- Duration/expiration
- Specific clauses they want

Keep responses concise (2-3 sentences max). Once you have enough information, say "Great! I have all the information I need. Let me generate your document now." and summarize what you'll create.`
            },
            ...conversationHistory.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            {
              role: 'user',
              content: userMessage,
            },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI:', error);
      return "I'm having trouble connecting right now. Please check your API key and try again.";
    }
  };

  const generateDocument = async (conversationHistory: Message[]) => {
    const apiKey = getApiKey();

    if (!apiKey) {
      return "API key required";
    }

    try {
      const conversationContext = conversationHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a legal document generator. Based on the conversation history, create a complete, professional legal document.

Format the document properly with:
- Title centered and bold
- Clear section headers
- Proper legal language
- All party names, dates, and terms discussed
- Standard legal clauses appropriate for the document type
- Signature blocks at the end

Make it comprehensive but readable. Use markdown formatting.`
            },
            {
              role: 'user',
              content: `Based on this conversation, please generate the complete legal document:\n\n${conversationContext}\n\nPlease create the full document now.`
            },
          ],
          temperature: 0.5,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error generating document:', error);
      return null;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Check if user is saying they're ready to generate
    const isReadyToGenerate =
      input.toLowerCase().includes("generate") ||
      input.toLowerCase().includes("create it") ||
      input.toLowerCase().includes("yes") && messages[messages.length - 1]?.content.includes("generate your document");

    if (isReadyToGenerate && !generatedDocument) {
      // Generate the document
      const assistantMessage: Message = {
        role: "assistant",
        content: "Perfect! Generating your document now... ⚡",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      const document = await generateDocument([...messages, userMessage]);

      if (document) {
        setGeneratedDocument(document);

        // Auto-save the generated document
        const docType = DOCUMENT_TYPES.find(d => d.id === selectedType);
        const newDoc: SavedDocument = {
          id: Date.now().toString(),
          title: `${docType?.name || 'Document'} - ${new Date().toLocaleDateString()}`,
          content: document,
          type: docType?.name || 'Document',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        saveDocument(newDoc);

        const successMessage: Message = {
          role: "assistant",
          content: "✅ Your document is ready and saved! Review it below. You can edit, download, or send it for signature. Find it in the sidebar anytime.",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, successMessage]);
      }
      setIsLoading(false);
      return;
    }

    // Get AI response
    const aiResponse = await generateAIResponse(input, [...messages, userMessage]);

    const assistantMessage: Message = {
      role: "assistant",
      content: aiResponse,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsLoading(false);
  };

  const handleDocumentTypeSelect = (type: string) => {
    setSelectedType(type);
    const docType = DOCUMENT_TYPES.find(d => d.id === type);
    if (docType) {
      const message: Message = {
        role: "user",
        content: `I want to create a ${docType.name}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, message]);
      setInput("");
      handleQuickMessage(`I want to create a ${docType.name}`);
    }
  };

  const handleQuickMessage = async (message: string) => {
    const userMessage: Message = {
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const aiResponse = await generateAIResponse(message, [...messages, userMessage]);

    const assistantMessage: Message = {
      role: "assistant",
      content: aiResponse,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);
    setIsLoading(false);
  };

  // If in editor view, show the editor
  if (currentView === "editor" && selectedDocument) {
    return (
      <DocumentEditor
        doc={selectedDocument}
        onSave={updateDocument}
        onBack={backToChat}
        onDelete={deleteDocument}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] max-h-[800px]">
      {/* Sidebar - Document History */}
      <div className={cn(
        "border-r bg-accent/30 transition-all duration-300",
        showSidebar ? "w-80" : "w-0 overflow-hidden"
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                My Documents
              </h3>
              <Badge variant="secondary">{savedDocuments.length}</Badge>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Document List */}
          <div className="flex-1 overflow-y-auto">
            {filteredDocuments.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {searchQuery ? "No documents found" : "No documents yet. Create your first document!"}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredDocuments
                  .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
                  .map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => openDocument(doc)}
                      className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate group-hover:text-[hsl(var(--pearsign-primary))]">
                            {doc.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {doc.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {doc.updatedAt.toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[hsl(var(--pearsign-primary))] flex-shrink-0" />
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden"
            >
              <FileText className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">AI Document Generator</h2>
              <p className="text-xs text-muted-foreground">
                Powered by ChatGPT
              </p>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

      {/* Document Type Selection (if not selected) */}
      {!selectedType && messages.length <= 1 && (
        <div className="p-4 border-b bg-accent/30">
          <p className="text-sm font-medium mb-3">Quick Start - Choose a template:</p>
          <div className="grid grid-cols-2 gap-2">
            {DOCUMENT_TYPES.map(type => (
              <Button
                key={type.id}
                variant="outline"
                className="justify-start h-auto py-3 hover:border-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/5"
                onClick={() => handleDocumentTypeSelect(type.id)}
              >
                <span className="text-xl mr-2">{type.icon}</span>
                <span className="text-sm">{type.name}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex gap-3",
              message.role === "user" && "flex-row-reverse"
            )}
          >
            <div
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                message.role === "user"
                  ? "bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600"
                  : "bg-accent"
              )}
            >
              {message.role === "user" ? (
                <User className="h-4 w-4 text-white" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>
            <div
              className={cn(
                "flex-1 rounded-lg p-3 max-w-[80%]",
                message.role === "user"
                  ? "bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 text-white"
                  : "bg-accent"
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p
                className={cn(
                  "text-xs mt-1",
                  message.role === "user" ? "text-white/70" : "text-muted-foreground"
                )}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-accent rounded-lg p-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Generated Document Preview */}
      {generatedDocument && (
        <div className="border-t p-4 bg-accent/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
              Generated Document
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
              >
                <Send className="h-4 w-4 mr-2" />
                Send for Signature
              </Button>
            </div>
          </div>
          <Card className="max-h-[200px] overflow-y-auto p-4">
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-xs font-mono">
                {generatedDocument}
              </pre>
            </div>
          </Card>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {!getApiKey() && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            💡 Add your OpenAI API key in Settings to enable AI generation
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
