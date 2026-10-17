import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BILLING_CYCLES, type CatalogProduct, Roxyon } from '@roxyon/api-client';
import { endpointsFromEnv } from '@roxyon/deploy-core';
import { z } from 'zod';
import { guard, text } from './result.js';
import { getSession } from './session.js';

/** Catalog and quotes are public: no sign-in, so an agent can price before the user has an account. */
function publicRoxyon(): Roxyon {
  const { apiUrl, consoleUrl } = endpointsFromEnv();
  return new Roxyon({ baseUrl: apiUrl, consoleUrl });
}

function money(n: number | undefined): string {
  return n === undefined ? '—' : `$${n.toFixed(2)}`;
}

function productLine(p: CatalogProduct): string {
  const spec =
    p.vcpu !== undefined
      ? ` — ${p.vcpu} vCPU (${p.cpuType}), ${p.ramGb} GB RAM, ${p.diskGb} GB disk${p.ipv4Included ? `, ${p.ipv4Included} IPv4` : ''}`
      : '';
  const prices = BILLING_CYCLES.filter((c) => p.pricesUSD[c] !== undefined)
    .map((c) => `${c} ${money(p.pricesUSD[c])}`)
    .join(', ');
  return `- ${p.sku || p.planId} "${p.name}" [${p.category}]${spec} | USD ${prices}${p.stock === 'out' ? ' | OUT OF STOCK' : ''} (planId ${p.planId})`;
}

