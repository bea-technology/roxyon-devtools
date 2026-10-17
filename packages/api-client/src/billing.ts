import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

/** Billing cycles the checkout accepts (Pricing::CYCLE_MONTHS). */
export const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly', 'biennial'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

// Plans of this service are resellers' private resold copies, never the public catalog
// (same filter as the console's own bootstrap).
const RESELLER_RESOLD_SERVICE_ID = 'bjMqdLqAKl';

export interface CatalogProduct {
  /** Plan objectId: what quotes and orders take. */
  planId: string;
  /** Plan code, e.g. `SCALE-S`. */
  sku: string;
  name: string;
  /** Service type, e.g. `cloud.vps.scale`, `cloud.hosting.solo`. */
  category: string;
  vcpu?: number;
  ramGb?: number;
  diskGb?: number;
  cpuType?: string;
  /** Dedicated IPv4 addresses included (servers). */
  ipv4Included?: number;
  /** List prices in USD before tax, per cycle. Quote for the buyer's currency and tax. */
  pricesUSD: Partial<Record<BillingCycle, number>>;
  /** Setup fee in USD per cycle, when not zero. */
  setupFeeUSD?: Partial<Record<BillingCycle, number>>;
  /** `out` = cannot be ordered right now. */
  stock: 'in' | 'out';
  /** Feature table as the console shows it. */
  features?: Record<string, unknown>;
}

export interface QuoteInput {
  planId: string;
  cycle: BillingCycle;
  /** ISO 4217, e.g. `SAR`. Default USD. */
  currency?: string;
  /** ISO 3166 alpha-2, decides tax (e.g. `SA` = 15% VAT). Empty = no tax line. */
  country?: string;
}

export interface Quote {
  planId: string;
  cycle: string;
  currency: string;
  lineItems: Array<{ label: string; amount: string; amountUSD: string }>;
  subtotal: string;
  taxRate: string;
  taxLabel: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  fxRate: string;
  baseAmountUSD: string;
}

export interface BillingSubscription {
  id: string;
  name: string;
  status: string;
  plan: string;
  sku: string;
  cycle: string;
  price: string;
  currency: string;
  nextBillingDate: string | null;
  autoRenew: boolean;
  serverState: string | null;
  publicIp: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  type: string;
  status: string;
  total: string;
  currency: string;
  dueDate: string | null;
  subscription: string | null;
  createdAt: string;
  payUrl: string | null;
}

/** Invoice statuses a customer can still pay. */
export const PAYABLE_STATUSES = ['pending', 'overdue', 'failed'] as const;

export function isPayable(status: string): boolean {
  return (PAYABLE_STATUSES as readonly string[]).includes(status.toLowerCase());
}

