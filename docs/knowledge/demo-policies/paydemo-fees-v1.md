# PayDemo fee schedule (DEMO POLICY — invented)

> This document is synthetic demo text for ReconcileOps learning. It is not a real payment-provider policy.

## Merchant discount rate

For standard card-present sales, PayDemo charges a fixed fee of AED 3.00 (300 fils) on AED 100.00 gross sales in the demo catalog. Expected net settlement is therefore gross minus fee.

## Shortfalls after fee

If the bank settled amount is lower than expected net by AED 3.00, investigators should first confirm whether an additional acquiring fee or MDR adjustment was applied. Do not rewrite the original payment gross or fee fields when documenting the shortfall.

## Settlement window

Bank settlement dates are accepted when they fall on the payment's UTC paid date or within the next three calendar days. Settlements on the fourth calendar day or later are outside the settlement window and must not be auto-matched.
