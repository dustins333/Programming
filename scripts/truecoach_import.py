#!/usr/bin/env python3
"""
TrueCoach workout-log export → programming.truecoach_imports / _import_sets SQL.

Reads the raw exported .txt files (CRLF, one per client), parses every session,
exercise and result block, expands each result into per-set rows, and emits
idempotent SQL that upserts the staging tables from migration 0066.

    python3 scripts/truecoach_import.py <corpus_dir> \
        --checklist ~/.claude/plans/truecoach-export-progress.json \
        --out <scratch_dir>/sql [--email "Bob Getsinger=bob@example.com"] [--report]

Nothing here is committed with data: the corpus lives in Drive (synced to the
Mac), the checklist and the generated SQL live outside the repo. Only this
script is tracked.

Design notes (see the corpus survey in ~/.claude/plans/truecoach-import-build.md):
  * Files are CRLF. Normalise first, or every session-splitting regex silently
    matches nothing.
  * A file is matched to a person on its `Workout Log:` header line and the
    harvest checklist (name → email), never on the filename.
  * A "result" is a BLOCK: the 3-space-indented line plus the unindented lines
    after it (until a blank line / the next exercise), plus an optional comment
    paragraph after a blank. 41% of blocks are multi-line. The whole block is
    stored verbatim on every set row (raw_text); structured reps/weight are a
    best-effort layer on top.
  * Result formats vary wildly between clients (survey: 123 of 134 clients'
    dominant shape matched none of the two "known" shapes). The extractor
    below is deliberately tolerant and records which rule fired (parse_shape)
    so a re-parse can target the weak spots. It does not need to be perfect —
    the files stay in Drive and this is re-runnable forever.
  * import ids are uuid5(source_name, lift_name), so a re-run upserts the same
    rows and any member links (and the logs rows behind them) survive; sets are
    replaced wholesale and linked imports are re-materialised at the end.
"""
import argparse
import collections
import hashlib
import json
import os
import re
import sys
import uuid

IMPORT_NS = uuid.uuid5(uuid.NAMESPACE_URL, "kova-strength/truecoach-import")

MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1)}
DATE_RE = re.compile(r"^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) +([A-Z][a-z]+) +(\d{1,2}), +(\d{4})\s*$")
EX_RE = re.compile(r"^([A-Z]{1,2}\d{0,2})\) (.*)$")

# ---------------------------------------------------------------------------
# File → sessions → exercises → result blocks
# ---------------------------------------------------------------------------

def read_corpus(corpus_dir):
    """Yield (filename, header_name, text) for each unique file (md5-deduped)."""
    seen = {}
    names = sorted(os.listdir(corpus_dir), key=lambda n: (bool(re.search(r"\(\d+\)\.txt$", n)), n))
    for fname in names:
        if not fname.lower().endswith(".txt"):
            continue
        raw = open(os.path.join(corpus_dir, fname), "rb").read()
        h = hashlib.md5(raw).hexdigest()
        if h in seen:
            print(f"  dup skipped: {fname} == {seen[h]}", file=sys.stderr)
            continue
        seen[h] = fname
        text = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
        first = text.split("\n", 1)[0]
        m = re.match(r"^Workout Log: (.*)$", first)
        if not m:
            print(f"  NOT a workout log (no header), skipped: {fname}", file=sys.stderr)
            continue
        yield fname, m.group(1).strip(), text


