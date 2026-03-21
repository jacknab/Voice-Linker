import Stripe from "stripe";

export async function getUncachableStripeClient(): Promise<Stripe> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (hostname) {
    try {
      const connectorId = "ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y";
      const response = await fetch(
        `http://${hostname}/v1/connectors/${connectorId}`,
        {
          headers: {
            "X-Replit-Identity": process.env.REPL_IDENTITY || "",
          },
        }
      );
      if (response.ok) {
        const data = (await response.json()) as { secretKey: string };
        return new Stripe(data.secretKey);
      }
    } catch (err) {
      console.warn("[stripe] Connector API unavailable, falling back to env var:", err);
    }
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Stripe is not configured. Please connect the Stripe integration or set STRIPE_SECRET_KEY."
    );
  }
  return new Stripe(secretKey);
}
