# A7 D1 validation report

**Date:** 2026-10-13  
**Status:** Executed against disposable D1 and production read-only. This report validates D1 primitives and a reference protocol; it does not claim that the production A7 runtime has been implemented.

## Safety and scope

- The test workflow created a uniquely named disposable D1 and temporary Worker for each run.
- The production audit used fixed SELECT queries only. It reports **0 production rows written**.
- Production raw_json payloads stayed in runner memory; they were not printed or uploaded as artifacts.
- The temporary Worker and D1 were sent deletion requests in the workflow's always() cleanup step.
- No migrations, backfill, production writes, or application deployment were performed.
- Successful validation run: https://github.com/valentinlineiro/meridian/actions/runs/38382132390

## 1. D1 semantics

| Check | Result |
|---|---|
| db.batch rollback on a NOT NULL constraint failure | PASS; the earlier insert in the batch was absent afterward |
| Tuple predicate, later timestamp | PASS |
| Tuple predicate, same timestamp and larger id | PASS |
| Tuple predicate, same timestamp and smaller id | PASS |
| Tuple predicate, earlier timestamp and larger id | PASS |
| WHERE EXISTS, version guard and ordered reference statements | PASS in the D1-backed interleaving test |

**Runtime coverage:** the A7 implementation module at commit e3995e1a551ec15f724f0e5efee0d4b068095549 was imported directly into the temporary validation Worker and executed against a second disposable D1. Its ordered repair, tail-after-watermark handling, concurrent ingest and repair all passed (§6). This is validation of that exact branch head, not a production deployment.

## 2. Read cost and chunk sizing

The benchmark seeded 850 synthetic snapshots with payloads of approximately 72 KB each. Single-query + parse measurements ran five times per chunk size; the table reports the median and maximum observed Worker wall time.

| Snapshots per chunk | Payload parsed | Median wall time | Max wall time | Median D1 SQL time | Rows read |
|---:|---:|---:|---:|---:|---:|
| 1 | 71,993 B | 106 ms | 111 ms | 0.586 ms | 1 |
| 3 | 215,979 B | 171 ms | 174 ms | 1.423 ms | 3 |
| 10 | 719,930 B | 100 ms | 252 ms | 2.944 ms | 10 |
| 25 | 1,799,825 B | 332 ms | 335 ms | 7.678 ms | 25 |

The full 850-snapshot read, paged in chunks of 10, parsed 61,194,050 bytes and recorded 934 rows read, 0 rows written, 325.883 ms summed D1 SQL duration, and 9,140 ms Worker wall time in this run. Wall time is environment-sensitive; the D1 row counters and SQL durations are the stronger cost signals.

**Initial choice: K = 10.** It bounds a chunk to about 720 KB, had a 36 ms maximum in this five-sample run, and leaves headroom versus the 1.8 MB / 57 ms maximum observed at K = 25. This is a conservative starting value for the implementation, not a claim that the entire repair path has already been benchmarked. Re-measure after the real delete/insert/publication statements are implemented.

Cloudflare's current D1 pricing is row-based: Workers Free includes 5 million rows read/day and 100,000 rows written/day; the Paid plan includes 25 billion reads/month and 50 million writes/month before overage. Row size does not affect row-count billing; large payloads do affect processing and request duration. Source: https://developers.cloudflare.com/d1/platform/pricing/

## 3. P1 parity against production raw_json

Read-only audit of the production duolingo-lang source:

| Metric | Result |
|---|---:|
| Snapshots | 850 |
| Users | 1 |
| Courses in the union | 16 |
| Snapshot/course cells compared | 13,600 |
| Reconstruction mismatches | **0** |
| Derived compact events | 78 |
| Event-transition mismatches | **0** |
| Descending transitions detected | 1 |
| Production rows written | **0** |
| Production rows read by this one-off audit | 76,496 |
| D1 SQL duration summed across the audit queries | 2,709.994 ms |

