#!/usr/bin/env python3
"""
Prépare les données statiques du réseau TAO pour le site Orléans Transit.

Télécharge le GTFS TAO (Orléans Métropole / Keolis, Licence Ouverte 2.0) et produit
des fichiers JSON compacts dans <sortie>/data :

  meta.json            date de génération, jours disponibles, préfixe des courses
  routes.json          lignes (nom, couleur, type)
  stops.json           quais : [id, nom, index du groupe]
  groups.json          arrêts regroupés (tous les quais d'un même arrêt)
  shapes.json          tracés simplifiés des lignes (pour la carte)
  lines.json           ordre des arrêts de chaque ligne, par sens
  day-AAAAMMJJ.json    toutes les courses du jour avec leurs horaires

Utilisation :  python3 build_data.py <dossier_sortie> [--gtfs fichier.zip] [--days 3]
Bibliothèque standard uniquement.
"""
import csv
import io
import json
import math
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile
from datetime import date, datetime, timedelta

try:
    from zoneinfo import ZoneInfo
    PARIS = ZoneInfo("Europe/Paris")
except Exception:  # pragma: no cover
    PARIS = None

GTFS_URL = "https://chouette.enroute.mobi/api/v1/datas/keolis_orleans/gtfs.zip"


# ───────────────────────── utilitaires ─────────────────────────

def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("œ", "oe").replace("æ", "ae")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


QUAY_SUFFIX = re.compile(r"\s*[-–—/]\s*(quai|qu\.|q\.)\s*[A-Za-z0-9]{1,3}\s*$", re.I)
QUAY_ONLY = re.compile(r"\s+quai\s+[A-Za-z0-9]{1,2}\s*$", re.I)


def clean_stop_name(name):
    s = QUAY_SUFFIX.sub("", name)
    s = QUAY_ONLY.sub("", s).strip()
    return s or name.strip()


def secs(hms):
    try:
        p = hms.strip().split(":")
        return int(p[0]) * 3600 + int(p[1]) * 60 + (int(p[2]) if len(p) > 2 else 0)
    except Exception:
        return None


def read_csv(z, name):
    try:
        raw = z.read(name)
    except KeyError:
        return []
    text = raw.decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def iter_csv(z, name):
    """Lecture en flux (stop_times.txt peut être volumineux)."""
    try:
        f = z.open(name)
    except KeyError:
        return
    with io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace", newline="") as t:
        for row in csv.DictReader(t):
            yield row


def color(hexstr, default):
    h = (hexstr or "").strip().lstrip("#")
    return ("#" + h.upper()) if re.fullmatch(r"[0-9A-Fa-f]{6}", h) else default


def dist_m(lat1, lon1, lat2, lon2):
    dy = (lat2 - lat1) * 111000
    dx = (lon2 - lon1) * 111000 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def today_paris():
    if PARIS:
        return datetime.now(PARIS).date()
    return date.today()


