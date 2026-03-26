/**
 * Signature storage utility for saving and reusing signatures
 */

const STORAGE_KEY = "pearsign_saved_signatures";
const MAX_SAVED_SIGNATURES = 5;

export interface SavedSignature {
  id: string;
  type: "typed" | "drawn";
  data: string; // For typed: the text, for drawn: data URL
  name: string; // Display name for the signature
  createdAt: string;
  lastUsedAt: string;
}

/**
 * Get all saved signatures
 */
export function getSavedSignatures(): SavedSignature[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const signatures = JSON.parse(stored) as SavedSignature[];
    // Sort by last used, most recent first
    return signatures.sort((a, b) =>
      new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    );
  } catch (err) {
    console.error("Error reading saved signatures:", err);
    return [];
  }
}

/**
 * Save a new signature
 */
export function saveSignature(signature: Omit<SavedSignature, "id" | "createdAt" | "lastUsedAt">): SavedSignature {
  const signatures = getSavedSignatures();

  // Check if a similar signature already exists
  const existingIndex = signatures.findIndex(s =>
    s.type === signature.type && s.data === signature.data
  );

  if (existingIndex !== -1) {
    // Update last used time for existing signature
    signatures[existingIndex].lastUsedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signatures));
    return signatures[existingIndex];
  }

  // Create new signature
  const newSignature: SavedSignature = {
    id: generateId(),
    type: signature.type,
    data: signature.data,
    name: signature.name,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  // Add to beginning of array
  signatures.unshift(newSignature);

  // Keep only the most recent signatures
  const trimmedSignatures = signatures.slice(0, MAX_SAVED_SIGNATURES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedSignatures));
  } catch (err) {
    console.error("Error saving signature:", err);
  }

  return newSignature;
}

/**
 * Update last used time for a signature
 */
export function updateSignatureUsage(signatureId: string): void {
  const signatures = getSavedSignatures();
  const index = signatures.findIndex(s => s.id === signatureId);

  if (index !== -1) {
    signatures[index].lastUsedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(signatures));
    } catch (err) {
      console.error("Error updating signature usage:", err);
    }
  }
}

/**
 * Delete a saved signature
 */
export function deleteSignature(signatureId: string): void {
  const signatures = getSavedSignatures();
  const filtered = signatures.filter(s => s.id !== signatureId);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("Error deleting signature:", err);
  }
}

/**
 * Clear all saved signatures
 */
export function clearAllSignatures(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Error clearing signatures:", err);
  }
}

/**
 * Get the most recently used signature
 */
export function getMostRecentSignature(): SavedSignature | null {
  const signatures = getSavedSignatures();
  return signatures.length > 0 ? signatures[0] : null;
}

/**
 * Generate a random ID
 */
function generateId(): string {
  return `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
