import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";

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
  }
}
