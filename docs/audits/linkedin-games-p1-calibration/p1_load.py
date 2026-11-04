import json, numpy as np, pandas as pd
d = json.load(open("prod_days.json"))
rows = [(p["date"], g, e["scoreSeconds"], e["avgSeconds"]) for p in d for g, e in p["games"].items()]
df = pd.DataFrame(rows, columns="date game s a".split()); df["d"] = pd.to_datetime(df.date)
df["eff"] = df.a / df.s; df["beat"] = (df.s < df.a).astype(int); df["dn"] = (df.d - pd.Timestamp("2026-05-17")).dt.days
df["wk"] = df.d.dt.dayofweek >= 5
GAMES = sorted(df.game.unique())