def parse_blocks(text):
    """Yield dicts: date, title, status, label, lift, rx, lines[], notes[]."""
    for session in re.split(r"\n-----\n", text):
        bl = session.split("\n")
        # find the date line
        date = None
        title = None
        status = None
        i = 0
        while i < len(bl):
            dm = DATE_RE.match(bl[i])
            if dm:
                date = f"{dm.group(3)}-{MONTHS[dm.group(1)]:02d}-{int(dm.group(2)):02d}"
                i += 1
                break
            i += 1
        if date is None:
            continue
        # header lines until first exercise
        cur = None
        while i < len(bl):
            l = bl[i]
            em = EX_RE.match(l)
            if em:
                label, rest = em.groups()
                lift, rx = (rest.split(":", 1) + [""])[:2]
                cur = dict(date=date, title=title, status=status, label=label,
                           lift=lift.strip(), rx=rx.strip(), rx_more=[])
                i += 1
                continue
            if cur is None:
                if l.startswith("Title:"):
                    title = l[6:].strip()
                elif l.startswith("Status:"):
                    status = l[7:].strip()
                i += 1
                continue
            if l.startswith("   ") and l.strip():
                lines = [l.strip()]
                j = i + 1
                while j < len(bl) and bl[j].strip() != "" and not EX_RE.match(bl[j]) and not bl[j].startswith("   "):
                    lines.append(bl[j].strip())
                    j += 1
                notes = []
                k = j
                while k < len(bl) and bl[k].strip() == "":
                    k += 1
                while k < len(bl) and bl[k].strip() != "" and not EX_RE.match(bl[k]) and not bl[k].startswith("   "):
                    notes.append(bl[k].strip())
                    k += 1
                yield dict(cur, lines=lines, notes=notes,
                           rx_full=" ".join([cur["rx"]] + cur["rx_more"]).strip())
                i = k if notes else j
                continue
            if l.strip():
                # unindented line after an exercise, before any result: wrapped
                # prescription / coach note
                cur["rx_more"].append(l.strip())
            i += 1


# ---------------------------------------------------------------------------
# Result-block → sets
# ---------------------------------------------------------------------------

NUM = r"\d+(?:\.\d+)?"
UNIT = r"(?:lbs?\.?|lb\.?|#|pounds?|kgs?|kg|kbs?|dbs?|dumbbells?|kettle ?bells?)"
UNIT_RE = re.compile(rf"({NUM})\s*{UNIT}(?![a-wyz])", re.I)
REPS_WORD = r"(?:reps?|r)"

def _f(s):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return v

def _i(s):
    v = _f(s)
    return None if v is None else int(round(v))

def rx_range(rx):
    """Prescription rep range: '3x8-12' → (8,12); '3x10' → (10,10); else None."""
    if rx_is_timed(rx) or re.search(r"\bRIR\b|AMRAP|max", rx or "", re.I):
        return None
    m = re.search(r"(\d+)\s*[x×]\s*(\d+)(?:\s*-\s*(\d+))?", rx or "")
    if not m:
        return None
    lo, hi = int(m.group(2)), int(m.group(3) or m.group(2))
    return (min(lo, hi), max(lo, hi))

def rx_sets(rx):
    m = re.search(r"(\d+)(?:\s*-\s*(\d+))?\s*[x×]\s*\d+", rx or "")
    return int(m.group(2) or m.group(1)) if m else None

def rx_is_timed(rx):
    return bool(re.search(r"\d\s*-?\s*\d*\s*(?:s|sec|secs|seconds|min)\b", rx or "", re.I))


