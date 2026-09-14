// Stripe webhook handler -- the ONLY place a team is ever granted more than
// the free 2-seat limit. Runs server-side only (Vercel serverless function);
// never trusts anything the browser sends about which plan was "supposed"
// to be paid for -- the seat count below is derived from what Stripe
// reports was actually charged.
//
// Required environment variables (set in Vercel -> Project Settings ->
// Environment Variables, never committed to the repo):
//   STRIPE_SECRET_KEY        Stripe secret key (sk_live_... / sk_test_...)
//   STRIPE_WEBHOOK_SECRET    signing secret for this endpoint (whsec_...),
//                            from Stripe Dashboard -> Developers -> Webhooks
//                            -> (this endpoint) -> Signing secret
//   SUPABASE_URL             same project URL the client uses
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service_role key (Project Settings
//                            -> API -> service_role secret) -- NOT the anon
//                            key. Bypasses RLS; must never reach the browser.
//
// Vercel config: this endpoint needs the raw request body to verify
// Stripe's signature, so automatic JSON body parsing is disabled below.

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cents -> seat count. Must stay in sync with PLAN_PRICES/STRIPE_LINKS in
// app.js if pricing ever changes -- this is the authoritative mapping used
// to decide how many seats a payment actually unlocks.
const CENTS_TO_SEATS = {
  1500: 5,   // Starter  - $15/mo
  3000: 10,  // Growth   - $30/mo
  5000: 15,  // Team     - $50/mo
  7000: 20,  // Business - $70/mo
};

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);
    } else if (event.type === 'customer.subscription.deleted') {
      await handleSubscriptionCanceled(event.data.object);
    }
    // Any other event type is ignored -- still 200 so Stripe doesn't retry.
    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error handling Stripe event ${event.type}:`, err);
    // 500 so Stripe retries this delivery -- consume_pending_team_intent()
    // being atomic makes a retry safe (a second attempt after the intent
    // was already consumed just finds nothing to do).
    res.status(500).json({ error: 'Internal error processing webhook' });
  }
};

async function handleCheckoutCompleted(session) {
  if (session.mode !== 'subscription' || session.payment_status !== 'paid') return;

  const userId = session.client_reference_id;
  if (!userId) {
    console.error('checkout.session.completed with no client_reference_id', session.id);
    return;
  }

  const seats = CENTS_TO_SEATS[session.amount_total];
  if (!seats) {
    console.error('checkout.session.completed with an amount that matches no known plan', session.id, session.amount_total);
    return;
  }

  const { data: intent, error: intentErr } = await supabaseAdmin.rpc('consume_pending_team_intent', { _user_id: userId });
  if (intentErr) {
    console.error('consume_pending_team_intent failed', intentErr);
    throw intentErr;
  }
  if (!intent) {
    // Either already processed by a previous delivery of this same event
    // (Stripe can retry/duplicate), or the user never went through our
    // signup flow. Either way, there's nothing left to create.
    console.warn('No pending_team_intents row for user (likely already processed)', userId);
    return;
  }

  const { error: activateErr } = await supabaseAdmin.rpc('activate_paid_team', {
    _user_id: userId,
    _team_name: intent.team_name,
    _display_name: intent.display_name,
    _max_users: seats,
    _stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
    _stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
  });
  if (activateErr) {
    console.error('activate_paid_team failed', activateErr);
    throw activateErr;
  }
}

async function handleSubscriptionCanceled(subscription) {
  const { error } = await supabaseAdmin.rpc('downgrade_team_to_free', { _stripe_subscription_id: subscription.id });
  if (error) {
    console.error('downgrade_team_to_free failed', error);
    throw error;
  }
}
