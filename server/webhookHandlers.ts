import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";

// Shared set with routes.ts isn't possible directly, but webhook as safety net
// uses a separate in-memory set so it doesn't double-credit if routes.ts already did.
const webhookProcessedSessions = new Set<string>();

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "This usually means express.json() parsed the body before reaching this handler."
      );
    }

    const stripe = await getUncachableStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
    }

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    console.log(`[stripe] webhook event: ${event.type}`);

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as { metadata?: { userId?: string }; description?: string };
      console.log(`[stripe] payment_intent.succeeded for userId=${pi.metadata?.userId}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        payment_status: string;
        metadata?: Record<string, string>;
      };

      if (session.payment_status !== "paid") return;

      const meta = session.metadata || {};
      const sessionId = session.id;
      const planName = meta.planName || "";
      const planMinutes = parseInt(meta.planMinutes || "0", 10);
      const linkedPhone = meta.linkedPhoneNumber || "";

      if (!webhookProcessedSessions.has(sessionId) && linkedPhone && planMinutes > 0) {
        webhookProcessedSessions.add(sessionId);
        try {
          const phoneUser = await storage.getUserByPhone(linkedPhone);
          if (phoneUser) {
            const addedSeconds = planMinutes * 60;
            const currentSeconds = phoneUser.remainingSeconds ?? 0;
            await storage.updateUserMembership(phoneUser.id, {
              membershipTier: planName.toLowerCase(),
              remainingSeconds: currentSeconds + addedSeconds,
              membershipStartedAt: phoneUser.membershipStartedAt ?? new Date(),
              membershipPurchasedAt: new Date(),
            });
            console.log(`[stripe] webhook: Applied ${planName} to phone=${linkedPhone}, added ${addedSeconds}s`);
          }
        } catch (err) {
          console.error("[stripe] webhook: Failed to apply membership:", err);
        }
      }
    }
  }
}
