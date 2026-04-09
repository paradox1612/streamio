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

async function createObject({ nameSingular, namePlural, labelSingular, labelPlural, description, icon }) {
  try {
    const data = await metaQuery(`
      mutation CreateObject($input: CreateOneObjectInput!) {
        createOneObject(input: $input) { id nameSingular }
      }
    `, {
      input: { nameSingular, namePlural, labelSingular, labelPlural, description, icon },
    });
    console.log(`✓ Created object: ${nameSingular} (${data.createOneObject.id})`);
    return data.createOneObject.id;
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('duplicate')) {
      console.log(`  Object already exists: ${nameSingular}`);
      return null;
    }
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
      input: { objectMetadataId: objectId, ...fieldInput },
    });
    console.log(`  ✓ Field: ${fieldInput.name}`);
    return data.createOneField.id;
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('duplicate')) {
      console.log(`    Field already exists: ${fieldInput.name}`);
      return null;
    }
    throw err;
  }
}

async function main() {
  console.log(`\nConnecting to Twenty CRM at ${BASE_URL}...\n`);

  // ── Step 1: ProviderOffering custom object ───────────────────────────────────
  console.log('Creating ProviderOffering object...');
  const offeringId = await createObject({
    nameSingular: 'providerOffering',
    namePlural: 'providerOfferings',
    labelSingular: 'Provider Offering',
    labelPlural: 'Provider Offerings',
    description: 'IPTV provider subscription plan available in the StreamBridge marketplace',
    icon: 'IconShoppingCart',
  });

  if (offeringId) {
    await createField(offeringId, { name: 'streamioId', label: 'Streamio ID', type: 'TEXT', defaultValue: null });
    await createField(offeringId, { name: 'priceCents', label: 'Price (cents)', type: 'NUMBER', defaultValue: 0 });
    await createField(offeringId, { name: 'billingPeriod', label: 'Billing Period', type: 'SELECT',
      options: [
        { value: 'month', label: 'Monthly', color: 'blue', position: 0 },
        { value: 'year',  label: 'Yearly',  color: 'green', position: 1 },
      ],
      defaultValue: 'month',
    });
    await createField(offeringId, { name: 'trialDays', label: 'Trial Days', type: 'NUMBER', defaultValue: 0 });
    await createField(offeringId, { name: 'isActive', label: 'Is Active', type: 'BOOLEAN', defaultValue: true });
  }

  // ── Step 2: Subscription custom object ───────────────────────────────────────
  console.log('\nCreating Subscription object...');
  const subscriptionId = await createObject({
    nameSingular: 'subscription',
    namePlural: 'subscriptions',
    labelSingular: 'Subscription',
    labelPlural: 'Subscriptions',
    description: "A customer's active or historical StreamBridge subscription",
    icon: 'IconReceipt',
  });

  if (subscriptionId) {
    await createField(subscriptionId, { name: 'streamioId', label: 'Streamio ID', type: 'TEXT', defaultValue: null });
    await createField(subscriptionId, { name: 'stripeSubscriptionId', label: 'Stripe Subscription ID', type: 'TEXT', defaultValue: null });
    await createField(subscriptionId, { name: 'status', label: 'Status', type: 'SELECT',
      options: [
        { value: 'active',    label: 'Active',    color: 'green',  position: 0 },
        { value: 'trialing',  label: 'Trialing',  color: 'blue',   position: 1 },
        { value: 'past_due',  label: 'Past Due',  color: 'orange', position: 2 },
        { value: 'cancelled', label: 'Cancelled', color: 'red',    position: 3 },
      ],
      defaultValue: 'active',
    });
    await createField(subscriptionId, { name: 'currentPeriodEnd', label: 'Current Period End', type: 'DATE_TIME', defaultValue: null });
    await createField(subscriptionId, { name: 'cancelAtPeriodEnd', label: 'Cancel at Period End', type: 'BOOLEAN', defaultValue: false });
  }

  // ── Step 3: Custom fields on Person ──────────────────────────────────────────
  console.log('\nAdding custom fields to Person object...');

  // Look up Person object ID
  const objectsData = await metaQuery(`
    query { objects(filter: { nameSingular: { eq: "person" } }) { edges { node { id nameSingular } } } }
  `);
  const personObjectId = objectsData?.objects?.edges?.[0]?.node?.id;

  if (personObjectId) {
    await createField(personObjectId, { name: 'streamioId', label: 'Streamio ID', type: 'TEXT', defaultValue: null });
    await createField(personObjectId, { name: 'accountStatus', label: 'Account Status', type: 'SELECT',
      options: [
        { value: 'active',   label: 'Active',   color: 'green', position: 0 },
        { value: 'inactive', label: 'Inactive', color: 'red',   position: 1 },
        { value: 'trial',    label: 'Trial',    color: 'blue',  position: 2 },
      ],
      defaultValue: 'active',
    });
    await createField(personObjectId, { name: 'lastActiveAt', label: 'Last Active At', type: 'DATE_TIME', defaultValue: null });
  } else {
    console.warn('  Could not find Person object — skipping custom person fields');
  }

  console.log('\n✓ Setup complete. Verify objects appear in Twenty UI under Settings → Data Model.\n');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