def normalise(line, timed):
    t = line
    t = t.replace("×", "x").replace("✕", "x").replace("*", "x").replace("’", "'").replace(" ", " ")
    t = re.sub(r"\([^)]*\)", " ", t)                       # drop parenthetical asides
    t = re.sub(r"\b(\d)(?:st|nd|rd|th)\s+set\b", r"set \1", t, flags=re.I)  # "1st set" → "set 1"
    t = re.sub(r"\bea(?:ch)?(?:\s*(?:side|arm|leg|way|direction|hand))?\b", " ", t, flags=re.I)
    t = re.sub(r"(?:/|per)\s*(?:side|ea|leg|arm)\b", " ", t, flags=re.I)
    t = re.sub(r"\b(?:e/s|l/r|ea/s)\b", " ", t, flags=re.I)
    if timed:
        # a timed prescription: "30s", "30 sec", "1 min" are durations, not reps
        t = re.sub(rf"({NUM})\s*(?:s|sec|secs|seconds|second|min|mins)\b", " ", t, flags=re.I)
    else:
        # "30s" on a rep-based lift = "30-lb dumbbells" (plural). "10@30s".
        t = re.sub(rf"({NUM})s\b", r"\1", t)
        t = re.sub(rf"({NUM})\s*(?:sec|secs|seconds|second|min|mins)\b", " ", t, flags=re.I)
    t = re.sub(r"\bbw\b|\bbody\s*weight\b", " ", t, flags=re.I)
    t = re.sub(r"(\d)\s*'s\b", r"\1", t)                       # "35's" → 35
    t = re.sub(r"(?<![\d.])#\s*(\d+(?:\.\d+)?)", r"\1#", t)     # "#44" → "44#" (not "40# 15")
    t = re.sub(r"#s\b", "#", t)                                  # "15#s" → "15#"
    t = re.sub(r"\btimes\b", " x ", t, flags=re.I)
    # equipment positions are not weights: "J cups at 6", "4 risers", "14 in", "notch 3", "bar at 16"
    t = re.sub(r"\b(?:j\s*-?\s*cups?|cups?|bar|hooks?|notch|level|hole|pins?|setting|height|box|rack|hands?)\s*(?:at|@|on|=)\s*\d+(?:\.\d+)?", " ", t, flags=re.I)
    t = re.sub(r"\d+(?:\.\d+)?\s*(?:risers?|risors?|notch(?:es)?|inch(?:es)?|in\b|\"|hooks?|holes?|plates?\b(?!\s*(?:x|@)))", " ", t, flags=re.I)
    # "3 sets of 8" / "3 sets 12" → "3x8"; "3 sets at 25#" → weight only
    t = re.sub(r"\b(\d{1,2})\s*sets?\s+(?:of\s+|-\s*)?(?=\d)", r"\1x", t, flags=re.I)
    t = re.sub(r"\b(\d{1,2})\s*sets?\s+(?:at|@)\s+", " ", t, flags=re.I)
    # trailing "x" as a reps marker: "12x", "10x," → "12 reps"
    t = re.sub(r"(\d+)\s*x(?=\s*(?:[,;]|$|[a-wyz]))", r"\1 reps", t, flags=re.I)
    return t


def parse_single(t, rng):
    """One line/fragment → (reps, weight, tag) or None. Values may be None individually."""
    def in_rng(v):
        return rng is not None and rng[0] <= v <= rng[1]

    # weight with unit anywhere
    mw = UNIT_RE.search(t)
    w = _f(mw.group(1)) if mw else None
    t_wo = UNIT_RE.sub(" W ", t) if mw else t          # blank the unit'd weight
    # explicit reps word: "12 reps", "10 r"
    mr = re.search(rf"({NUM})\s*{REPS_WORD}\b", t_wo, re.I)
    if mr:
        rest = t_wo[:mr.start()] + " " + t_wo[mr.end():]
        ms = re.search(r"(?:x|,)?\s*(\d)\s*(?:sets?|x)\b", rest, re.I) or re.search(r"(?:^\s*(\d)\s*x\s*$|\bx\s*(\d)\s*$)", rest.strip(), re.I)
        if ms and ms.lastindex and ms.group(1) is None:
            ms = re.match(r"(\d)", ms.group(ms.lastindex))
        if w is None:
            others = [_f(x) for x in re.findall(rf"(?<![\d.])({NUM})(?![\d.])", re.sub(r"(\d)\s*(?:sets?|x)\b", " ", rest, flags=re.I))]
            if len(others) == 1 and others[0] >= 5:
                w = others[0]
        n = int(ms.group(1)) if ms and int(ms.group(1)) <= 6 else 1
        if n > 1:
            return [(_i(mr.group(1)), w)] * n, None, "R reps xS"
        return _i(mr.group(1)), w, "R reps" + (" +W" if w is not None else "")
    # "W x R" / "W for R" / "W @ R" / "R x W" / "R @ W" / "R with W"
    m = re.search(rf"({NUM})\s*(?:x|@|at|for|with|w/)\s*({NUM})", t_wo, re.I)
    if m:
        a, b = _f(m.group(1)), _f(m.group(2))
        sep = t_wo[m.start():m.end()]
        if w is not None:
            # unit'd weight already known; the pair is reps-ish. Which one?
            if in_rng(a) and not in_rng(b): return _i(a), w, "pair+W"
            if in_rng(b) and not in_rng(a): return _i(b), w, "pair+W"
            # "W x R" where the W had a unit → the other number is reps
            if mw and mw.group(1) == m.group(1): return _i(b), w, "W x R"
            if mw and mw.group(1) == m.group(2): return _i(a), w, "R x W"
            return _i(a), w, "pair+W?"
        # no unit anywhere: decide direction
        if in_rng(a) and not in_rng(b): return _i(a), b, "R@W"
        if in_rng(b) and not in_rng(a): return _i(b), a, "W@R"
        if a != int(a) and b == int(b): return _i(b), a, "W@R dec"
        if b != int(b) and a == int(a): return _i(a), b, "R@W dec"
        if re.search(r"with|w/|for", sep, re.I):
            return (_i(a), b, "R with W") if not re.search(r"for", sep, re.I) else (_i(b), a, "W for R")
        if a > 30 and b <= 30: return _i(b), a, "W x R mag"
        if b > 30 and a <= 30: return _i(a), b, "R x W mag"
        return _i(a), b, "R@W?"
    # weight only (unit'd) and a lone other integer → reps
    if w is not None:
        rest = re.findall(rf"(?<![\d.])({NUM})(?![\d.])", t_wo)
        rest = [_f(x) for x in rest]
        if len(rest) == 1 and rest[0] == int(rest[0]) and rest[0] <= 100:
            return _i(rest[0]), w, "W R loose"
        return None, w, "W only"
    nums = [_f(x) for x in re.findall(rf"(?<![\d.])({NUM})(?![\d.])", t_wo)]
    if len(nums) == 1:
        v = nums[0]
        if in_rng(v): return _i(v), None, "bare R"
        if v <= 4: return None                       # "3x. Light", "1 time", "Last 2 sets"
        if v == int(v) and v <= 100 and rng is None: return _i(v), None, "bare R?"
        return None, v, "bare W?"
    if len(nums) == 2:
        a, b = nums                                  # "8 45" (reps then weight, no separator)
        if in_rng(a) and not in_rng(b) and b >= 5: return _i(a), b, "R W bare"
        if in_rng(b) and not in_rng(a) and a >= 5: return _i(b), a, "W R bare"
    return None


