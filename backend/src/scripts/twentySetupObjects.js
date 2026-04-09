#!/usr/bin/env node
/**
 * One-time setup script: create Twenty CRM custom objects for StreamBridge.
 *
 * Run after Twenty CRM is live and TWENTY_API_KEY + TWENTY_API_URL are set:
 *   node backend/src/scripts/twentySetupObjects.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fetch = require('node-fetch');
const logger = require('../utils/logger');

const BASE_URL = process.env.TWENTY_API_URL || 'http://localhost:3002';
const API_KEY = process.env.TWENTY_API_KEY;

if (!API_KEY) {
  console.error('Error: TWENTY_API_KEY is not set in backend/.env');
  process.exit(1);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  };
}

async function metaQuery(query, variables = {}) {
  const res = await fetch(`${BASE_URL}/metadata`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL: ${json.errors.map((e) => e.message).join(', ')}`);
  }
  return json.data;
}

async function getOrCreateObject({ nameSingular, namePlural, labelSingular, labelPlural, description, icon }) {
  // Check if it already exists (ObjectFilter has no nameSingular — fetch all and match client-side)
  const existing = await metaQuery(`{ objects(paging: { first: 100 }) { edges { node { id nameSingular } } } }`);
  const existingId = existing?.objects?.edges?.find((e) => e.node.nameSingular === nameSingular)?.node?.id;
  if (existingId) {
    console.log(`  Object already exists: ${nameSingular} (${existingId})`);
    return existingId;
  }

  try {
    const data = await metaQuery(`
      mutation CreateObject($input: CreateOneObjectInput!) {
        createOneObject(input: $input) { id nameSingular }
      }
    `, {
      input: { object: { nameSingular, namePlural, labelSingular, labelPlural, description, icon } },
    });
    console.log(`✓ Created object: ${nameSingular} (${data.createOneObject.id})`);
    return data.createOneObject.id;
  } catch (err) {
    throw err;
  }
}

async function createField(objectId, fieldInput) {
  try {
    const data = await metaQuery(`
      mutation CreateField($input: CreateOneFieldMetadataInput!) {
        createOneField(input: $input) { id name }
      }
    `, {
      input: { field: { objectMetadataId: objectId, ...fieldInput } },
    });
    console.log(`  ✓ Field: ${fieldInput.name}`);
    return data.createOneField.id;
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('NOT_AVAILABLE') || msg.includes('not available')) {
      console.log(`    Field already exists: ${fieldInput.name}`);
      return null;
    }
    // Twenty wraps ALL field validation errors in "Multiple validation errors" — log details and skip
    if (msg.includes('Multiple validation errors')) {
      console.log(`    Skipping field ${fieldInput.name} (already exists or conflicts): ${msg}`);
      return null;
    }
    throw err;
  }
}

async function main() {
  console.log(`\nConnecting to Twenty CRM at ${BASE_URL}...\n`);

  // ── Step 1: ProviderOffering custom object ───────────────────────────────────
  console.log('Creating ProviderOffering object...');
  const offeringId = await getOrCreateObject({
    nameSingular: 'providerOffering',
    namePlural: 'providerOfferings',
    labelSingular: 'Provider Offering',
    labelPlural: 'Provider Offerings',
    description: 'IPTV provider subscription plan available in the StreamBridge marketplace',
    icon: 'IconShoppingCart',
  });

  await createField(offeringId, { name: 'streamioId', label: 'Streamio ID', type: 'TEXT', defaultValue: null });
  await createField(offeringId, { name: 'priceCents', label: 'Price (cents)', type: 'NUMBER', defaultValue: 0 });
  await createField(offeringId, { name: 'billingPeriod', label: 'Billing Period', type: 'SELECT',
    options: [
      { value: 'MONTH', label: 'Monthly', color: 'blue', position: 0 },
      { value: 'YEAR',  label: 'Yearly',  color: 'green', position: 1 },
    ],
    defaultValue: "'MONTH'",
  });
  await createField(offeringId, { name: 'trialDays', label: 'Trial Days', type: 'NUMBER', defaultValue: 0 });
  await createField(offeringId, { name: 'isActive', label: 'Is Active', type: 'BOOLEAN', defaultValue: true });

  // ── Step 2: Subscription custom object ───────────────────────────────────────
  console.log('\nCreating Subscription object...');
  const subscriptionId = await getOrCreateObject({
    nameSingular: 'subscription',
    namePlural: 'subscriptions',
    labelSingular: 'Subscription',
    labelPlural: 'Subscriptions',
    description: "A customer's active or historical StreamBridge subscription",
    icon: 'IconReceipt',
  });

  await createField(subscriptionId, { name: 'streamioId', label: 'Streamio ID', type: 'TEXT', defaultValue: null });
  await createField(subscriptionId, { name: 'stripeSubscriptionId', label: 'Stripe Subscription ID', type: 'TEXT', defaultValue: null });
  await createField(subscriptionId, { name: 'status', label: 'Status', type: 'SELECT',
    options: [
      { value: 'ACTIVE',    label: 'Active',    color: 'green',  position: 0 },
      { value: 'TRIALING',  label: 'Trialing',  color: 'blue',   position: 1 },
      { value: 'PAST_DUE',  label: 'Past Due',  color: 'orange', position: 2 },
      { value: 'CANCELLED', label: 'Cancelled', color: 'red',    position: 3 },
    ],
    defaultValue: "'ACTIVE'",
  });
  await createField(subscriptionId, { name: 'currentPeriodEnd', label: 'Current Period End', type: 'DATE_TIME', defaultValue: null });
  await createField(subscriptionId, { name: 'cancelAtPeriodEnd', label: 'Cancel at Period End', type: 'BOOLEAN', defaultValue: false });
  await createField(subscriptionId, { name: 'personId', label: 'Person ID', type: 'TEXT', defaultValue: null });

  // ── Step 3: ProviderAccess custom object ─────────────────────────────────────
  console.log('\nCreating ProviderAccess object...');
  const providerAccessId = await getOrCreateObject({
    nameSingular: 'providerAccess',
    namePlural: 'providerAccesses',
    labelSingular: 'Provider Access',
    labelPlural: 'Provider Accesses',
    description: 'A user-specific provider access record, whether marketplace-managed or externally supplied',
    icon: 'IconPlugConnected',
  });

  await createField(providerAccessId, { name: 'streamioId', label: 'Streamio ID', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'personId', label: 'Person ID', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'companyId', label: 'Company ID', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'providerName', label: 'Provider Name', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'sourceType', label: 'Source Type', type: 'SELECT',
    options: [
      { value: 'MARKETPLACE', label: 'Marketplace', color: 'green', position: 0 },
      { value: 'EXTERNAL', label: 'External', color: 'blue', position: 1 },
    ],
    defaultValue: "'EXTERNAL'",
  });
  await createField(providerAccessId, { name: 'providerStatus', label: 'Provider Status', type: 'SELECT',
    options: [
      { value: 'ONLINE', label: 'Online', color: 'green', position: 0 },
      { value: 'OFFLINE', label: 'Offline', color: 'red', position: 1 },
      { value: 'UNKNOWN', label: 'Unknown', color: 'gray', position: 2 },
    ],
    defaultValue: "'UNKNOWN'",
  });
  await createField(providerAccessId, { name: 'accountStatus', label: 'Account Status', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'accountExpiresAt', label: 'Account Expires At', type: 'DATE_TIME', defaultValue: null });
  await createField(providerAccessId, { name: 'isTrial', label: 'Is Trial', type: 'BOOLEAN', defaultValue: false });
  await createField(providerAccessId, { name: 'maxConnections', label: 'Max Connections', type: 'NUMBER', defaultValue: 0 });
  await createField(providerAccessId, { name: 'activeConnections', label: 'Active Connections', type: 'NUMBER', defaultValue: 0 });
  await createField(providerAccessId, { name: 'primaryHost', label: 'Primary Host', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'hostCount', label: 'Host Count', type: 'NUMBER', defaultValue: 0 });
  await createField(providerAccessId, { name: 'hostList', label: 'Host List', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'networkId', label: 'Network ID', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'networkName', label: 'Network Name', type: 'TEXT', defaultValue: null });
  await createField(providerAccessId, { name: 'accountLastSyncedAt', label: 'Account Last Synced At', type: 'DATE_TIME', defaultValue: null });

  // ── Step 4: Custom fields on Person + Company ────────────────────────────────
  console.log('\nAdding custom fields to Person object...');

  // Look up Person object ID
  const objectsData = await metaQuery(`{ objects(paging: { first: 100 }) { edges { node { id nameSingular } } } }`);
  const personObjectId = objectsData?.objects?.edges?.find((e) => e.node.nameSingular === 'person')?.node?.id;
  const companyObjectId = objectsData?.objects?.edges?.find((e) => e.node.nameSingular === 'company')?.node?.id;

  if (personObjectId) {
    await createField(personObjectId, { name: 'streamioId', label: 'Streamio ID', type: 'TEXT', defaultValue: null });
    await createField(personObjectId, { name: 'accountStatus', label: 'Account Status', type: 'SELECT',
      options: [
        { value: 'ACTIVE',   label: 'Active',   color: 'green', position: 0 },
        { value: 'INACTIVE', label: 'Inactive', color: 'red',   position: 1 },
        { value: 'TRIAL',    label: 'Trial',    color: 'blue',  position: 2 },
      ],
      defaultValue: "'ACTIVE'",
    });
    await createField(personObjectId, { name: 'lastActiveAt', label: 'Last Active At', type: 'DATE_TIME', defaultValue: null });
  } else {
    console.warn('  Could not find Person object — skipping custom person fields');
  }

  if (companyObjectId) {
    console.log('\nAdding custom fields to Company object...');
    await createField(companyObjectId, { name: 'streamioNetworkId', label: 'Streamio Network ID', type: 'TEXT', defaultValue: null });
  } else {
    console.warn('  Could not find Company object — skipping custom company fields');
  }

  console.log('\n✓ Setup complete. Verify objects appear in Twenty UI under Settings → Data Model.\n');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