The complete parity check reconstructs every snapshot/course state from the event series plus the snapshot timeline and compares it to the observed state extracted from raw_json. It also compares the derived event transitions against an independent direct-transition pass. The raw payloads were not logged or artifacted.

The 76,496 rows read are an audit-query cost, not the cost of one normal A7 repair. The audit filters by source on a table without a source index and paginates in small pages; do not schedule this exact audit frequently without optimizing its read path.

## 4. Corruption detection

On a separate 120-snapshot synthetic D1 fixture:

- Clean parity: PASS (135 expected events).
- Coordinated corruption of an intermediate event's xp and the following event's last_xp: detected by full raw_json parity.
- This confirms the P1 detection method; it does not mean the cheap I2/head checks detect that corruption.

## 5. Repair liveness

### D1-backed reference interleaving

- 20 ingesters read the same series version before writing.
- Exactly one conditional event insert won; all 20 snapshots were preserved.
- Losing ingests left the series dirty.
- Five later snapshots arrived after the repair watermark was captured.
- The old version guard was rejected after the tail arrival.
- The fixed-watermark reference repair published the 20-snapshot prefix while keeping the tail dirty, then repaired the five-snapshot tail.
- Final state: exact parity with raw_json, correct latest head, dirty marker cleared.

**Result: PASS.** This is a D1-backed reference protocol test, not the production A7 implementation.

### Adversarial model

At a 90% chance of a new arrival during each repair attempt, with 20 initial snapshots, chunk size 3, 3,000-attempt cap and 100 deterministic seeds:

- Current whole-region invalidation model: **0/100 completed** (median and maximum 3,000 attempts).
- Fixed-watermark prototype: **100/100 completed**, median and maximum 7 attempts.

The simulation demonstrates why the watermark design is preferable; the D1-backed test verifies the key publication/interleaving behavior with a separate repair_version. The final successful run also confirmed that the disposable Worker and D1 were deleted.

## 6. Actual A7 runtime module on D1

The workflow checked out implementation commit e3995e1a551ec15f724f0e5efee0d4b068095549 into a separate directory, imported the actual TypeScript module into the temporary Worker, and bound it to a second disposable D1 with the migration-equivalent schema. This is not a copied SQL model: the worker called the implementation's compactXpIngestStatements and repairCompactXpEvents functions directly.

### Ordered / late-arrival path

- Ingested snapshots at t1 and t3, then a late t2.
- Confirmed the head stayed at t3 and dirty_from became t2.
- Ran a one-snapshot repair chunk, then ingested t4 after the fixed watermark.
- Completed the t3 prefix and then the t4 tail in three repair calls.
- Four A-course events reconstructed exactly: 100 → 95 → 90 → 80 XP, with correct prev_state and last_xp.
- Final head was t4, dirty marker and watermark were cleared.

**Result: PASS.**

### Concurrent ingestion path

- Started 20 concurrent ingestion requests, all reading the same initial series version, with a deliberate 25 ms read/write window.
- All 20 snapshots were preserved; the guarded ingestion produced one initial winner and left the series dirty for repair.
- Two repair calls reconstructed all 20 events in timestamp order.
- Event series matched the independent expected values, final head was the latest snapshot, and dirty marker was cleared.

**Result: PASS.** This directly exercises the implementation SQL against D1 for the tested race and repair cases. It does not replace the full production rollout checklist or justify running the migration/backfill against production.

## Decisions for the A7 implementation

1. Use a fixed repair watermark so arrivals after the watermark do not invalidate the prefix being repaired.
2. Keep later arrivals dirty and process them in a subsequent ordered pass; never publish beyond the watermark.
3. Start with K = 10, then remeasure the actual A7 delete/insert/guard statements before finalizing it.
4. Run P9 again against the actual implementation SQL. The current D1 test proves primitives and the reference protocol, not yet the production code.
5. Keep full P1 parity available as the authoritative detector for coordinated corruption; the cheap checks remain incomplete by design.