def parse_line(t, rng, rxs=None, timed=False):
    """One normalised line → list of (reps, weight) sets + tag. Handles SxR forms
    and per-set lists; falls back to parse_single."""
    # strip a "set N:" / "N:" / "N." prefix (numbered lines)
    t = re.sub(r"^\s*(?:set\s*)?\d\s*[:.)]\s+", "", t, flags=re.I)
    t = re.sub(r"^\s*(?:all|every)\s+(?:\d\s+)?sets?\b", " ", t, flags=re.I)

    # weight-first SxR: "50 lbs 3x15", "26# 3x12", "40lbs 3x10"
    m = re.match(rf"^\s*({NUM})\s*{UNIT}?\s+(\d{{1,2}})\s*x\s*(\d{{1,3}})\b(?!\s*[,/@])", t, re.I)
    if m and int(m.group(2)) <= 10:
        w, s, r = _f(m.group(1)), int(m.group(2)), int(m.group(3))
        if s <= 10 and r <= 100:
            return [(r, w)] * s, "W SxR"

    # "AxB,C,D" / "AxB/C/D" — A is weight when there's a per-set list ("15x7,6,6", "35lb x8, x8, x8")
    m = re.search(rf"({NUM})\s*{UNIT}?\s*x\s*({NUM})((?:\s*[,/]\s*x?\s*{NUM})+)", t, re.I)
    if m:
        w = _f(m.group(1))
        reps = [_i(m.group(2))] + [_i(x) for x in re.findall(NUM, m.group(3))]
        if all(r is not None and r <= 100 for r in reps) and (w >= 15 or UNIT_RE.match(m.group(0))):
            return [(r, w) for r in reps], "W x R,R,R"

    # "S x W UNIT x R" — "3x 25 lbs x 8"
    m = re.search(rf"(\d{{1,2}})\s*x\s*({NUM})\s*{UNIT}\s*x\s*(\d{{1,3}})\b", t, re.I)
    if m and int(m.group(1)) <= 10:
        return [(int(m.group(3)), _f(m.group(2)))] * int(m.group(1)), "SxWxR"

    # "AxB" where A is too big to be a set count for this lift → A is reps:
    #   "10x100#" (R x W), "8x @15" (R x W), "Grey KB x 8 x 2" (R x S), "12 x 3" (R x S)
    m = re.search(rf"(?<![\d.])(\d{{1,3}})\s*x\s*(?:@\s*)?({NUM})\s*({UNIT})?", t, re.I)
    if m:
        a, b, unit = int(m.group(1)), _f(m.group(2)), m.group(3)
        max_sets = rxs if rxs else 5
        if a > max_sets and a <= 300 and b is not None:
            def in_rng(v):
                return rng is not None and rng[0] <= v <= rng[1]
            if b <= 4 and b == int(b) and not unit and a <= 100:
                mw = UNIT_RE.search(t[:m.start()] + " " + t[m.end():])
                return [(a, _f(mw.group(1)) if mw else None)] * int(b), "RxS"
            if not unit and b == int(b) and b <= 100 and ((in_rng(b) and not in_rng(a)) or (a > 30 and b <= 30) or (rng is None and a >= 15 and a > b)):
                return [(int(b), float(a))], "WxR"
            if unit or b >= 5:
                if a <= 100:
                    return [(a, b)], "RxW"

    if timed:
        m = re.search(rf"(\d{{1,2}})\s*x\s*[-–@]?\s*({NUM})\s*{UNIT}?", t, re.I)
        if m and int(m.group(1)) <= 10:
            mw = UNIT_RE.search(t)
            w = _f(mw.group(1)) if mw else (_f(m.group(2)) if re.search(r"[-–@]", m.group(0)) else None)
            return [(None, w)] * int(m.group(1)), "timed SxW"

    # "S x W UNIT R reps" — "3x50 lbs 12reps"
    m = re.search(rf"(\d{{1,2}})\s*x\s*({NUM})\s*{UNIT}\s*(\d{{1,3}})\s*{REPS_WORD}\b", t, re.I)
    if m and int(m.group(1)) <= 10:
        return [(int(m.group(3)), _f(m.group(2)))] * int(m.group(1)), "SxWxR"

    # SxR (@|x|at)? W?
    m = re.search(rf"(\d{{1,2}})\s*x\s*({NUM})(?:\s*(?:@|at|x|w/|with)?\s*({NUM})\s*{UNIT}?)?", t, re.I)
    if m:
        s, r, w = int(m.group(1)), _f(m.group(2)), _f(m.group(3)) if m.group(3) else None
        if s <= 10 and r is not None and r <= 100 and r == int(r) and not (s >= 15):
            r = int(r)
            if w is None:
                # weight elsewhere in the line? unit'd number, or a lone trailing number
                mw = UNIT_RE.search(t[:m.start()] + " " + t[m.end():])
                if mw:
                    w = _f(mw.group(1))
                else:
                    rest = [_f(x) for x in re.findall(rf"(?<![\d.])({NUM})(?![\d.])", t[:m.start()] + " " + t[m.end():])]
                    if len(rest) == 1 and rest[0] >= 5:
                        w = rest[0]
            return [(r, w)] * s, "SxR" + ("@W" if w is not None else "")

    # rep list "10/10/9", "10, 10, 8", "12,12,10" (+ weight anywhere)
    m = re.search(rf"(?<![\d.])(\d{{1,3}})((?:\s*[,/]\s*\d{{1,3}}){{1,9}})(?![\d.])", t)
    if m:
        vals = [int(m.group(1))] + [int(x) for x in re.findall(r"\d+", m.group(2))]
        rest = t[:m.start()] + " " + t[m.end():]
        mw = UNIT_RE.search(rest)
        w = _f(mw.group(1)) if mw else None
        if w is None:
            m2 = re.search(rf"(?:@|x|at|with|w/)\s*({NUM})", rest, re.I) or re.search(rf"({NUM})\s*(?:@|x)", rest, re.I)
            if m2:
                w = _f(m2.group(1))
        if len(vals) == 2 and w is None and rng is not None:
            a, b = vals
            if rng[0] <= a <= rng[1] and not (rng[0] <= b <= rng[1]) and b >= 15:
                return [(a, float(b))], "R/W"
            if rng[0] <= b <= rng[1] and not (rng[0] <= a <= rng[1]) and a >= 15:
                return [(b, float(a))], "W/R"
        # list of weights rather than reps? (all ≥ 15 while rx says ≤ 12 reps, no other weight)
        if w is None and rng is not None and all(v > rng[1] + 5 and v >= 15 for v in vals):
            return [(None, float(v)) for v in vals], "W,W,W"
        if all(v <= 100 for v in vals):
            return [(v, w) for v in vals], "R/R/R" + ("+W" if w is not None else "")

    single = parse_single(t, rng)
    if single:
        first, w, tag = single
        if isinstance(first, list):
            return first, tag
        return [(first, w)], tag
    return [], None