export function registerCommerceTools(server: McpServer): void {
  server.registerTool(
    'roxyon_catalog',
    {
      title: 'Roxyon: product catalog',
      description:
        'List what Roxyon sells: cloud servers (cloud.vps.launch / scale / power) and web hosting ' +
        '(cloud.hosting.solo / multiple / isolated). Each product has its planId (what roxyon_quote ' +
        'takes), SKU, specs (vCPU, RAM GB, disk GB, IPv4 included) for servers, list prices in USD ' +
        'per billing cycle BEFORE tax and currency conversion, and stock ("out" = cannot be ordered ' +
        'now). No sign-in needed. Use roxyon_quote for the exact amount a buyer would pay. Read-only.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe('Filter by category prefix, e.g. "cloud.vps" or "cloud.hosting".'),
        in_stock_only: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        let products = await publicRoxyon().billing.catalog();
        if (args.category) products = products.filter((p) => p.category.startsWith(args.category!));
        if (args.in_stock_only) products = products.filter((p) => p.stock === 'in');
        return text(
          products.length ? products.map(productLine).join('\n') : '(no products match)',
          { products },
        );
      }),
  );

  server.registerTool(
    'roxyon_quote',
    {
      title: 'Roxyon: price a new subscription',
      description:
        "The exact amount Roxyon's checkout would charge for a NEW subscription to one plan, " +
        'computed by the platform itself (same server pricing the console checkout uses, setup fee ' +
        'included): line items, subtotal, tax, total, in the requested currency. Pass the buyer ' +
        'currency and country: without them the quote is in USD with no tax, while checkout uses the ' +
        "account's own currency/country. No sign-in needed. Read-only: creates no order. Domains " +
        'are not priced by this tool yet.',
      inputSchema: {
        plan: z.string().describe('planId (or SKU, e.g. "SCALE-S") from roxyon_catalog.'),
        cycle: z.enum(BILLING_CYCLES),
        currency: z.string().length(3).optional().describe('ISO 4217, e.g. "USD", "SAR".'),
        country: z
          .string()
          .length(2)
          .optional()
          .describe('ISO 3166 alpha-2, decides tax, e.g. "SA".'),
      },
    },
    (args) =>
      guard(async () => {
        const roxyon = publicRoxyon();
        const want = args.plan.toLowerCase();
        const product = (await roxyon.billing.catalog()).find(
          (p) => p.planId === args.plan || p.sku.toLowerCase() === want,
        );
        if (!product)
          throw new Error(`No product "${args.plan}" in the catalog. See roxyon_catalog.`);
        const q = await roxyon.billing.quote({
          planId: product.planId,
          cycle: args.cycle,
          currency: args.currency,
          country: args.country,
        });
        const lines = [
          ...q.lineItems.map((l) => `${l.label}: ${l.amount} ${q.currency}`),
          `Subtotal: ${q.subtotal} ${q.currency}`,
          `${q.taxLabel || 'Tax'} (${q.taxRate}%): ${q.taxAmount} ${q.currency}`,
          `Total: ${q.total} ${q.currency}`,
        ];
        if (product?.stock === 'out') lines.push('Note: this plan is out of stock right now.');
        return text(lines.join('\n'), { quote: q });
      }),
  );

  server.registerTool(
    'roxyon_list_subscriptions',
    {
      title: 'Roxyon: my subscriptions (billing)',
      description:
        "The signed-in user's own subscriptions with billing details: plan + SKU, status, billing " +
        'cycle, recurring price and currency, next billing date, auto-renew, and for servers the ' +
        'state (building / running / stopped…) and public IP. Only subscriptions the user owns. ' +
        'Read-only.',
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const session = await getSession();
        const subs = await session.roxyon.billing.subscriptions();
        const body = subs.length
          ? subs
              .map(
                (s) =>
                  `- ${s.name || s.id} [${s.status}] ${s.plan}${s.sku ? ` (${s.sku})` : ''} — ` +
                  `${s.price} ${s.currency}/${s.cycle || '?'}, next billing ${s.nextBillingDate ?? '—'}` +
                  `${s.autoRenew ? ', auto-renew' : ''}` +
                  `${s.serverState ? `, server ${s.serverState}` : ''}${s.publicIp ? ` ${s.publicIp}` : ''}`,
              )
              .join('\n')
          : '(no subscriptions on this account)';
        return text(body, { subscriptions: subs });
      }),
  );

  server.registerTool(
    'roxyon_list_invoices',
    {
      title: 'Roxyon: my invoices',
      description:
        "The signed-in user's own invoices, newest first: number, type, status (pending = unpaid, " +
        'paid, overdue, void, failed, cancelled), total and currency, due date, and payUrl (the ' +
        'console page where the user pays; null when paid). Read-only: this never pays anything.',
      inputSchema: {
        status: z.enum(['pending', 'paid', 'overdue', 'void', 'failed', 'cancelled']).optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Default 25.'),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const invoices = await session.roxyon.billing.invoices({
          status: args.status,
          limit: args.limit,
        });
        const body = invoices.length
          ? invoices
              .map(
                (i) =>
                  `- #${i.number || i.id} ${i.type} [${i.status}] ${i.total} ${i.currency}, due ${i.dueDate ?? '—'}` +
                  `${i.payUrl ? ` — pay at ${i.payUrl}` : ''}`,
              )
              .join('\n')
          : '(no invoices)';
        return text(body, { invoices });
      }),
  );

  server.registerTool(
    'roxyon_pay_link',
    {
      title: 'Roxyon: where to pay an invoice',
      description:
        'The URL where the signed-in user pays one of their own open invoices (status pending, ' +
        'overdue or failed), plus its amount and due date. Give the invoice number (e.g. ' +
        '"INV2610055") or id from roxyon_list_invoices. A human opens the link and pays in the ' +
        'console; this tool never charges anything. Paid or void invoices have no link.',
      inputSchema: {
        invoice: z.string().min(1).max(40).describe('Invoice number or id.'),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const want = args.invoice.replace(/^#/, '').toLowerCase();
        const inv = (await session.roxyon.billing.invoices({ limit: 100 })).find(
          (i) => i.id.toLowerCase() === want || i.number.toLowerCase() === want,
        );
        if (!inv) {
          throw new Error(
            `No invoice "${args.invoice}" among your latest 100. See roxyon_list_invoices.`,
          );
        }
        if (!inv.payUrl) {
          return text(`Invoice #${inv.number || inv.id} is ${inv.status}: nothing to pay.`, {
            invoice: inv,
          });
        }
        return text(
          `Invoice #${inv.number || inv.id}: ${inv.total} ${inv.currency}, due ${inv.dueDate ?? '—'}.\n` +
            `Pay at ${inv.payUrl} (sign in, open Invoices, choose this invoice).`,
          { invoice: inv, payUrl: inv.payUrl },
        );
      }),
  );
}
