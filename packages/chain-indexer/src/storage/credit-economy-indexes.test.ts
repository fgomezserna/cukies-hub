import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CREDIT_ECONOMY_INDEXES } from "./credit-economy-indexes.js";

describe("credit economy indexes", () => {
  it("protects run, item, config, lot, reservation, ledger and materialization identities", () => {
    const unique = CREDIT_ECONOMY_INDEXES.filter(
      (index) => index.options?.unique
    ).map((index) => `${index.collection}:${JSON.stringify(index.keys)}`);
    for (const expected of [
      'competition_credit_pool_configs:{"idempotencyKey":1}',
      'competition_credit_runs:{"period.periodId":1}',
      'competition_credit_run_items:{"periodId":1,"slotId":1,"eligibilityEpoch":1}',
      'competition_credit_lots:{"lotId":1}',
      'competition_credit_pool_lots:{"lotId":1}',
      'competition_credit_account_periods:{"walletNormalized":1,"periodId":1}',
      'competition_credit_pool_periods:{"periodId":1}',
      'competition_credit_reservations:{"idempotencyKey":1}',
      'competition_credit_reservations:{"sessionId":1}',
      'competition_credit_reservations:{"terminalIdempotencyKey":1}',
      'competition_credit_incidents:{"incidentId":1}',
      'competition_credit_ledger:{"ledgerId":1}',
      'competition_credit_ledger:{"idempotencyKey":1}',
    ])
      assert.equal(unique.includes(expected), true, `${expected} missing`);
  });

  it("provides lease, expiry, FIFO and reconciliation access paths", () => {
    const paths = CREDIT_ECONOMY_INDEXES.map(
      (index) => `${index.collection}:${JSON.stringify(index.keys)}`
    );
    assert.ok(
      paths.includes(
        'competition_credit_runs:{"status":1,"leaseExpiresAt":1,"_id":1}'
      )
    );
    assert.ok(
      paths.includes(
        'competition_credit_run_items:{"runId":1,"status":1,"_id":1}'
      )
    );
    assert.ok(
      paths.includes(
        'competition_credit_reservations:{"status":1,"expiresAt":1,"_id":1}'
      )
    );
    assert.ok(
      paths.includes(
        'competition_credit_lots:{"walletNormalized":1,"periodId":1,"runId":1,"blocked":1,"expiresAt":1,"createdAt":1,"_id":1}'
      )
    );
    assert.ok(
      paths.includes(
        'competition_credit_pool_lots:{"periodId":1,"runId":1,"blocked":1,"expiresAt":1,"createdAt":1,"_id":1}'
      )
    );
    assert.ok(
      paths.includes(
        'competition_credit_ledger:{"runId":1,"runItemId":1,"operation":1,"bucket":1}'
      )
    );
    assert.ok(
      paths.includes(
        'competition_credit_ledger:{"reservationId":1,"lotId":1,"operation":1}'
      )
    );
  });
});