# ───────────────────────── programme ─────────────────────────

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    out = args[0]
    gtfs_path = None
    days = 3
    if "--gtfs" in args:
        gtfs_path = args[args.index("--gtfs") + 1]
    if "--days" in args:
        days = int(args[args.index("--days") + 1])
    start = today_paris()
    if "--date" in args:
        start = datetime.strptime(args[args.index("--date") + 1], "%Y%m%d").date()

    data_dir = os.path.join(out, "data")
    os.makedirs(data_dir, exist_ok=True)

    if gtfs_path:
        raw = open(gtfs_path, "rb").read()
    else:
        print("Téléchargement du GTFS TAO…")
        req = urllib.request.Request(GTFS_URL, headers={"User-Agent": "orleans-transit-web"})
        raw = urllib.request.urlopen(req, timeout=120).read()
    print(f"GTFS : {len(raw) / 1e6:.1f} Mo")
    z = zipfile.ZipFile(io.BytesIO(raw))
    # Fichiers éventuellement rangés dans un sous-dossier
    names = {os.path.basename(n): n for n in z.namelist()}

    def R(n):
        return read_csv(z, names.get(n, n))

    # ── lignes ──
    routes = []
    route_idx = {}
    for r in R("routes.txt"):
        rid = r.get("route_id")
        if not rid:
            continue
        short = r.get("route_short_name") or rid.split(":")[-1]
        rtype = int(r.get("route_type") or 3)
        route_idx[rid] = len(routes)
        routes.append({
            "id": rid,
            "short": short,
            "long": r.get("route_long_name") or "",
            "color": color(r.get("route_color"), "#8E8E93"),
            "text": color(r.get("route_text_color"), "#FFFFFF"),
            "tram": rtype == 0,
        })

    # ── arrêts et regroupement ──
    raw_stops = []
    for s in R("stops.txt"):
        sid = s.get("stop_id")
        if not sid:
            continue
        lt = int(s.get("location_type") or 0)
        if lt > 1:
            continue
        try:
            lat = float(s.get("stop_lat") or 0)
            lon = float(s.get("stop_lon") or 0)
        except ValueError:
            lat = lon = 0.0
        raw_stops.append((sid, s.get("stop_name") or sid, lat, lon))

    by_key = {}
    for st in raw_stops:
        k = norm(clean_stop_name(st[1]))
        if k:
            by_key.setdefault(k, []).append(st)

    groups = []
    stop_group = {}
    for k in sorted(by_key):
        clusters = []
        for st in by_key[k]:
            home = None
            for c in clusters:
                ref = c[0]
                if ref[2] == 0 or st[2] == 0 or dist_m(ref[2], ref[3], st[2], st[3]) < 600:
                    home = c
                    break
            if home is None:
                clusters.append([st])
            else:
                home.append(st)
        for ci, c in enumerate(clusters):
            gid = k.replace(" ", "-") + ("" if ci == 0 else f"-{ci + 1}")
            base = clean_stop_name(c[0][1])
            pts = [(s[2], s[3]) for s in c if s[2] and s[3]]
            lat = sum(p[0] for p in pts) / len(pts) if pts else 0
            lon = sum(p[1] for p in pts) / len(pts) if pts else 0
            gi = len(groups)
            groups.append({
                "id": gid,
                "name": base if ci == 0 else f"{base} ({ci + 1})",
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "stops": [s[0] for s in c],
                "routes": set(),
            })
            for s in c:
                stop_group[s[0]] = gi

    stops_out = []
    stop_index = {}
    for sid, name, lat, lon in raw_stops:
        if sid not in stop_group:
            continue
        stop_index[sid] = len(stops_out)
        stops_out.append([sid, clean_stop_name(name), stop_group[sid]])

    # ── calendrier ──
    cal = R("calendar.txt")
    cal_dates = R("calendar_dates.txt")
    cols = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    def active(d):
        ymd = d.strftime("%Y%m%d")
        out_s = set()
        for r in cal:
            if r.get("start_date", "0") <= ymd <= r.get("end_date", "99999999") and r.get(cols[d.weekday()]) == "1":
                out_s.add(r.get("service_id"))
        for r in cal_dates:
            if r.get("date") != ymd:
                continue
            if r.get("exception_type") == "1":
                out_s.add(r.get("service_id"))
            elif r.get("exception_type") == "2":
                out_s.discard(r.get("service_id"))
        return out_s

    has_calendar = bool(cal or cal_dates)

    # ── courses ──
    trips = {}
    shape_count = {}
    for t in R("trips.txt"):
        tid = t.get("trip_id")
        rid = t.get("route_id")
        if not tid or rid not in route_idx:
            continue
        trips[tid] = (route_idx[rid], int(t.get("direction_id") or 0), t.get("service_id") or "")
        sh = t.get("shape_id")
        if sh:
            m = shape_count.setdefault(route_idx[rid], {})
            m[sh] = m.get(sh, 0) + 1

    print(f"{len(routes)} lignes · {len(groups)} arrêts · {len(trips)} courses")

    # ── horaires (lecture en flux) ──
    times = {}  # trip -> list of (seq, stopIdx, secs)
    for row in iter_csv(z, names.get("stop_times.txt", "stop_times.txt")):
        tid = row.get("trip_id")
        if tid not in trips:
            continue
        sid = row.get("stop_id")
        if sid not in stop_index:
            continue
        t = secs(row.get("departure_time") or "")
        if t is None:
            t = secs(row.get("arrival_time") or "")
        if t is None:
            continue
        try:
            seq = int(row.get("stop_sequence") or 0)
        except ValueError:
            seq = 0
        times.setdefault(tid, []).append((seq, stop_index[sid], t))
    for v in times.values():
        v.sort()

    # Lignes desservies par chaque arrêt
    for tid, lst in times.items():
        ri = trips[tid][0]
        for _, si, _ in lst:
            groups[stops_out[si][2]]["routes"].add(ri)
    for g in groups:
        g["routes"] = sorted(g["routes"])
        g["tram"] = any(routes[r]["tram"] for r in g["routes"])

    # Préfixe commun des identifiants de course (économise de la place)
    ids = list(times.keys())
    prefix = os.path.commonprefix(ids) if ids else ""
    if ":" in prefix:
        prefix = prefix[: prefix.rfind(":") + 1]
    else:
        prefix = ""

    # ── ordre des arrêts par ligne et par sens (motif le plus fréquent, puis le plus long) ──
    patterns = {}
    for tid, lst in times.items():
        ri, d, _ = trips[tid]
        key = tuple(x[1] for x in lst)
        m = patterns.setdefault((ri, d), {})
        m[key] = m.get(key, 0) + 1
    lines = {}
    for (ri, d), m in patterns.items():
        best = max(m.items(), key=lambda kv: (kv[1], len(kv[0])))[0]
        lines.setdefault(str(ri), {})[str(d)] = list(best)

    # ── tracés : 2 plus utilisés par ligne, simplifiés ──
    wanted = {}
    for ri, m in shape_count.items():
        for sh, _ in sorted(m.items(), key=lambda kv: -kv[1])[:2]:
            wanted[sh] = ri
    pts = {}
    if wanted and "shapes.txt" in names:
        for row in iter_csv(z, names["shapes.txt"]):
            sh = row.get("shape_id")
            if sh not in wanted:
                continue
            try:
                pts.setdefault(sh, []).append((
                    int(float(row.get("shape_pt_sequence") or 0)),
                    float(row["shape_pt_lat"]), float(row["shape_pt_lon"])))
            except (KeyError, ValueError):
                continue
    shapes = {}
    for sh, lst in pts.items():
        lst.sort()
        flat = []
        last = None
        for i, (_, la, lo) in enumerate(lst):
            if last and i != len(lst) - 1 and dist_m(last[0], last[1], la, lo) < 12:
                continue
            flat += [round(la, 5), round(lo, 5)]
            last = (la, lo)
        shapes.setdefault(str(wanted[sh]), []).append(flat)

    # ── fichiers des jours ──
    day_files = []
    for n in range(days):
        d = start + timedelta(days=n)
        prev = d - timedelta(days=1)
        s_today = active(d) if has_calendar else None
        s_prev = active(prev) if has_calendar else set()
        out_trips = []
        for tid, lst in times.items():
            ri, di, svc = trips[tid]
            short = tid[len(prefix):]
            stops_seq = [x[1] for x in lst]
            if s_today is None or svc in s_today:
                t0 = lst[0][2]
                out_trips.append([short, ri, di, stops_seq, [t0] + [lst[i][2] - lst[i - 1][2] for i in range(1, len(lst))]])
            # Courses de la veille qui roulent après minuit
            if svc in s_prev and lst[-1][2] >= 86400:
                t0 = lst[0][2] - 86400
                out_trips.append([short, ri, di, stops_seq, [t0] + [lst[i][2] - lst[i - 1][2] for i in range(1, len(lst))], 1])
        ymd = d.strftime("%Y%m%d")
        write_json(os.path.join(data_dir, f"day-{ymd}.json"), out_trips)
        day_files.append(ymd)
        print(f"  {ymd} : {len(out_trips)} courses")

    groups_out = [{k: v for k, v in g.items()} for g in groups]
    write_json(os.path.join(data_dir, "routes.json"), routes)
    write_json(os.path.join(data_dir, "stops.json"), stops_out)
    write_json(os.path.join(data_dir, "groups.json"), groups_out)
    write_json(os.path.join(data_dir, "shapes.json"), shapes)
    write_json(os.path.join(data_dir, "lines.json"), lines)
    write_json(os.path.join(data_dir, "meta.json"), {
        "generated": datetime.now(PARIS).isoformat(timespec="minutes") if PARIS else datetime.now().isoformat(timespec="minutes"),
        "days": day_files,
        "tripPrefix": prefix,
    })
    print("Données prêtes dans", data_dir)


if __name__ == "__main__":
    main()
