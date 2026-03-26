/**
 * PearSign Field History Hook
 *
 * Provides undo/redo functionality for field mapping operations.
 * Uses an in-memory history stack with immutable snapshots.
 *
 * Features:
 * - Undo/Redo for all field operations
 * - Keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
 * - History limit to prevent memory issues
 * - No persistence (resets on page refresh)
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// Maximum history entries to prevent memory issues
const MAX_HISTORY_SIZE = 50;

export interface FieldHistorySnapshot<T> {
  fields: T[];
  timestamp: number;
  action: string;
}

export interface UseFieldHistoryOptions<T> {
  fields: T[];
  onFieldsChange: (fields: T[]) => void;
  // Optional: whether to capture keyboard shortcuts
  enableKeyboardShortcuts?: boolean;
  // Optional: custom container element to listen for keyboard events
  containerRef?: React.RefObject<HTMLElement>;
}

export interface UseFieldHistoryReturn<T> {
  // State
  canUndo: boolean;
  canRedo: boolean;
  historyLength: number;
  currentIndex: number;

  // Actions
  undo: () => void;
  redo: () => void;
  pushSnapshot: (action: string) => void;
  clearHistory: () => void;

  // Wrapped change handler that auto-captures snapshots
  handleFieldsChange: (newFields: T[], action?: string) => void;
}

export function useFieldHistory<T>({
  fields,
  onFieldsChange,
  enableKeyboardShortcuts = true,
  containerRef,
}: UseFieldHistoryOptions<T>): UseFieldHistoryReturn<T> {
  // History stack
  const [history, setHistory] = useState<FieldHistorySnapshot<T>[]>([
    { fields: [...fields], timestamp: Date.now(), action: 'initial' },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Track if we're currently undoing/redoing to prevent duplicate snapshots
  const isUndoRedoRef = useRef(false);

  // Track the last fields to detect external changes
  const lastFieldsRef = useRef<T[]>(fields);

  // Push a new snapshot to history
  const pushSnapshot = useCallback((action: string) => {
    if (isUndoRedoRef.current) return;

    setHistory((prev) => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, currentIndex + 1);

      // Add new snapshot
      newHistory.push({
        fields: JSON.parse(JSON.stringify(fields)), // Deep clone
        timestamp: Date.now(),
        action,
      });

      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        return newHistory;
      }

      return newHistory;
    });

    setCurrentIndex((prev) => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, [fields, currentIndex]);

  // Undo
  const undo = useCallback(() => {
    if (currentIndex <= 0) return;

    isUndoRedoRef.current = true;
    const newIndex = currentIndex - 1;
    const snapshot = history[newIndex];

    if (snapshot) {
      setCurrentIndex(newIndex);
      lastFieldsRef.current = snapshot.fields;
      onFieldsChange([...snapshot.fields]);
    }

    // Reset flag after a short delay
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 50);
  }, [currentIndex, history, onFieldsChange]);

  // Redo
  const redo = useCallback(() => {
    if (currentIndex >= history.length - 1) return;

    isUndoRedoRef.current = true;
    const newIndex = currentIndex + 1;
    const snapshot = history[newIndex];

    if (snapshot) {
      setCurrentIndex(newIndex);
      lastFieldsRef.current = snapshot.fields;
      onFieldsChange([...snapshot.fields]);
    }

    // Reset flag after a short delay
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 50);
  }, [currentIndex, history, onFieldsChange]);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([{ fields: [...fields], timestamp: Date.now(), action: 'cleared' }]);
    setCurrentIndex(0);
  }, [fields]);

  // Wrapped change handler that auto-captures snapshots
  const handleFieldsChange = useCallback((newFields: T[], action: string = 'update') => {
    if (isUndoRedoRef.current) return;

    // Push snapshot before making the change
    setHistory((prev) => {
      const newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push({
        fields: JSON.parse(JSON.stringify(newFields)),
        timestamp: Date.now(),
        action,
      });

      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        return newHistory;
      }

      return newHistory;
    });

    setCurrentIndex((prev) => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
    lastFieldsRef.current = newFields;
    onFieldsChange(newFields);
  }, [currentIndex, onFieldsChange]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Cmd/Ctrl + Z
      if (modKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
      if (modKey && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
    };

    // Listen on the container or document
    const element = containerRef?.current || document;
    element.addEventListener('keydown', handleKeyDown as EventListener);

    return () => {
      element.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [enableKeyboardShortcuts, containerRef, undo, redo]);

  return {
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    historyLength: history.length,
    currentIndex,
    undo,
    redo,
    pushSnapshot,
    clearHistory,
    handleFieldsChange,
  };
}

export default useFieldHistory;
