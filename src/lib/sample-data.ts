/**
 * Sample data for PearSign dashboard
 * This represents what would come from the backend API
 */

export interface Recipient {
  name: string;
  email: string;
}

export interface Envelope {
  id: string;
  title: string;
  status: 'draft' | 'ready_to_send' | 'in_signing' | 'viewed' | 'completed' | 'voided' | 'declined' | 'expired';
  recipients: Recipient[];
  createdAt: Date;
  updatedAt: Date;
  documentCount: number;
  bulkSendId?: string;
  bulkSendName?: string;
}

export interface Document {
  id: string;
  title: string;
  type: string;
  status: string;
  recipients: string;
  lastUpdated: string;
  createdAt: Date;
}

// Sample Envelopes - Individual sends and Bulk sends
export const sampleEnvelopes: Envelope[] = [
  // Individual sends
  {
    id: 'env-1',
    title: 'Employment Contract - Sarah Johnson',
    status: 'in_signing',
    recipients: [{ name: 'Sarah Johnson', email: 'sarah.johnson@email.com' }],
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    documentCount: 1,
  },
  {
    id: 'env-2',
    title: 'NDA Agreement - Tech Corp',
    status: 'completed',
    recipients: [
      { name: 'James Wilson', email: 'legal@techcorp.com' },
      { name: 'Robert Chen', email: 'ceo@techcorp.com' }
    ],
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
    documentCount: 1,
  },
  {
    id: 'env-3',
    title: 'Service Agreement Draft',
    status: 'draft',
    recipients: [],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    documentCount: 1,
  },
  {
    id: 'env-4',
    title: 'Vendor Contract - ABC Supplies',
    status: 'completed',
    recipients: [{ name: 'Amanda Foster', email: 'procurement@abc.com' }],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    documentCount: 2,
  },
  {
    id: 'env-5',
    title: 'Partnership Agreement',
    status: 'in_signing',
    recipients: [{ name: 'David Martinez', email: 'partner@company.com' }],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    documentCount: 1,
  },
  {
    id: 'env-6',
    title: 'Consulting Agreement - FutureTech Inc',
    status: 'in_signing',
    recipients: [
      { name: 'Lisa Park', email: 'cto@futuretech.com' },
      { name: 'Mark Thompson', email: 'legal@futuretech.com' }
    ],
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    documentCount: 1,
  },
  {
    id: 'env-7',
    title: 'Freelance Contract - Design Work',
    status: 'completed',
    recipients: [{ name: 'Emma Williams', email: 'designer@freelance.com' }],
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    documentCount: 1,
  },
  {
    id: 'env-8',
    title: 'Software License Agreement - CloudSoft',
    status: 'voided',
    recipients: [{ name: 'Kevin Brown', email: 'licensing@cloudsoft.io' }],
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    documentCount: 1,
  },
  {
    id: 'env-9',
    title: 'Lease Agreement - Office Space',
    status: 'completed',
    recipients: [
      { name: 'Jennifer Adams', email: 'property@realestate.com' },
      { name: 'Thomas Wright', email: 'manager@building.com' }
    ],
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    documentCount: 3,
  },
  {
    id: 'env-10',
    title: 'Investment Term Sheet - Series A',
    status: 'in_signing',
    recipients: [
      { name: 'Christopher Lee', email: 'investor@vcfund.com' },
      { name: 'Michelle Garcia', email: 'legal@vcfund.com' },
      { name: 'Daniel Kim', email: 'partner@vcfund.com' }
    ],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    documentCount: 2,
  },
  // Bulk Send: Q1 Sales Contracts
  {
    id: 'env-bulk-1a',
    title: 'Q1 Sales Contract - Acme Industries',
    status: 'completed',
    recipients: [{ name: 'Patricia Taylor', email: 'contracts@acme.com' }],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    documentCount: 1,
    bulkSendId: 'bulk-001',
    bulkSendName: 'Q1 Sales Contracts',
  },
  {
    id: 'env-bulk-1b',
    title: 'Q1 Sales Contract - GlobalTech Solutions',
    status: 'in_signing',
    recipients: [{ name: 'Richard Anderson', email: 'legal@globaltech.io' }],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    documentCount: 1,
    bulkSendId: 'bulk-001',
    bulkSendName: 'Q1 Sales Contracts',
  },
  {
    id: 'env-bulk-1c',
    title: 'Q1 Sales Contract - Sunrise Ventures',
    status: 'completed',
    recipients: [{ name: 'Nancy White', email: 'procurement@sunrise.vc' }],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
    documentCount: 1,
    bulkSendId: 'bulk-001',
    bulkSendName: 'Q1 Sales Contracts',
  },
  {
    id: 'env-bulk-1d',
    title: 'Q1 Sales Contract - Metro Enterprises',
    status: 'in_signing',
    recipients: [{ name: 'John Smith', email: 'john.smith@metro-ent.com' }],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    documentCount: 1,
    bulkSendId: 'bulk-001',
    bulkSendName: 'Q1 Sales Contracts',
  },
  // Bulk Send: Employee Onboarding NDAs
  {
    id: 'env-bulk-2a',
    title: 'Employee NDA - Michael Chen',
    status: 'completed',
    recipients: [{ name: 'Michael Chen', email: 'michael.chen@newemployee.com' }],
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    documentCount: 1,
    bulkSendId: 'bulk-002',
    bulkSendName: 'January Onboarding NDAs',
  },
  {
    id: 'env-bulk-2b',
    title: 'Employee NDA - Emily Rodriguez',
    status: 'completed',
    recipients: [{ name: 'Emily Rodriguez', email: 'emily.rodriguez@newemployee.com' }],
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000),
    documentCount: 1,
    bulkSendId: 'bulk-002',
    bulkSendName: 'January Onboarding NDAs',
  },
  {
    id: 'env-bulk-2c',
    title: 'Employee NDA - David Park',
    status: 'in_signing',
    recipients: [{ name: 'David Park', email: 'david.park@newemployee.com' }],
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    documentCount: 1,
    bulkSendId: 'bulk-002',
    bulkSendName: 'January Onboarding NDAs',
  },
];

