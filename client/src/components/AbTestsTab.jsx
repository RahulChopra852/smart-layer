import { useApi } from '../hooks/useApi';

const FUNNEL_TESTS = [
  { metric: 'ATC', area: 'Product Page', tests: [
    { name: 'Sticky ATC Bar on Scroll', hypothesis: 'A persistent add-to-cart bar visible on scroll reduces friction and increases ATC rate by 5-8% by eliminating the need to scroll back up.', impact: 'High', effort: 'Low' },
    { name: 'Social Proof Near ATC Button', hypothesis: 'Showing "X people bought this today" or star ratings adjacent to the ATC button builds urgency and trust, lifting ATC by 3-5%.', impact: 'Medium', effort: 'Low' },
    { name: 'Variant Selector Simplification', hypothesis: 'Reducing flavor/size options from dropdown to visual swatches lowers cognitive load, improving ATC by 4-6%.', impact: 'Medium', effort: 'Medium' },
    { name: 'Price Anchoring with Strikethrough', hypothesis: 'Showing MRP with strikethrough next to offer price creates perceived value, increasing ATC by 3-7%.', impact: 'High', effort: 'Low' },
    { name: 'Trust Badges Below ATC', hypothesis: 'Adding authenticity guarantee, lab-tested, and free shipping badges below ATC reduces purchase anxiety, lifting ATC 2-4%.', impact: 'Medium', effort: 'Low' },
    { name: 'Bundle Suggestion on PDP', hypothesis: 'Recommending a complementary product bundle (e.g., whey + shaker) increases perceived value and ATC by 5-8%.', impact: 'High', effort: 'Medium' },
    { name: 'Image Gallery with Ingredient Shots', hypothesis: 'Adding nutrition label and ingredient close-ups in the gallery reduces info-seeking exits, improving ATC by 2-4%.', impact: 'Low', effort: 'Medium' },
  ]},
  { metric: 'IC (Initiate Checkout)', area: 'Cart Page', tests: [
    { name: 'Cart Drawer vs Full Cart Page', hypothesis: 'A slide-out cart drawer reduces page loads and context switching, improving cart-to-checkout rate by 8-12%.', impact: 'High', effort: 'High' },
    { name: 'Free Shipping Progress Bar', hypothesis: 'A visual bar showing "Add ₹X more for free shipping" incentivizes upsell and reduces cart abandonment by 5-7%.', impact: 'High', effort: 'Low' },
    { name: 'Express Checkout (GPay/UPI)', hypothesis: 'Adding one-tap UPI/GPay checkout in cart skips the checkout form, increasing IC by 10-15%.', impact: 'High', effort: 'High' },
    { name: 'Remove Distractions in Cart', hypothesis: 'Removing navigation and footer from cart page focuses attention on checkout, improving IC by 3-5%.', impact: 'Medium', effort: 'Low' },
    { name: 'Cart Timer / Urgency Nudge', hypothesis: 'A subtle "Items in cart for 15 min" message creates urgency without being aggressive, lifting IC by 2-4%.', impact: 'Low', effort: 'Low' },
    { name: 'Saved Cart Reminder Email', hypothesis: 'Sending an abandoned cart email within 1 hour recovers 5-8% of abandoned carts that didn\'t initiate checkout.', impact: 'High', effort: 'Medium' },
  ]},
  { metric: 'RPP (Reached Payment)', area: 'Checkout Flow', tests: [
    { name: 'Guest Checkout Default', hypothesis: 'Defaulting to guest checkout instead of requiring login reduces checkout form drop-off, improving RPP by 8-12%.', impact: 'High', effort: 'Medium' },
    { name: 'Address Autofill with Pincode', hypothesis: 'Auto-populating city/state from pincode reduces form fields by 2, improving checkout completion by 5-8%.', impact: 'High', effort: 'Medium' },
    { name: 'Single-Page Checkout', hypothesis: 'Collapsing multi-step checkout into one page reduces perceived effort and improves RPP by 6-10%.', impact: 'High', effort: 'High' },
    { name: 'COD vs Prepaid Prominence', hypothesis: 'Showing COD option prominently (but incentivizing prepaid with ₹50 off) balances CVR and margin, improving RPP by 3-5%.', impact: 'Medium', effort: 'Low' },
    { name: 'Order Summary Always Visible', hypothesis: 'A sticky order summary sidebar during checkout reduces uncertainty and back-navigation, improving RPP by 2-4%.', impact: 'Medium', effort: 'Medium' },
    { name: 'Trust Seals on Payment Page', hypothesis: 'Adding SSL, secure payment, and money-back guarantee badges on payment page reduces payment anxiety, lifting RPP by 3-5%.', impact: 'Medium', effort: 'Low' },
  ]},
  { metric: 'CVR (Overall)', area: 'Sitewide', tests: [
    { name: 'Exit-Intent Popup with Offer', hypothesis: 'Triggering a 10% off popup on exit intent captures 3-5% of bouncing visitors and brings them into the funnel.', impact: 'Medium', effort: 'Low' },
    { name: 'Personalized Landing Pages by UTM', hypothesis: 'Matching landing page hero/CTA to the ad that drove the click improves relevance and CVR by 15-25% for paid traffic.', impact: 'High', effort: 'High' },
    { name: 'Mobile Navigation Simplification', hypothesis: 'Reducing mobile menu depth from 3 to 2 levels and adding search prominence reduces bounce and improves CVR by 3-5%.', impact: 'Medium', effort: 'Medium' },
    { name: 'WhatsApp Chat Widget', hypothesis: 'Adding a WhatsApp chat widget for pre-purchase queries converts hesitant browsers, improving CVR by 2-4%.', impact: 'Medium', effort: 'Low' },
    { name: 'Collection Page Grid Density', hypothesis: 'Testing 3-column vs 2-column product grid on mobile affects product discovery — 2-col with larger images may lift CVR 3-5%.', impact: 'Medium', effort: 'Low' },
    { name: 'First-Purchase Coupon Banner', hypothesis: 'A persistent top banner offering ₹200 off first order (min ₹999) improves new visitor CVR by 8-12%.', impact: 'High', effort: 'Low' },
  ]},
];

