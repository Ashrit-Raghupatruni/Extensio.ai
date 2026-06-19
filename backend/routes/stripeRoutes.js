import express from "express";
import Stripe from "stripe";
import User from "../models/User.js";
import { requireAuth } from "../utils/auth.js";
import StripeEvent from "../models/StripeEvent.js";

const router = express.Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/**
 * POST /api/stripe/create-checkout-session
 * Creates a Stripe Checkout session for the authenticated user.
 */
router.post("/create-checkout-session", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY in environment." });
    }

    const user = req.user;

    // If user already has a Stripe customer ID, reuse it
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: user._id.toString(), username: user.username },
      });
      customerId = customer.id;

      // Save Stripe customer ID to user
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL || "http://localhost:4000"}?upgrade=success`,
      cancel_url: `${process.env.APP_URL || "http://localhost:4000"}?upgrade=cancelled`,
      metadata: { userId: user._id.toString() },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/checkout] error:", error.message);
    res.status(500).json({ error: "Failed to create checkout session." });
  }
});

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 * NOTE: This endpoint receives raw body (configured in server.js).
 */
router.post("/webhook", async (req, res) => {
  const isBypass = process.env.NODE_ENV !== "production" &&
                   process.env.RATE_LIMIT_BYPASS_SECRET &&
                   req.headers["x-bypass-rate-limit"] === process.env.RATE_LIMIT_BYPASS_SECRET;

  if (!stripe && !isBypass) {
    return res.status(503).json({ error: "Stripe not configured." });
  }

  const sig = req.headers["stripe-signature"];
  let event;

  // Developer bypass for testing webhook endpoints without signatures in development/test
  if (process.env.NODE_ENV !== "production" &&
      process.env.RATE_LIMIT_BYPASS_SECRET &&
      req.headers["x-bypass-rate-limit"] === process.env.RATE_LIMIT_BYPASS_SECRET) {
    try {
      event = typeof req.body === "string" 
        ? JSON.parse(req.body) 
        : (Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body);
    } catch (parseErr) {
      console.error("[stripe/webhook] Failed to parse bypassed JSON body:", parseErr.message);
      return res.status(400).json({ error: "Failed to parse JSON body." });
    }
  } else {
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("[stripe/webhook] Signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook signature verification failed.` });
    }
  }

  const eventId = event.id;
  try {
    const existingEvent = await StripeEvent.findOne({ eventId });
    if (existingEvent) {
      console.log(`[stripe/webhook] Event ${eventId} was already processed. Skipping.`);
      return res.json({ received: true, duplicate: true });
    }
    await StripeEvent.create({ eventId });
  } catch (dbErr) {
    console.error("[stripe/webhook] Idempotency DB check/write failed:", dbErr.message);
  }

  console.log(`[stripe/webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const subscriptionId = session.subscription;

        if (userId) {
          await User.findByIdAndUpdate(userId, {
            subscriptionTier: "premium",
            stripeSubscriptionId: subscriptionId,
          });
          console.log(`[stripe/webhook] User ${userId} upgraded to premium!`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (user) {
          user.subscriptionTier = "free";
          user.stripeSubscriptionId = null;
          await user.save();
          console.log(`[stripe/webhook] User ${user._id} subscription cancelled, reverted to free.`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (user) {
          if (subscription.status === "active") {
            user.subscriptionTier = "premium";
          } else if (["past_due", "unpaid", "canceled"].includes(subscription.status)) {
            user.subscriptionTier = "free";
          }
          await user.save();
          console.log(`[stripe/webhook] User ${user._id} subscription status: ${subscription.status}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.warn(`[stripe/webhook] Payment failed for customer: ${invoice.customer}`);
        break;
      }

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`[stripe/webhook] Error processing event ${event.type}:`, error.message);
  }

  // Always return 200 to acknowledge receipt
  res.json({ received: true });
});

/**
 * POST /api/stripe/portal
 * Creates a Stripe Customer Portal session for managing subscriptions.
 */
router.post("/portal", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured." });
    }

    const user = req.user;

    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: "No active subscription found." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: process.env.APP_URL || "http://localhost:4000",
    });

    res.json({ url: portalSession.url });
  } catch (error) {
    console.error("[stripe/portal] error:", error.message);
    res.status(500).json({ error: "Failed to create portal session." });
  }
});

export default router;
