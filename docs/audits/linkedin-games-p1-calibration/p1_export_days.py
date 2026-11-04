"""Rebuild prod_days.json from the D1 snapshots (the owner's own LinkedIn Games rows; not versioned: personal data).

  npx wrangler d1 execute meridian --remote -c wrangler.private.jsonc --json \
    --command "SELECT created_at, id, raw_json FROM snapshots WHERE source='linkedin-games' AND user_id='<users.id of the owner>' ORDER BY created_at, id" > snapshots.json
  python3 p1_export_days.py snapshots.json prod_days.json

The current version of each date is the latest row by (created_at, id) (contract L2): rows come ordered, a later one overwrites.
"""
import json, sys
rows = json.load(open(sys.argv[1]))[0]["results"]
by = {}
for r in rows:
    d = json.loads(r["raw_json"]); by[d["date"]] = d
days = [by[k] for k in sorted(by)]
json.dump(days, open(sys.argv[2], "w"))
print(f"{len(rows)} snapshot rows -> {len(days)} dates, {days[0]['date']}..{days[-1]['date']}")
