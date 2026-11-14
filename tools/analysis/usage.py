#!/usr/bin/env python3
"""Summary of TEM-view usage metrics ("tem-view-usage/1", the daily usage/<year>/<day>.jsonl files).

Usage:
    python3 tools/analysis/usage.py usage/2026/*.jsonl [--page ruska] [--since 2026-11-01] [--until 2026-11-30]
                                    [--disclose] [--csv visits.csv] [--map map.html]
    python3 tools/analysis/usage.py --d1 --page ruska --disclose      # live, from the collector's database

--page keeps one exhibit (tem-view, ruska, scanning); --since/--until keep a range of days (UTC, inclusive).
--disclose prints a short aggregate statement that is safe to publish: totals, countries, engaged time and what
was done, no cities or single visits. --d1 reads the collector's D1 database directly (the last 90 days, including
today) with wrangler from hf/worker, which needs a `wrangler login` with access to the account.

Prints visits per day and per exhibit, unique visitors per day (the daily visitor key), countries and cities,
time in view, the most used modes and specimens, feature counts and devices. --csv writes one row per visit;
--map writes a self-contained HTML page with one circle per city, sized by visits (Leaflet, from a CDN).

Get the files with
    huggingface-cli download rmsreis/tem-view-usage --repo-type dataset --local-dir usage-data
Needs only the standard library.
"""
import argparse
import csv
import json
import os
import subprocess
from collections import Counter, defaultdict
from statistics import median

FORMAT = "tem-view-usage/1"


def load(paths):
    visits = []
    for p in paths:
        with open(p) as f:
            for line in f:
                if line.strip():
                    v = json.loads(line)
                    if v.get("format") == FORMAT:
                        visits.append(v)
    return visits


def load_d1():
    # the worker folder holds wrangler.toml (and, after `npm ci`, wrangler itself); TEMVIEW_WORKER overrides it
    worker = os.environ.get("TEMVIEW_WORKER") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "hf", "worker")
    r = subprocess.run(["npx", "wrangler", "d1", "execute", "tem-view-usage", "--remote", "--json",
                        "--command", "SELECT record FROM usage ORDER BY day"], cwd=worker, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"wrangler failed (run `npm ci` and `npx wrangler login` in {worker}):\n{r.stderr or r.stdout}")
    visits = [json.loads(row["record"]) for row in json.loads(r.stdout)[0]["results"]]
    return [v for v in visits if v.get("format") == FORMAT]


# a visit left open in a background tab or on a kiosk can count hours of "view"; for engaged time each visit
# counts at most this long
CAP_S = 3600


def disclose(visits, label):
    days = sorted({v["started"][:10] for v in visits})
    people = {(v["started"][:10], v.get("visitor")) for v in visits if v.get("visitor")}
    countries = Counter(v.get("country") for v in visits if v.get("country"))
    act = [min(v["active_s"], CAP_S) for v in visits]
    engaged = [a for a in act if a >= 60]
    dev = Counter(v.get("device") or "?" for v in visits)
    lang = Counter((v.get("lang") or "?")[:2] for v in visits)
    counts = Counter()
    for v in visits:
        counts.update(v.get("counts", {}))
    n = len(visits)
    pct = lambda c: ", ".join(f"{k} {100 * x / n:.0f} %" for k, x in c.most_common(4))
    print(f"{label}, {days[0]} to {days[-1]} ({len(days)} days with visits)")
    print(f"- {n} visits" + (f" by {len(people)} visitor-days (one person on one day counts once)" if people else ""))
    print(f"- from {len(countries)} countries: {top(countries, 12)}")
    print(f"- time in view: median {minutes(median(act))} per visit, {sum(act) / 3600:.1f} h in all "
          f"(each visit capped at {CAP_S // 60} min); {len(engaged)} visits ({100 * len(engaged) / n:.0f} %) lasted a minute or more")
    print(f"- devices: {pct(dev)}; languages: {pct(lang)}")
    if counts:
        print(f"- used: {top(counts, 12)}")
    print("Anonymous: no cookies, no stored IP address, Do Not Track respected; local test copies are not counted.")


def top(counter, n=10):
    return ", ".join(f"{k} {v}" for k, v in counter.most_common(n)) or "-"


def minutes(s):
    return f"{s / 60:.1f} min"


