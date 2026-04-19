const { pool } = require('../db/queries');
const logger = require('../utils/logger');

/**
 * Get a user's current credit balance in cents.
 */
async function getBalance(userId) {
  const { rows } = await pool.query(
    'SELECT credit_balance_cents FROM users WHERE id = $1',
    [userId]
  );
  return rows[0]?.credit_balance_cents ?? 0;
}

/**
 * Get credit transaction history for a user.
 */
async function listTransactions(userId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT ct.*, po.name AS offering_name
     FROM credit_transactions ct
     LEFT JOIN provider_subscriptions ps ON ps.id = ct.subscription_id
     LEFT JOIN provider_offerings po ON po.id = ps.offering_id
     WHERE ct.user_id = $1
     ORDER BY ct.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

/**
 * Add credits to a user's balance atomically.
 * Creates an audit record in credit_transactions.
 */
async function addCredits(userId, amountCents, { type = 'admin_grant', description, referenceId, subscriptionId } = {}) {
  if (amountCents <= 0) throw new Error('amountCents must be positive');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE users
       SET credit_balance_cents = credit_balance_cents + $1
       WHERE id = $2
       RETURNING credit_balance_cents`,
      [amountCents, userId]
    );

    await client.query(
      `INSERT INTO credit_transactions
         (user_id, amount_cents, type, description, reference_id, subscription_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed')`,
      [userId, amountCents, type, description || null, referenceId || null, subscriptionId || null]
    );

    await client.query('COMMIT');
    logger.info(`[Credits] Added ${amountCents}¢ to user ${userId} (${type})`);
    return rows[0].credit_balance_cents;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deduct credits from a user's balance atomically.
 * Throws if balance is insufficient.
 */
async function spendCredits(userId, amountCents, { description, subscriptionId } = {}) {
  if (amountCents <= 0) throw new Error('amountCents must be positive');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE users
       SET credit_balance_cents = credit_balance_cents - $1
       WHERE id = $2 AND credit_balance_cents >= $1
       RETURNING credit_balance_cents`,
      [amountCents, userId]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      const err = new Error('Insufficient credits');
      err.status = 402;
      throw err;
    }

    await client.query(
      `INSERT INTO credit_transactions
         (user_id, amount_cents, type, description, subscription_id, status)
       VALUES ($1, $2, 'spend_subscription', $3, $4, 'completed')`,
      [userId, -amountCents, description || null, subscriptionId || null]
    );

    await client.query('COMMIT');
    logger.info(`[Credits] Spent ${amountCents}¢ for user ${userId}`);
    return rows[0].credit_balance_cents;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create a PENDING top-up record before the payment is confirmed.
 * Call confirmTopup() once payment is verified.
 */
async function createPendingTopup(userId, amountCents, { referenceId, type = 'topup_paygate', description } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO credit_transactions
       (user_id, amount_cents, type, description, reference_id, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [
      userId,
      amountCents,
      type,
      description || `Credit top-up: $${(amountCents / 100).toFixed(2)}`,
      referenceId || null,
    ]
  );
  return rows[0];
}

/**
 * Confirm a pending top-up: updates the transaction to 'completed' and
 * credits the user's balance.  Called from the PayGate callback.
 * Returns { userId, amountCents, newBalance } or null if not found/already processed.
 */
async function confirmTopup(referenceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: txRows } = await client.query(
      `SELECT * FROM credit_transactions
       WHERE reference_id = $1 AND type LIKE 'topup_%' AND status = 'pending'
       FOR UPDATE`,
      [referenceId]
    );
    const tx = txRows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      return null; // Already processed or not found
    }

    await client.query(
      `UPDATE credit_transactions SET status = 'completed' WHERE id = $1`,
      [tx.id]
    );

    const { rows: userRows } = await client.query(
      `UPDATE users
       SET credit_balance_cents = credit_balance_cents + $1
       WHERE id = $2
       RETURNING credit_balance_cents`,
      [tx.amount_cents, tx.user_id]
    );

    await client.query('COMMIT');
    logger.info(`[Credits] Confirmed topup ${referenceId}: +${tx.amount_cents}¢ for user ${tx.user_id}`);
    return {
      userId: tx.user_id,
      amountCents: tx.amount_cents,
      newBalance: userRows[0].credit_balance_cents,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Confirm a pending top-up by Square order ID.
 * Looks up the credit transaction via square_order_id, then delegates to confirmTopup.
 */
async function confirmTopupBySquareOrderId(squareOrderId) {
  const { rows } = await pool.query(
    `SELECT reference_id FROM credit_transactions
     WHERE square_order_id = $1 AND type LIKE 'topup_%' AND status = 'pending'`,
    [squareOrderId]
  );
  const tx = rows[0];
  if (!tx) return null;
  return confirmTopup(tx.reference_id);
}

module.exports = {
  getBalance,
  listTransactions,
  addCredits,
  spendCredits,
  createPendingTopup,
  confirmTopup,
  confirmTopupBySquareOrderId,
};
