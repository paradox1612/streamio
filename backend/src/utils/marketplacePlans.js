function normalizeBillingPeriod(value) {
  const normalized = String(value || 'month').trim().toLowerCase();
  if (normalized === 'day' || normalized === 'month' || normalized === 'year') return normalized;
  return 'month';
}

function normalizePositiveInt(value, fallback = 1) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildDefaultPlan(offering = {}) {
  return {
    code: 'default',
    name: offering.trial_days > 0
      ? `${offering.trial_days} Day Trial`
      : `${normalizePositiveInt(offering.billing_interval_count || 1, 1)} ${normalizeBillingPeriod(offering.billing_period || 'month')}`,
    price_cents: normalizePositiveInt(offering.price_cents || 0, 0),
    currency: String(offering.currency || 'usd').toLowerCase(),
    billing_period: normalizeBillingPeriod(offering.billing_period || 'month'),
    billing_interval_count: normalizePositiveInt(offering.billing_interval_count || 1, 1),
    trial_days: normalizePositiveInt(offering.trial_days || 0, 0),
    max_connections: normalizePositiveInt(offering.max_connections || 1, 1),
    reseller_bouquet_ids: Array.isArray(offering.reseller_bouquet_ids) ? offering.reseller_bouquet_ids : [],
    is_trial: normalizePositiveInt(offering.trial_days || 0, 0) > 0,
  };
}

function normalizePlanOptions(offering = {}) {
  const basePlan = buildDefaultPlan(offering);
  const rawPlans = Array.isArray(offering.plan_options) ? offering.plan_options : [];

  if (!rawPlans.length) return [basePlan];

  return rawPlans.map((plan, index) => ({
    code: String(plan.code || `plan_${index + 1}`).trim(),
    name: String(plan.name || plan.label || `${plan.billing_interval_count || basePlan.billing_interval_count} ${plan.billing_period || basePlan.billing_period}`).trim(),
    price_cents: normalizePositiveInt(plan.price_cents ?? basePlan.price_cents, basePlan.price_cents),
    currency: String(plan.currency || basePlan.currency || 'usd').toLowerCase(),
    billing_period: normalizeBillingPeriod(plan.billing_period || basePlan.billing_period),
    billing_interval_count: normalizePositiveInt(plan.billing_interval_count ?? basePlan.billing_interval_count, basePlan.billing_interval_count),
    trial_days: normalizePositiveInt(plan.trial_days ?? 0, 0),
    max_connections: normalizePositiveInt(plan.max_connections ?? basePlan.max_connections, basePlan.max_connections),
    reseller_bouquet_ids: Array.isArray(plan.reseller_bouquet_ids)
      ? plan.reseller_bouquet_ids.map((value) => String(value))
      : basePlan.reseller_bouquet_ids,
    is_trial: plan.is_trial === true || normalizePositiveInt(plan.trial_days ?? 0, 0) > 0,
  })).filter((plan) => plan.code && plan.name && Number.isFinite(plan.price_cents));
}

function resolveSelectedPlan(offering = {}, requestedCode = null) {
  const planOptions = normalizePlanOptions(offering);
  if (!requestedCode) return planOptions[0];
  return planOptions.find((plan) => plan.code === requestedCode) || planOptions[0];
}

function addInterval(date, billingPeriod, intervalCount) {
  const next = new Date(date);
  if (billingPeriod === 'year') {
    next.setFullYear(next.getFullYear() + intervalCount);
    return next;
  }
  if (billingPeriod === 'day') {
    next.setDate(next.getDate() + intervalCount);
    return next;
  }
  next.setMonth(next.getMonth() + intervalCount);
  return next;
}

function calculatePeriodEnd(plan, startDate = new Date()) {
  const billingPeriod = normalizeBillingPeriod(plan?.billing_period || 'month');
  const intervalCount = normalizePositiveInt(plan?.billing_interval_count || 1, 1);
  return addInterval(startDate, billingPeriod, intervalCount);
}

module.exports = {
  normalizeBillingPeriod,
  normalizePositiveInt,
  normalizePlanOptions,
  resolveSelectedPlan,
  calculatePeriodEnd,
};