def extract(block):
    """Result block → (sets [(reps, weight)], shape)."""
    rng = rx_range(block["rx_full"])
    timed = rx_is_timed(block["rx_full"])
    frags = []   # (sets, tag)
    for raw in block["lines"]:
        t = normalise(raw, timed)
        if not re.search(r"\d", t):
            continue
        sets, tag = parse_line(t, rng, rx_sets(block["rx_full"]), timed)
        if sets:
            frags.append((sets, tag))
    if not frags:
        has_digits = any(re.search(r"\d", normalise(l, timed)) for l in block["lines"])
        return [], ("unparsed" if has_digits else "text")

    # combine: sets with reps, plus weight-only fragments that supply a weight
    with_reps = [(s, tag) for s, tag in frags if any(r is not None for r, _ in s)]
    weight_only = [w for s, tag in frags if all(r is None for r, _ in s) for _, w in s if w is not None]
    if with_reps:
        out = []
        tags = []
        for s, tag in with_reps:
            out.extend(s)
            tags.append(tag)
        if weight_only and any(w is None for _, w in out):
            fill = weight_only[0] if len(weight_only) == 1 else None
            if fill is not None:
                out = [(r, w if w is not None else fill) for r, w in out]
        # sanity: reps ≤ 100, weight ≤ 1000
        out = [(r if (r is None or r <= 100) else None, w if (w is None or w <= 1500) else None) for r, w in out]
        return out[:20], "+".join(dict.fromkeys(tags))
    # weight only, no reps anywhere
    out = []
    for s, tag in frags:
        out.extend(s)
    return out[:20], frags[0][1]


