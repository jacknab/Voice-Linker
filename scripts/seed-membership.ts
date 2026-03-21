import { getUncachableStripeClient } from "../server/stripeClient";

const MEMBERSHIP_PRODUCTS = [
  {
    name: "Bronze Membership",
    description: "Full access to profiles, messaging, and community features.",
    priceCents: 999,
  },
  {
    name: "Silver Membership",
    description: "Everything in Bronze plus enhanced profile visibility.",
    priceCents: 1999,
  },
  {
    name: "Gold Membership",
    description: "Everything in Silver plus priority placement and exclusive features.",
    priceCents: 2999,
  },
];

async function seedMembership() {
  console.log("Connecting to Stripe...");
  const stripe = await getUncachableStripeClient();

  for (const plan of MEMBERSHIP_PRODUCTS) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`  ✓ ${plan.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.priceCents,
      currency: "usd",
      recurring: { interval: "month" },
    });

    console.log(`  ✓ Created ${plan.name}: ${product.id} / ${price.id} ($${plan.priceCents / 100}/mo)`);
  }

  console.log("Done. Membership products are ready in Stripe.");
}

seedMembership().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