// Sample Documents for display
export const sampleDocuments: Document[] = [
  {
    id: 'doc-1',
    title: 'Employment Contract - Sarah Johnson',
    type: 'PDF',
    status: 'Pending',
    recipients: 'sarah.johnson@email.com',
    lastUpdated: '2 hours ago',
    createdAt: new Date('2025-01-29T08:00:00'),
  },
  {
    id: 'doc-2',
    title: 'NDA Agreement - Tech Corp',
    type: 'PDF',
    status: 'Completed',
    recipients: 'legal@techcorp.com +1 more',
    lastUpdated: '1 day ago',
    createdAt: new Date('2025-01-28T09:00:00'),
  },
  {
    id: 'doc-3',
    title: 'Service Agreement Draft',
    type: 'PDF',
    status: 'Draft',
    recipients: 'No recipients',
    lastUpdated: '3 days ago',
    createdAt: new Date('2025-01-26T14:00:00'),
  },
  {
    id: 'doc-4',
    title: 'Vendor Contract - ABC Supplies',
    type: 'PDF',
    status: 'Completed',
    recipients: 'procurement@abc.com',
    lastUpdated: '5 days ago',
    createdAt: new Date('2025-01-24T11:00:00'),
  },
  {
    id: 'doc-5',
    title: 'Partnership Agreement',
    type: 'PDF',
    status: 'Pending',
    recipients: 'partner@company.com',
    lastUpdated: '1 week ago',
    createdAt: new Date('2025-01-22T10:00:00'),
  },
];

// Sample stats
export const sampleStats = {
  documentsSent: 24,
  documentsSentChange: '+12%',
  completionRate: '94%',
  completionRateChange: '+5%',
  pendingSignatures: 8,
  pendingSignaturesChange: '-3',
  avgCompletionTime: '2.4h',
  avgCompletionTimeChange: '-15%',
};

// Sample activity logs
export interface ActivityLog {
  id: string;
  action: string;
  user: string;
  document: string;
  timestamp: Date;
  type: 'created' | 'sent' | 'signed' | 'completed' | 'viewed';
}

export const sampleActivityLogs: ActivityLog[] = [
  {
    id: 'act-1',
    action: 'Document completed',
    user: 'Sarah Johnson',
    document: 'Employment Contract',
    timestamp: new Date('2025-01-29T10:30:00'),
    type: 'completed',
  },
  {
    id: 'act-2',
    action: 'Document viewed',
    user: 'Tech Corp Legal',
    document: 'NDA Agreement',
    timestamp: new Date('2025-01-29T09:15:00'),
    type: 'viewed',
  },
  {
    id: 'act-3',
    action: 'Document sent',
    user: 'John Doe',
    document: 'Partnership Agreement',
    timestamp: new Date('2025-01-29T08:00:00'),
    type: 'sent',
  },
  {
    id: 'act-4',
    action: 'Document signed',
    user: 'ABC Supplies',
    document: 'Vendor Contract',
    timestamp: new Date('2025-01-28T16:00:00'),
    type: 'signed',
  },
  {
    id: 'act-5',
    action: 'Document created',
    user: 'Jane Smith',
    document: 'Service Agreement',
    timestamp: new Date('2025-01-28T14:00:00'),
    type: 'created',
  },
];
