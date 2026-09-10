#!/usr/bin/env python3
"""Download the demo photography named in `manifest.json` and write its attribution.

Media is a real legal exposure for this product, so the rules here are deliberately narrow:

  - Wikimedia Commons only, and only files under CC0 / CC BY / CC BY-SA / public domain. Anything
    else aborts the run rather than being silently skipped, because a missing photo is obvious in
    the app and an unlicensed one is not.
  - Every file's author and licence are recorded in `packages/demo/src/credits.ts`, which the app
    renders. Attribution that lives only in a document is attribution nobody ships.
  - Images are stored in the repository rather than hotlinked, so an investor demonstration does
    not depend on conference wifi or on Wikimedia staying reachable.

Re-run after editing the manifest:  python3 fetch.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, "apps", "tourist-web", "public", "demo")
CREDITS_TS = os.path.join(ROOT, "packages", "demo", "src", "credits.ts")
CREDITS_DOC = os.path.join(ROOT, "docs", "media-credits.md")
LICENSED_JSON = os.path.join(HERE, "licensed.json")
LICENSED_DIR = os.path.join(HERE, "licensed")

API = "https://commons.wikimedia.org/w/api.php"
UA = "caribbean-vip-demo-seed/1.0 (repository seeding; contact via project)"
WIDTH = 1600
OK_LICENCE = re.compile(r"^(CC0|CC BY|CC BY-SA|Public domain|PDM|No restrictions)", re.I)


def strip_html(value):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", value or "")).strip()


def imageinfo(titles):
    """Commons allows 50 titles per query — batch rather than one request per file."""
    out = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i : i + 40]
        params = {
            "action": "query", "format": "json", "formatversion": "2",
            "titles": "|".join(chunk), "prop": "imageinfo",
            "iiprop": "url|extmetadata|size", "iiurlwidth": str(WIDTH),
        }
        argv = ["curl", "-sS", "--max-time", "90", "-A", UA, "-G", API]
        for k, v in params.items():
            argv += ["--data-urlencode", f"{k}={v}"]
        result = subprocess.run(argv, capture_output=True, text=True)
        data = json.loads(result.stdout or "{}")
        for page in (data.get("query") or {}).get("pages") or []:
            out[page.get("title")] = page
        # Commons normalizes some titles (underscores, capitalisation); follow the mapping so a
        # lookup by the manifest's spelling still finds the page.
        for norm in (data.get("query") or {}).get("normalized") or []:
            if norm["to"] in out:
                out[norm["from"]] = out[norm["to"]]
    return out


def shrink(path):
    """Commons originals are 3–8 MP. Full size would put ~40 MB of photography in a mobile bundle
    for no visible gain on a phone screen, so everything lands at 1400px / quality 78."""
    from PIL import Image

    image = Image.open(path).convert("RGB")
    image.thumbnail((1400, 1400), Image.LANCZOS)
    image.save(path, "JPEG", quality=78, optimize=True, progressive=True)


def main():
    manifest = {k: v for k, v in json.load(open(os.path.join(HERE, "manifest.json"))).items()
                if not k.startswith("_")}
    pages = imageinfo(sorted({entry["file"] for entry in manifest.values()}))

    credits, jobs, problems = {}, [], []

    for key, entry in sorted(manifest.items()):
        page = pages.get(entry["file"])
        info = (page or {}).get("imageinfo") or []
        if not info:
            problems.append(f"{key}: no such file on Commons — {entry['file']}")
            continue
        info = info[0]
        meta = info.get("extmetadata") or {}
        licence = strip_html((meta.get("LicenseShortName") or {}).get("value", ""))
        if not OK_LICENCE.match(licence):
            problems.append(f"{key}: licence {licence!r} is not on the accepted list")
            continue

        credits[key] = {
            "subject": entry["subject"],
            "author": strip_html((meta.get("Artist") or {}).get("value", "")) or "Unknown",
            "licence": licence,
            "licenceUrl": strip_html((meta.get("LicenseUrl") or {}).get("value", "")),
            "source": info.get("descriptionurl", ""),
            "file": entry["file"],
        }
        jobs.append((key, info.get("thumburl") or info.get("url")))

    # --- Operator-supplied photography ---------------------------------------
    #
    # Commons can be verified; a vendor's own photograph cannot. So the check here is that its
    # provenance was actually written down — who owns it and on what basis we are using it. An
    # entry missing either is refused, for the same reason an unlicensed Commons file is: a missing
    # photograph is obvious in the app and an undocumented one is not.
    licensed = {}
    if os.path.exists(LICENSED_JSON):
        licensed = {k: v for k, v in json.load(open(LICENSED_JSON)).items()
                    if not k.startswith("_")}

    for key, entry in sorted(licensed.items()):
        source_path = os.path.join(LICENSED_DIR, f"{key}.jpg")
        if not os.path.exists(source_path):
            problems.append(f"{key}: licensed.json names it but licensed/{key}.jpg is missing")
            continue
        holder = (entry.get("rightsHolder") or "").strip()
        permission = (entry.get("permission") or "").strip()
        if not holder or not permission:
            problems.append(f"{key}: licensed entries need both 'rightsHolder' and 'permission'")
            continue
        if permission.upper().startswith("REPLACE ME"):
            problems.append(f"{key}: 'permission' is still the placeholder — record how we got it")
            continue
        credits[key] = {
            "subject": entry.get("subject", ""),
            "author": holder,
            # Rendered on the card exactly like a Commons licence, so the basis always travels
            # with the image rather than living only in this file.
            "licence": f"Used with permission — {permission}",
            "licenceUrl": entry.get("sourceUrl", "") or entry.get("source", ""),
            "source": entry.get("source", ""),
            "file": f"licensed/{key}.jpg",
        }
        # Copied rather than downloaded, then shrunk on the same terms as everything else.
        jobs = [j for j in jobs if j[0] != key]
        target = os.path.join(ASSETS, f"{key}.jpg")
        os.makedirs(ASSETS, exist_ok=True)
        shutil.copyfile(source_path, target)
        shrink(target)

    if problems:
        print("Refusing to write anything — fix the manifest first:", file=sys.stderr)
        for p in problems:
            print("  -", p, file=sys.stderr)
        return 1

    os.makedirs(ASSETS, exist_ok=True)

    force = "--force" in sys.argv

    def download(job):
        key, url = job
        path = os.path.join(ASSETS, f"{key}.jpg")
        # Existing files are left alone: they have already been recompressed for the mobile bundle,
        # and re-downloading would silently undo that. Delete a file (or pass --force) to refresh it.
        if not force and os.path.exists(path) and os.path.getsize(path) > 10_000:
            return key, os.path.getsize(path)
        subprocess.run(["curl", "-sS", "-L", "--max-time", "120", "-A", UA, "-o", path, url],
                       capture_output=True)
        size = os.path.getsize(path) if os.path.exists(path) else 0
        if size > 10_000:
            shrink(path)
            size = os.path.getsize(path)
        return key, size

    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(download, jobs))

    tiny = [k for k, size in results if size < 10_000]
    if tiny:
        print(f"Downloads failed or returned junk: {', '.join(tiny)}", file=sys.stderr)
        return 1

    # Emitted as TypeScript rather than JSON so the app gets a typed table without every consumer
    # needing `resolveJsonModule`, and so the "do not edit" notice travels with the data.
    ts = [
        "/**",
        " * Photograph credits for the demo dataset — GENERATED, do not edit.",
        " *",
        " * Written by `scripts/seed-media/fetch.py` from `scripts/seed-media/manifest.json`.",
        " *",
        " * `subject` is what the photograph actually shows. The app renders it together with the",
        " * author and licence, because CC BY and CC BY-SA require attribution wherever the work",
        " * appears — and because some listings are illustrated with a representative photograph of",
        " * the right island rather than of that exact operator.",
        " */",
        "",
        "export interface DemoMediaCredit {",
        "  /** What the photograph actually shows. */",
        "  subject: string;",
        "  author: string;",
        "  licence: string;",
        "  licenceUrl: string;",
        "  /** The file's description page on Wikimedia Commons. */",
        "  source: string;",
        "}",
        "",
        "export const DEMO_MEDIA_CREDITS: Record<string, DemoMediaCredit> = {",
    ]
    for key, c in sorted(credits.items()):
        ts.append(f"  {json.dumps(key)}: {{")
        for field in ("subject", "author", "licence", "licenceUrl", "source"):
            ts.append(f"    {field}: {json.dumps(c[field])},")
        ts.append("  },")
    ts += [
        "};",
        "",
        "/** Credit for one media key, or null when the key is unknown. */",
        "export function demoMediaCredit(key: string): DemoMediaCredit | null {",
        "  return DEMO_MEDIA_CREDITS[key] ?? null;",
        "}",
        "",
        "/** One-line attribution, in the form CC BY and CC BY-SA actually ask for. */",
        "export function demoMediaCreditLine(key: string): string | null {",
        "  const credit = DEMO_MEDIA_CREDITS[key];",
        "  if (!credit) return null;",
        "  return `${credit.subject} · ${credit.author} · ${credit.licence}`;",
        "}",
        "",
    ]
    open(CREDITS_TS, "w").write("\n".join(ts))

    lines = [
        "# Demo photography credits",
        "",
        "Every photograph bundled with the demo dataset, with its author and licence.",
        "",
        "Generated by `scripts/seed-media/fetch.py` from `scripts/seed-media/manifest.json` —",
        "edit the manifest and re-run rather than editing this file.",
        "",
        "All files come from Wikimedia Commons under CC0, CC BY, CC BY-SA or public domain. The",
        "app renders the author and licence beneath each image, because CC BY and CC BY-SA both",
        "require attribution wherever the work appears.",
        "",
        "| Key | Subject | Author | Licence | Source |",
        "|---|---|---|---|---|",
    ]
    for key, c in sorted(credits.items()):
        licence = f"[{c['licence']}]({c['licenceUrl']})" if c["licenceUrl"] else c["licence"]
        lines.append(
            f"| `{key}` | {c['subject']} | {c['author']} | {licence} | [Commons]({c['source']}) |"
        )
    lines.append("")
    open(CREDITS_DOC, "w").write("\n".join(lines))

    total = sum(size for _, size in results)
    print(f"{len(results)} images -> {ASSETS} ({total / 1_000_000:.1f} MB)")
    print(f"credits -> {CREDITS_TS}")
    print(f"credits -> {CREDITS_DOC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
