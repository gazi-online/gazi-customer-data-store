import { Invoice, InvoiceItem, Payment, PaymentAllocation, InvoiceStatus, CustomerServicePaymentStatus } from "@/types/billing";

export class BillingEngine {
  /**
   * Decimal-safe rounding helper for financial calculations (2 decimal places)
   */
  static roundMoney(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  /**
   * Calculates the line total for an invoice item
   * line_total = (quantity * unit_price) - discount_amount + tax_amount
   */
  static calculateLineTotal(item: {
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    tax_amount?: number;
  }): number {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const price = item.unit_price >= 0 ? item.unit_price : 0;
    const discount = item.discount_amount && item.discount_amount >= 0 ? item.discount_amount : 0;
    const tax = item.tax_amount && item.tax_amount >= 0 ? item.tax_amount : 0;

    const baseAmount = this.roundMoney(qty * price);
    const total = this.roundMoney(baseAmount - discount + tax);
    return Math.max(0, total);
  }

  /**
   * Calculates invoice totals from item lines and invoice-level discounts/taxes
   */
  static calculateInvoiceTotals(params: {
    items: InvoiceItem[];
    discount_amount?: number;
    tax_amount?: number;
    paid_amount?: number;
  }): {
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    paid_amount: number;
    due_amount: number;
  } {
    const subtotal = this.roundMoney(
      params.items.reduce((sum, item) => sum + item.line_total, 0)
    );

    const discount = params.discount_amount && params.discount_amount >= 0 ? params.discount_amount : 0;
    const tax = params.tax_amount && params.tax_amount >= 0 ? params.tax_amount : 0;

    const rawTotal = this.roundMoney(subtotal - discount + tax);
    const total_amount = Math.max(0, rawTotal);

    const paid_amount = params.paid_amount && params.paid_amount >= 0 ? params.paid_amount : 0;
    const rawDue = this.roundMoney(total_amount - paid_amount);
    const due_amount = Math.max(0, rawDue);

    return {
      subtotal,
      discount_amount: discount,
      tax_amount: tax,
      total_amount,
      paid_amount,
      due_amount,
    };
  }

  /**
   * Derives invoice status based on payment state and cancellation status
   */
  static deriveInvoiceStatus(params: {
    isCancelled?: boolean;
    isDraft?: boolean;
    total_amount: number;
    paid_amount: number;
  }): InvoiceStatus {
    if (params.isCancelled) return 'cancelled';
    if (params.isDraft) return 'draft';

    const total = this.roundMoney(params.total_amount);
    const paid = this.roundMoney(params.paid_amount);

    if (paid <= 0) return 'issued';
    if (paid >= total && total > 0) return 'paid';
    return 'partially_paid';
  }

  /**
   * Validates a new payment allocation attempt against payment & invoice balances
   */
  static validateAllocation(params: {
    payment: Payment;
    existingPaymentAllocations: PaymentAllocation[];
    invoice: Invoice;
    existingInvoiceAllocations: PaymentAllocation[];
    newAllocationAmount: number;
  }): { isValid: boolean; error?: string } {
    if (params.payment.status !== 'recorded') {
      return { isValid: false, error: "Cannot allocate from a voided or refunded payment." };
    }

    if (params.invoice.status === 'cancelled') {
      return { isValid: false, error: "Cannot allocate payment to a cancelled invoice." };
    }

    if (params.newAllocationAmount <= 0) {
      return { isValid: false, error: "Allocation amount must be greater than 0." };
    }

    const roundedNew = this.roundMoney(params.newAllocationAmount);

    // Rule 6: Total allocations for one payment must never exceed payment.amount
    const currentPaymentAllocated = this.roundMoney(
      params.existingPaymentAllocations.reduce((sum, a) => sum + a.amount, 0)
    );
    const remainingPaymentBalance = this.roundMoney(params.payment.amount - currentPaymentAllocated);

    if (roundedNew > remainingPaymentBalance) {
      return {
        isValid: false,
        error: `Allocation amount (₹${roundedNew}) exceeds available payment balance (₹${remainingPaymentBalance}).`
      };
    }

    // Rule 7: Total valid allocations to an invoice must never exceed invoice.total_amount
    const currentInvoicePaid = this.roundMoney(
      params.existingInvoiceAllocations.reduce((sum, a) => sum + a.amount, 0)
    );
    const remainingInvoiceDue = this.roundMoney(params.invoice.total_amount - currentInvoicePaid);

    if (roundedNew > remainingInvoiceDue) {
      return {
        isValid: false,
        error: `Allocation amount (₹${roundedNew}) exceeds remaining invoice due amount (₹${remainingInvoiceDue}).`
      };
    }

    return { isValid: true };
  }

  /**
   * Recalculates invoice paid_amount, due_amount, and status from active allocations
   */
  static processAllocationsForInvoice(
    invoice: Invoice,
    allocations: { allocation: PaymentAllocation; paymentStatus: string }[]
  ): { paid_amount: number; due_amount: number; status: InvoiceStatus } {
    if (invoice.status === 'cancelled') {
      return {
        paid_amount: 0,
        due_amount: 0,
        status: 'cancelled'
      };
    }

    // Rule 10: Voided/refunded payments do NOT count toward invoice paid balance
    const validAllocations = allocations.filter(a => a.paymentStatus === 'recorded');
    const paid_amount = this.roundMoney(
      validAllocations.reduce((sum, a) => sum + a.allocation.amount, 0)
    );

    const due_amount = Math.max(0, this.roundMoney(invoice.total_amount - paid_amount));
    const status = this.deriveInvoiceStatus({
      total_amount: invoice.total_amount,
      paid_amount,
      isDraft: invoice.status === 'draft'
    });

    return { paid_amount, due_amount, status };
  }

  /**
   * Snapshots service details into an immutable historical invoice item line.
   * Ensures future changes to service master default_price/name do NOT alter historical invoices.
   */
  static snapshotServiceToInvoiceItem(serviceMaster: {
    id: string;
    service_name: string;
    default_price: number;
  }, customerServiceId?: string, quantity: number = 1): InvoiceItem {
    const qty = quantity > 0 ? quantity : 1;
    const unit_price = serviceMaster.default_price >= 0 ? serviceMaster.default_price : 0;
    const line_total = this.calculateLineTotal({ quantity: qty, unit_price });

    return {
      service_id: serviceMaster.id,
      customer_service_id: customerServiceId || null,
      description: serviceMaster.service_name,
      quantity: qty,
      unit_price,
      discount_amount: 0,
      tax_amount: 0,
      line_total
    };
  }

  /**
   * Derives customer_services.payment_status synchronization state:
   * - No valid payment -> 'unpaid'
   * - Partial valid payment -> 'partial'
   * - Fully paid -> 'paid'
   */
  static deriveCustomerServicePaymentStatus(params: {
    serviceAmount: number;
    allocatedAmount: number;
    isInvoiceCancelled?: boolean;
  }): CustomerServicePaymentStatus {
    if (params.isInvoiceCancelled) return 'unpaid';
    
    const amount = this.roundMoney(params.serviceAmount);
    const allocated = this.roundMoney(params.allocatedAmount);

    if (allocated <= 0) return 'unpaid';
    if (allocated >= amount && amount > 0) return 'paid';
    return 'partial';
  }
}
