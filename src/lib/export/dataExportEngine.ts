/**
 * ==============================================================================
 * GCDS Phase 2H: Safe Operator Data Export Engine
 * File: src/lib/export/dataExportEngine.ts
 * ==============================================================================
 */

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
}

export function formatCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

export interface CustomerExportRow {
  customer_code?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  created_at?: string | null;
}

export function generateCustomersCsv(customers: CustomerExportRow[]): string {
  const headers = [
    'Customer Code',
    'Full Name',
    'Phone / WhatsApp',
    'Email',
    'Address',
    'District',
    'State',
    'Pincode',
    'Created At',
  ];

  const rows = customers.map((c) => {
    const fullName = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ');
    return [
      c.customer_code || '—',
      fullName,
      c.phone || '—',
      c.email || '—',
      c.address || '—',
      c.district || '—',
      c.state || '—',
      c.pincode || '—',
      c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '—',
    ];
  });

  return formatCsv(headers, rows);
}

export interface RequestExportRow {
  id: string;
  request_number?: string | null;
  status: string;
  priority: string;
  payment_status: string;
  due_date?: string | null;
  created_at?: string | null;
  customer?: { first_name?: string | null; middle_name?: string | null; last_name?: string | null; phone?: string | null } | { first_name?: string | null; middle_name?: string | null; last_name?: string | null; phone?: string | null }[];
  service?: { service_name?: string | null } | { service_name?: string | null }[];
}

export function generateRequestsCsv(requests: RequestExportRow[]): string {
  const headers = [
    'Request Number',
    'Customer Name',
    'Customer Phone',
    'Service Name',
    'Status',
    'Priority',
    'Payment Status',
    'Due Date',
    'Created At',
  ];

  const rows = requests.map((r) => {
    const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
    const srv = Array.isArray(r.service) ? r.service[0] : r.service;
    const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(' ') : '—';
    return [
      r.request_number || r.id.slice(0, 8),
      custName,
      cust?.phone || '—',
      srv?.service_name || 'Service',
      r.status,
      r.priority,
      r.payment_status,
      r.due_date ? new Date(r.due_date).toLocaleDateString('en-IN') : '—',
      r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '—',
    ];
  });

  return formatCsv(headers, rows);
}

export interface DocumentExportRow {
  document_name: string;
  category?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  status?: string | null;
  created_at?: string | null;
  customer?: { first_name?: string | null; middle_name?: string | null; last_name?: string | null } | { first_name?: string | null; middle_name?: string | null; last_name?: string | null }[];
}

export function generateDocumentsCatalogCsv(documents: DocumentExportRow[]): string {
  const headers = [
    'Customer Name',
    'Document Name',
    'Category',
    'Document Number',
    'Issue Date',
    'Expiry Date',
    'Status',
    'Created At',
  ];

  const rows = documents.map((d) => {
    const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
    const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(' ') : '—';
    return [
      custName,
      d.document_name,
      d.category || 'general',
      d.document_number || '—',
      d.issue_date || '—',
      d.expiry_date || '—',
      d.status || 'active',
      d.created_at ? new Date(d.created_at).toLocaleDateString('en-IN') : '—',
    ];
  });

  return formatCsv(headers, rows);
}

export interface InvoiceExportRow {
  invoice_number: string;
  invoice_date?: string | null;
  due_date?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  due_amount?: number | string | null;
  status: string;
  customer?: { first_name?: string | null; middle_name?: string | null; last_name?: string | null } | { first_name?: string | null; middle_name?: string | null; last_name?: string | null }[];
}

export function generateInvoicesCsv(invoices: InvoiceExportRow[]): string {
  const headers = [
    'Invoice Number',
    'Customer Name',
    'Invoice Date',
    'Due Date',
    'Total Amount (INR)',
    'Paid Amount (INR)',
    'Due Amount (INR)',
    'Status',
  ];

  const rows = invoices.map((inv) => {
    const cust = Array.isArray(inv.customer) ? inv.customer[0] : inv.customer;
    const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(' ') : '—';
    return [
      inv.invoice_number,
      custName,
      inv.invoice_date || '—',
      inv.due_date || '—',
      Number(inv.total_amount || 0).toFixed(2),
      Number(inv.paid_amount || 0).toFixed(2),
      Number(inv.due_amount || 0).toFixed(2),
      inv.status,
    ];
  });

  return formatCsv(headers, rows);
}