function PriorityBadge({ level }) {
  const colors = { High: 'bg-negative/10 text-negative', Medium: 'bg-warning/10 text-warning', Low: 'bg-positive/10 text-positive' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[level] || ''}`}>{level}</span>;
}

function EffortBadge({ level }) {
  const colors = { High: 'text-negative', Medium: 'text-warning', Low: 'text-positive' };
  return <span className={`text-[10px] font-medium ${colors[level] || 'text-text-muted'}`}>{level} effort</span>;
}

export default function AbTestsTab({ start, end }) {
  const { data } = useApi(`/api/analytics/cro-funnel-deltas?start=${start}&end=${end}`);

  const webLatest = data?.web?.[data.web.length - 1];
  const context = webLatest ? {
    atc_pct: webLatest.atc_pct,
    ic_pct: webLatest.ic_pct,
    rpp_pct: webLatest.rpp_pct,
    cvr_pct: webLatest.cvr_pct,
  } : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Context banner */}
      {context && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-base font-semibold text-text-primary mb-2">Current Funnel State</h2>
          <p className="text-xs text-text-muted mb-3">Tests are prioritized based on the biggest conversion drop-offs in your funnel</p>
          <div className="flex gap-4">
            {[
              { label: 'ATC %', val: context.atc_pct },
              { label: 'IC %', val: context.ic_pct },
              { label: 'RPP %', val: context.rpp_pct },
              { label: 'CVR %', val: context.cvr_pct },
            ].map(m => (
              <div key={m.label} className="flex-1 bg-bg rounded-md p-3 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted uppercase">{m.label}</div>
                <div className="text-lg font-bold text-text-primary">{m.val != null ? `${m.val.toFixed(1)}%` : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test categories */}
      {FUNNEL_TESTS.map(category => (
        <div key={category.metric} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">{category.metric} Optimization</h2>
              <p className="text-xs text-text-muted mt-0.5">Target area: {category.area}</p>
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {category.tests.length} tests
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {category.tests.map((test, i) => (
              <div key={i} className="bg-bg rounded-md p-3 border border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-medium text-text-primary">{test.name}</h3>
                  <div className="flex items-center gap-2">
                    <PriorityBadge level={test.impact} />
                    <EffortBadge level={test.effort} />
                  </div>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{test.hypothesis}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