function json<T>(v: unknown, fallback: T): T {
  if (v && typeof v === 'object') return v as T;
  if (typeof v !== 'string' || v === '') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function numbers(v: unknown): Partial<Record<BillingCycle, number>> {
  const out: Partial<Record<BillingCycle, number>> = {};
  const src = json<Record<string, unknown>>(v, {});
  for (const c of BILLING_CYCLES) {
    const n = Number(src[c]);
    if (src[c] !== undefined && src[c] !== '' && Number.isFinite(n)) out[c] = n;
  }
  return out;
}

interface PlanRow {
  objectId: string;
  Name?: string;
  Code?: string;
  Limits?: unknown;
  Features?: unknown;
  _Service?: { results?: Array<{ Type?: string }> };
  _Pricing?: { results?: Array<{ Prices?: unknown; SetupFee?: unknown; MetaData?: unknown }> };
}

/**
 * Catalog + quotes (public, no sign-in) and the caller's own subscriptions + invoices
 * (console, session or PAT). Read-only: nothing here creates orders or invoices.
 */
export class BillingApi {
  constructor(
    private readonly client: RoxyonClient,
    private readonly pub: RoxyonClient = client.publicClient(),
  ) {}

  async catalog(): Promise<CatalogProduct[]> {
    const r = await this.pub.get<{ results?: PlanRow[]; error?: string }>('/Plans', {
      fields: '*',
      limit: -1,
      order: 'objectId',
      where: { Status: 'active', Service: { nin: RESELLER_RESOLD_SERVICE_ID } },
      include: [
        { className: 'Services', field: 'Service', fields: 'Type' },
        {
          className: 'Pricing',
          field: 'Plan',
          fields: 'Prices,SetupFee,MetaData',
          reverse: 1,
        },
      ],
    });
    if (!Array.isArray(r.results)) {
      throw new RoxyonApiError(r.error || 'Could not load the catalog.', { body: r });
    }
    const out: CatalogProduct[] = [];
    for (const p of r.results) {
      const pricing = p._Pricing?.results?.[0];
      if (!pricing) continue;
      const limits = json<Record<string, unknown>>(p.Limits, {});
      const features = json<Record<string, unknown>>(p.Features, {});
      const meta = json<Record<string, unknown>>(pricing.MetaData, {});
      const network = json<Record<string, unknown>>(features.Network, {});
      const setup = numbers(pricing.SetupFee);
      const product: CatalogProduct = {
        planId: p.objectId,
        sku: p.Code ?? '',
        name: p.Name ?? '',
        category: p._Service?.results?.[0]?.Type ?? '',
        pricesUSD: numbers(pricing.Prices),
        stock: String(meta.stock ?? 'in').toLowerCase() === 'out' ? 'out' : 'in',
      };
      if (limits.vcpu != null) {
        product.vcpu = Number(limits.vcpu);
        product.ramGb = limits.memory_mb ? Math.round(Number(limits.memory_mb) / 1024) : 0;
        product.diskGb = Number(limits.disk_gb ?? 0);
        product.cpuType = String(limits.cpu_type ?? '');
      }
      if (network['Dedicated IPv4'] != null)
        product.ipv4Included = Number(network['Dedicated IPv4']);
      if (Object.values(setup).some((n) => n > 0)) product.setupFeeUSD = setup;
      if (Object.keys(features).length) product.features = features;
      out.push(product);
    }
    return out;
  }

  /** What checkout would charge for a new subscription: the server's own pricing (GET /_payment/quote). */
  async quote(input: QuoteInput): Promise<Quote> {
    if (!/^[A-Za-z0-9]{1,40}$/.test(input.planId))
      throw new Error(`Invalid planId "${input.planId}".`);
    if (!BILLING_CYCLES.includes(input.cycle))
      throw new Error(`Unsupported cycle "${input.cycle}".`);
    const q: Record<string, string | number> = {
      type: 'subscription.new',
      planId: input.planId,
      cycle: input.cycle,
      setup: 1,
    };
    if (input.currency) q.currency = input.currency.toUpperCase();
    if (input.country) q.country = input.country.toUpperCase();
    const r = await this.pub.get<
      Partial<Quote> & { ok?: boolean; error?: string; baseAmount?: string }
    >('/_payment/quote', q);
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not price this plan.', { body: r });
    return {
      planId: String(r.planId ?? input.planId),
      cycle: String(r.cycle ?? input.cycle),
      currency: String(r.currency ?? ''),
      lineItems: (r.lineItems ?? []).map((l) => ({
        label: l.label,
        amount: l.amount,
        amountUSD: l.amountUSD,
      })),
      subtotal: String(r.subtotal ?? ''),
      taxRate: String(r.taxRate ?? ''),
      taxLabel: String(r.taxLabel ?? ''),
      taxAmount: String(r.taxAmount ?? ''),
      discountAmount: String(r.discountAmount ?? ''),
      total: String(r.total ?? ''),
      fxRate: String(r.fxRate ?? ''),
      baseAmountUSD: String(r.baseAmount ?? ''),
    };
  }

  /** The caller's own subscriptions (rows they own), newest first. */
  async subscriptions(): Promise<BillingSubscription[]> {
    const r = await this.client.console<{
      ok?: boolean;
      error?: string;
      subscriptions?: BillingSubscription[];
    }>('GET', '/account/subscriptions', { tolerateHttpError: true });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not load subscriptions.', { body: r });
    return r.subscriptions ?? [];
  }

  /** The caller's own invoices, newest first. */
  async invoices(opts: { status?: string; limit?: number } = {}): Promise<Invoice[]> {
    const q: Record<string, string> = {};
    if (opts.status) q.status = opts.status;
    if (opts.limit) q.limit = String(opts.limit);
    const r = await this.client.console<{ ok?: boolean; error?: string; invoices?: Invoice[] }>(
      'GET',
      '/account/invoices',
      { tolerateHttpError: true, query: q },
    );
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not load invoices.', { body: r });
    // Only an open invoice can be paid (the first console release also linked void ones).
    return (r.invoices ?? []).map((i) => ({ ...i, payUrl: isPayable(i.status) ? i.payUrl : null }));
  }
}
