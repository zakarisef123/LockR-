// Faux client Stripe en mémoire, pour les tests automatisés : reproduit les
// états utiles (session payée, empreinte autorisée, débit, annulation, Connect).
let n = 0;
const id = p => `${p}_test${++n}${Math.random().toString(36).slice(2, 8)}`;

export function createFakeStripe({ baseUrl = "http://localhost:5173" } = {}) {
  const sessions = new Map();
  const intents = new Map();
  const accounts = new Map();
  const calls = [];

  const stripe = {
    calls,
    sessions, intents, accounts,
    checkout: {
      sessions: {
        async create(params) {
          calls.push(["checkout.sessions.create", params]);
          const cents = params.line_items[0].price_data.unit_amount;
          const pid = id("pi");
          const manual = params.payment_intent_data?.capture_method === "manual";
          intents.set(pid, {
            id: pid, object: "payment_intent", amount: cents, amount_capturable: 0, amount_received: 0,
            status: "requires_payment_method", capture_method: manual ? "manual" : "automatic",
            metadata: params.payment_intent_data?.metadata || {},
            transfer_data: params.payment_intent_data?.transfer_data || null,
            application_fee_amount: params.payment_intent_data?.application_fee_amount || null,
          });
          const sid = id("cs");
          const s = {
            id: sid, object: "checkout.session", status: "open", payment_status: "unpaid",
            amount_total: cents, metadata: params.metadata || {}, payment_intent: pid, livemode: false,
            customer_email: params.customer_email || null,
            success_url: params.success_url, cancel_url: params.cancel_url,
            url: `${baseUrl}/__fake_checkout/${sid}`,
          };
          sessions.set(sid, s);
          return { ...s };
        },
        async retrieve(sid, opts = {}) {
          calls.push(["checkout.sessions.retrieve", sid, opts]);
          const s = sessions.get(sid);
          if (!s) { const e = new Error("No such checkout.session"); e.code = "resource_missing"; e.statusCode = 404; throw e; }
          const out = { ...s };
          if ((opts.expand || []).includes("payment_intent")) out.payment_intent = { ...intents.get(s.payment_intent) };
          return out;
        },
      },
    },
    paymentIntents: {
      async retrieve(pid) {
        calls.push(["paymentIntents.retrieve", pid]);
        const pi = intents.get(pid);
        if (!pi) { const e = new Error("No such payment_intent"); e.code = "resource_missing"; e.statusCode = 404; throw e; }
        return { ...pi };
      },
      async capture(pid, params = {}) {
        calls.push(["paymentIntents.capture", pid, params]);
        const pi = intents.get(pid);
        if (pi.status !== "requires_capture") throw new Error("PaymentIntent not capturable");
        if (params.amount_to_capture > pi.amount_capturable) throw new Error("amount_to_capture too large");
        Object.assign(pi, { status: "succeeded", amount_received: params.amount_to_capture ?? pi.amount_capturable, amount_capturable: 0, application_fee_amount: params.application_fee_amount ?? pi.application_fee_amount });
        return { ...pi };
      },
      async cancel(pid) {
        calls.push(["paymentIntents.cancel", pid]);
        const pi = intents.get(pid);
        Object.assign(pi, { status: "canceled", amount_capturable: 0 });
        return { ...pi };
      },
    },
    accounts: {
      async create(params) {
        calls.push(["accounts.create", params]);
        const a = { id: id("acct"), details_submitted: false, capabilities: { transfers: "inactive" }, ...params };
        accounts.set(a.id, a);
        return { ...a };
      },
      async retrieve(aid) {
        calls.push(["accounts.retrieve", aid]);
        const a = accounts.get(aid);
        if (!a) { const e = new Error("No such account"); e.code = "resource_missing"; e.statusCode = 404; throw e; }
        return { ...a };
      },
    },
    accountLinks: {
      async create(params) {
        calls.push(["accountLinks.create", params]);
        return { url: `https://connect.stripe.test/onboarding/${params.account}` };
      },
    },
    webhooks: {
      constructEvent(body, sig, secret) {
        if (sig !== `ok:${secret}`) throw new Error("bad signature");
        return JSON.parse(body);
      },
    },

    // ── Simulations (ce que fait le client sur la page Stripe) ──
    completeSession(sid) {
      const s = sessions.get(sid);
      const pi = intents.get(s.payment_intent);
      s.status = "complete";
      if (pi.capture_method === "manual") { pi.status = "requires_capture"; pi.amount_capturable = pi.amount; }
      else { pi.status = "succeeded"; pi.amount_received = pi.amount; s.payment_status = "paid"; }
      return s;
    },
    expireIntent(pid) { const pi = intents.get(pid); pi.status = "canceled"; pi.amount_capturable = 0; },
    finishOnboarding(aid) { const a = accounts.get(aid); a.details_submitted = true; a.capabilities = { transfers: "active" }; },
  };
  return stripe;
}