def summarise(sets, block):
    """Short human line for the picker: '45lbs 3x12', '12/10/8 @ 45lbs', or raw."""
    real = [(r, w) for r, w in sets if r is not None or w is not None]
    if not real:
        first = block["lines"][0]
        return first if len(first) <= 40 else first[:38] + "…"
    reps = [r for r, _ in real]
    weights = [w for _, w in real if w is not None]
    wtxt = ""
    if weights:
        wv = weights[0] if len(set(weights)) == 1 else max(weights)
        wtxt = f"{wv:g}lbs"
    if all(r is not None for r in reps):
        if len(set(reps)) == 1:
            rtxt = f"{len(reps)}x{reps[0]}"
        else:
            rtxt = "/".join(str(r) for r in reps)
        return f"{wtxt} {rtxt}".strip() if wtxt else rtxt
    return wtxt or block["lines"][0][:40]


# ---------------------------------------------------------------------------
# SQL emission
# ---------------------------------------------------------------------------

def q(s):
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"

def qn(v):
    return "null" if v is None else (f"{v:g}" if isinstance(v, float) else str(v))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus_dir")
    ap.add_argument("--checklist", required=True, help="harvest checklist json (name/email/filename)")
    ap.add_argument("--out", required=True, help="output dir for SQL chunks (outside the repo)")
    ap.add_argument("--email", action="append", default=[], help='override "Header Name=email" for a file with no checklist email')
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--chunk", type=int, default=4000, help="set rows per SQL file")
    args = ap.parse_args()

    ck = json.load(open(os.path.expanduser(args.checklist)))
    by_file = {}
    for e in ck.get("queue", []) + ck.get("alreadyDoneOutsideRoster", []):
        if e.get("filename"):
            by_file[e["filename"]] = e
    overrides = dict(x.split("=", 1) for x in args.email)

    os.makedirs(args.out, exist_ok=True)
    imports = {}     # (source_name, lift) → dict
    sets_rows = []   # (import_id, date, set_no, reps, weight, raw, rx, shape)
    shape_counter = collections.Counter()
    per_client_unparsed = collections.Counter()
    per_client_blocks = collections.Counter()
    unparsed_samples = collections.defaultdict(list)
    match_report = []

    for fname, header, text in read_corpus(args.corpus_dir):
        ent = by_file.get(fname)
        email = (ent or {}).get("email")
        email = overrides.get(header, email)
        email = email.strip().lower() if email else None
        match_report.append((header, fname, (ent or {}).get("name"), email))
        if ent is None:
            print(f"  WARNING: {fname} not in checklist — imported with no email", file=sys.stderr)

        per_lift = collections.defaultdict(list)   # lift → [(date, sets, block)]
        for block in parse_blocks(text):
            sets, shape = extract(block)
            shape_counter[shape] += 1
            per_client_blocks[header] += 1
            if shape == "unparsed":
                per_client_unparsed[header] += 1
                if len(unparsed_samples[header]) < 8:
                    unparsed_samples[header].append((block["lift"], block["rx_full"], block["lines"]))
            per_lift[block["lift"]].append((block["date"], sets, block, shape))

        for lift, entries in per_lift.items():
            entries.sort(key=lambda e: e[0])
            iid = str(uuid.uuid5(IMPORT_NS, header + "\x1f" + lift))
            dates = sorted({d for d, _, _, _ in entries})
            n_sets = 0
            # per date, several blocks for the same lift can occur (lift programmed twice
            # in one session, e.g. A) and D)); set numbers continue across them
            per_date = collections.defaultdict(list)
            for d, s, b, sh in entries:
                per_date[d].append((s, b, sh))
            for d in dates:
                set_no = 0
                for s, b, sh in per_date[d]:
                    raw = "\n".join(b["lines"] + ([""] + b["notes"] if b["notes"] else []))
                    rows = s if s else [(None, None)]
                    for r, w in rows:
                        set_no += 1
                        sets_rows.append((iid, d, set_no, r, w, raw, b["rx_full"] or None, sh))
                    n_sets += len(rows)
            last_d = dates[-1]
            last_sets, last_block, _ = per_date[last_d][-1]
            imports[(header, lift)] = dict(
                id=iid, source_name=header, source_email=email, lift_name=lift,
                session_count=len(dates), set_count=n_sets,
                first_date=dates[0], last_date=last_d,
                last_summary=summarise(last_sets, last_block),
            )

    # ---- report -----------------------------------------------------------
    total_blocks = sum(shape_counter.values())
    print(f"\nfiles: {len(match_report)}  imports (person×lift): {len(imports)}  set rows: {len(sets_rows)}  blocks: {total_blocks}")
    print("\nshape                          blocks     %")
    for k, v in shape_counter.most_common(40):
        print(f"  {k:28s} {v:7d} {100*v/total_blocks:6.1f}")
    structured = total_blocks - shape_counter["unparsed"] - shape_counter["text"]
    print(f"\nstructured: {structured} ({100*structured/total_blocks:.1f}%)  text-only: {shape_counter['text']}  unparsed(has digits): {shape_counter['unparsed']} ({100*shape_counter['unparsed']/total_blocks:.1f}%)")
    if args.report:
        worst = sorted(per_client_blocks, key=lambda c: -per_client_unparsed[c] / max(1, per_client_blocks[c]))[:12]
        print("\nworst clients (unparsed / blocks):")
        for c in worst:
            print(f"  {c:28s} {per_client_unparsed[c]:5d} / {per_client_blocks[c]:5d}")
        with open(os.path.join(args.out, "unparsed_samples.txt"), "w") as fh:
            for c, samples in unparsed_samples.items():
                for lift, rx, lines in samples:
                    fh.write(f"{c} | {lift} | {rx} | {lines}\n")
        with open(os.path.join(args.out, "match_report.tsv"), "w") as fh:
            fh.write("header\tfile\tchecklist_name\temail\n")
            for row in match_report:
                fh.write("\t".join(str(x) for x in row) + "\n")
        print(f"\nunparsed samples → {args.out}/unparsed_samples.txt ; match report → {args.out}/match_report.tsv")

    # ---- SQL --------------------------------------------------------------
    files = []
    imp_path = os.path.join(args.out, "000_imports.sql")
    with open(imp_path, "w") as fh:
        fh.write("-- generated by scripts/truecoach_import.py — imports upsert (ids are uuid5, stable across runs)\n")
        vals = []
        for imp in imports.values():
            vals.append("(" + ", ".join([
                q(imp["id"]), q(imp["source_name"]), q(imp["source_email"]), q(imp["lift_name"]),
                str(imp["session_count"]), str(imp["set_count"]), q(imp["first_date"]), q(imp["last_date"]),
                q(imp["last_summary"]),
            ]) + ")")
        for i in range(0, len(vals), 500):
            fh.write("insert into programming.truecoach_imports (id, source_name, source_email, lift_name, session_count, set_count, first_date, last_date, last_summary) values\n")
            fh.write(",\n".join(vals[i:i + 500]))
            fh.write("\non conflict (source_name, lift_name) do update set\n"
                     "  source_email = excluded.source_email,\n"
                     "  session_count = excluded.session_count, set_count = excluded.set_count,\n"
                     "  first_date = excluded.first_date, last_date = excluded.last_date,\n"
                     "  last_summary = excluded.last_summary, updated_at = now();\n\n")
        # attach to existing accounts by email now (the trigger covers future signups)
        fh.write("update programming.truecoach_imports i set user_id = u.id, updated_at = now()\n"
                 "  from core.users u where i.user_id is null and i.source_email is not null and lower(u.email) = i.source_email;\n")
        # replace sets for every import in this run
        ids = [q(imp["id"]) for imp in imports.values()]
        for i in range(0, len(ids), 500):
            fh.write("delete from programming.truecoach_import_sets where import_id in (" + ", ".join(ids[i:i + 500]) + ");\n")
    files.append(imp_path)

    n = 0
    for i in range(0, len(sets_rows), args.chunk):
        n += 1
        p = os.path.join(args.out, f"{n:03d}_sets.sql")
        with open(p, "w") as fh:
            fh.write("insert into programming.truecoach_import_sets (import_id, date_performed, set_number, reps, weight, raw_text, prescription, parse_shape) values\n")
            fh.write(",\n".join(
                "(" + ", ".join([q(iid), q(d), str(sn), qn(r), qn(w), q(raw), q(rx), q(sh)]) + ")"
                for iid, d, sn, r, w, raw, rx, sh in sets_rows[i:i + args.chunk]))
            fh.write(";\n")
        files.append(p)

    fin_path = os.path.join(args.out, "999_finalize.sql")
    with open(fin_path, "w") as fh:
        fh.write("-- re-materialise any import that is already linked (sets were replaced above)\n")
        fh.write("delete from programming.logs l using programming.truecoach_imports i\n"
                 "  where l.truecoach_import_id = i.id and i.linked_exercise_id is not null;\n")
        fh.write("insert into programming.logs (user_id, exercise_id, date_performed, set_number, reps, weight, notes, source, truecoach_import_id)\n"
                 "  select i.user_id, i.linked_exercise_id, s.date_performed, s.set_number, s.reps, s.weight, s.raw_text, 'truecoach', i.id\n"
                 "    from programming.truecoach_import_sets s join programming.truecoach_imports i on i.id = s.import_id\n"
                 "   where i.linked_exercise_id is not null and i.user_id is not null;\n")
    files.append(fin_path)

    with open(os.path.join(args.out, "run.sh"), "w") as fh:
        fh.write("#!/bin/sh\n# run from the repo root; stops on first failure\nset -e\n")
        for p in files:
            fh.write(f'supabase db query --linked -f "{p}" > /dev/null\necho "ok {os.path.basename(p)}"\n')
    print(f"\nSQL: {len(files)} files in {args.out} (run.sh runs them in order)")


if __name__ == "__main__":
    main()
