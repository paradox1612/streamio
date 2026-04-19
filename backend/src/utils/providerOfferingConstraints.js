function formatAllowedValues(values = []) {
  return values.map((value) => `"${value}"`).join(', ');
}

function buildValidationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function validateField(plan, planLabel, fieldName, fieldLabel, rule) {
  if (!rule?.allowed_values?.length) return;

  const allowedValues = rule.allowed_values.map((value) => String(value));
  const rawValue = plan[fieldName];
  const normalizedValue = rawValue == null ? '' : String(rawValue);

  if (allowedValues.includes(normalizedValue)) return;

  throw buildValidationError(
    `${planLabel} has invalid ${fieldLabel} "${normalizedValue}". Allowed values: ${formatAllowedValues(allowedValues)}.`
  );
}

function validateOfferingPlanConstraints(planOptions = [], constraints = null) {
  if (!constraints || !Array.isArray(planOptions) || planOptions.length === 0) return;

  planOptions.forEach((plan, index) => {
    const planLabel = `Plan "${plan?.name || plan?.code || `#${index + 1}`}"`;
    validateField(plan, planLabel, 'billing_period', 'billing period', constraints.billing_period);
    validateField(plan, planLabel, 'billing_interval_count', 'billing interval count', constraints.billing_interval_count);
  });
}

module.exports = {
  validateOfferingPlanConstraints,
};
