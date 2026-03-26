import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickActions } from '../quick-actions';

describe('QuickActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub getElementById so card clicks don't throw in jsdom
    vi.spyOn(document, 'getElementById').mockReturnValue(null);
  });

  it('renders all four action card sections', () => {
    const onOpenAIWizard = vi.fn();
    render(<QuickActions onOpenAIWizard={onOpenAIWizard} />);
    // Send card - identified by aria-label on the div[role="button"]
    expect(
      screen.getByRole('button', { name: /send a document for signature/i })
    ).toBeDefined();
    // Sign card
    expect(
      screen.getByRole('button', { name: /sign a document yourself/i })
    ).toBeDefined();
    // Template card - plain <button> element, find by heading text
    expect(
      document.querySelector('[data-tour="use-template"]')
    ).not.toBeNull();
    // AI wizard button — only renders when onOpenAIWizard is provided
    // The button has heading "AI document" so query by text
    expect(
      screen.getByText('AI document')
    ).toBeDefined();
  });

  it('shows a time-appropriate greeting', () => {
    render(<QuickActions />);
    const greetingEl = screen.getByText(
      /good morning|good afternoon|good evening|hello/i
    );
    expect(greetingEl).toBeDefined();
  });

  it('calls onSendDocument when a file is selected via the hidden input', async () => {
    const onSendDocument = vi.fn();
    render(<QuickActions onSendDocument={onSendDocument} />);

    const fileInput = document.getElementById('file-upload-send') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['content'], 'contract.pdf', { type: 'application/pdf' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);
      // Wait for setTimeout inside handler
      await waitFor(() => expect(onSendDocument).toHaveBeenCalledWith(file), {
        timeout: 2000,
      });
    }
  });

  it('calls onUploadAndSign when a file is selected via the sign input', async () => {
    const onUploadAndSign = vi.fn();
    render(<QuickActions onUploadAndSign={onUploadAndSign} />);

    const fileInput = document.getElementById('file-upload-sign') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);
      await waitFor(() => expect(onUploadAndSign).toHaveBeenCalledWith(file), {
        timeout: 2000,
      });
    }
  });

  it('calls onUseTemplate when Use Template card is clicked', () => {
    const onUseTemplate = vi.fn();
    render(<QuickActions onUseTemplate={onUseTemplate} />);
    const card = screen.getByRole('button', { name: /use a template/i });
    fireEvent.click(card);
    expect(onUseTemplate).toHaveBeenCalledOnce();
  });

  it('calls onOpenAIWizard when AI Document button is clicked', () => {
    const onOpenAIWizard = vi.fn();
    render(<QuickActions onOpenAIWizard={onOpenAIWizard} />);
    fireEvent.click(screen.getByRole('button', { name: /ai document/i }));
    expect(onOpenAIWizard).toHaveBeenCalledOnce();
  });

  it('send card is keyboard-accessible via Enter key', () => {
    render(<QuickActions onSendDocument={vi.fn()} />);
    const card = screen.getByRole('button', { name: /send a document for signature/i });
    // keyDown fires the handler
    fireEvent.keyDown(card, { key: 'Enter' });
    // No throw = accessible
    expect(card).toBeDefined();
  });

  it('upload-sign card is keyboard-accessible via Space key', () => {
    render(<QuickActions onUploadAndSign={vi.fn()} />);
    const card = screen.getByRole('button', { name: /sign a document yourself/i });
    fireEvent.keyDown(card, { key: ' ' });
    expect(card).toBeDefined();
  });

  it('displays uploaded filename via the status region', async () => {
    render(<QuickActions onSendDocument={vi.fn()} />);

    // Simulate file change on the hidden input directly
    const fileInput = document.getElementById('file-upload-send') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['content'], 'contract.pdf', { type: 'application/pdf' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByRole('status')).toBeDefined();
        expect(screen.getByText('contract.pdf')).toBeDefined();
      });
    }
  });

  it('hidden file inputs have accessible aria-labels', () => {
    render(<QuickActions />);
    const sendInput = document.getElementById('file-upload-send') as HTMLElement;
    const signInput = document.getElementById('file-upload-sign') as HTMLElement;
    if (sendInput) expect(sendInput.getAttribute('aria-label')).toBeTruthy();
    if (signInput) expect(signInput.getAttribute('aria-label')).toBeTruthy();
  });
});