def summary(visits):
    days = Counter(v["started"][:10] for v in visits)
    people = defaultdict(set)
    for v in visits:
        if v.get("visitor"):
            people[v["started"][:10]].add(v["visitor"])
    print(f"{len(visits)} visits, {len(days)} days")
    for d in sorted(days):
        print(f"  {d}  {days[d]:5d} visits  {len(people[d]):5d} visitors")
    print("exhibits:", top(Counter(v["page"] for v in visits)))
    print("countries:", top(Counter(v.get("country") or "?" for v in visits), 15))
    print("cities:", top(Counter(f"{v.get('city') or '?'}, {v.get('country') or '?'}" for v in visits), 15))
    act = [v["active_s"] for v in visits]
    print(f"time in view: median {minutes(median(act))}, total {sum(act) / 3600:.1f} h")
    for page in sorted({v["page"] for v in visits}):
        dims = defaultdict(Counter)
        for v in visits:
            if v["page"] == page:
                for dim, t in v.get("time", {}).items():
                    dims[dim].update(t)
        for dim, c in dims.items():
            print(f"{page} {dim} (minutes):", ", ".join(f"{k} {s / 60:.0f}" for k, s in c.most_common(10)))
    counts = Counter()
    for v in visits:
        counts.update(v.get("counts", {}))
    print("used:", top(counts, 20))
    print("devices:", top(Counter(v.get("device") for v in visits)))
    print("inputs:", top(Counter(i for v in visits for i in v.get("inputs", []))))
    print("referrers:", top(Counter(v["referrer"] for v in visits if v.get("referrer"))))


def write_csv(visits, path):
    cols = ["started", "page", "version", "duration_s", "active_s", "country", "region", "city", "lat", "lon",
            "device", "lang", "referrer", "kiosk", "visitor"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols + ["counts"])
        for v in visits:
            w.writerow([v.get(c) for c in cols] + [json.dumps(v.get("counts", {}))])


def write_map(visits, path):
    cities = defaultdict(lambda: [0, None, None])
    for v in visits:
        if v.get("lat") is not None:
            c = cities[f"{v.get('city') or '?'}, {v.get('country') or '?'}"]
            c[0] += 1
            c[1], c[2] = v["lat"], v["lon"]
    pts = [{"name": k, "n": n, "lat": la, "lon": lo} for k, (n, la, lo) in cities.items()]
    html = f"""<!doctype html><meta charset="utf-8"><title>TEM-view usage</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{{height:100%;margin:0}}</style><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>const P={json.dumps(pts)};const m=L.map('m').setView([30,0],2);
L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png',{{attribution:'© OpenStreetMap'}}).addTo(m);
for(const p of P)L.circleMarker([p.lat,p.lon],{{radius:4+3*Math.sqrt(p.n)}}).bindTooltip(p.name+': '+p.n+' visits').addTo(m);</script>"""
    with open(path, "w") as f:
        f.write(html)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--d1", action="store_true", help="read the collector's D1 database (live) instead of files")
    ap.add_argument("--page", help="one exhibit: tem-view, ruska or scanning")
    ap.add_argument("--since", help="first day, YYYY-MM-DD (UTC)")
    ap.add_argument("--until", help="last day, YYYY-MM-DD (UTC)")
    ap.add_argument("--disclose", action="store_true", help="print a short aggregate statement to publish")
    ap.add_argument("--csv")
    ap.add_argument("--map")
    a = ap.parse_args()
    if not a.files and not a.d1:
        ap.error("give usage files or --d1")
    visits = (load_d1() if a.d1 else []) + load(a.files)
    visits = [v for v in visits if (not a.page or v["page"] == a.page)
              and (not a.since or v["started"][:10] >= a.since) and (not a.until or v["started"][:10] <= a.until)]
    if not visits:
        raise SystemExit("no tem-view-usage/1 records")
    if a.disclose:
        names = {"ruska": "Ruska 1933 exhibit", "tem-view": "TEM-view exhibit", "scanning": "Scanning exhibit"}
        disclose(visits, names.get(a.page, "TEM-view exhibits"))
    else:
        summary(visits)
    if a.csv:
        write_csv(visits, a.csv)
    if a.map:
        write_map(visits, a.map)


if __name__ == "__main__":
    main()
