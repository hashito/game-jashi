"""Cut one approved 2x2 image_gen sheet into four traceable game assets.

Usage: python tools/prepare-scene-art.py SHEET_ID SOURCE.png [--seam-trim 2]
This only crops/encodes existing artwork; it never starts image generation.
"""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
BRIEF = ROOT / "tools/scene-art-briefs-v4.2.json"
QUADRANTS = {"top-left": (0, 0), "top-right": (1, 0),
             "bottom-left": (0, 1), "bottom-right": (1, 1)}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def relative_target(value, prefix):
    if not isinstance(value, str) or not value.startswith(prefix):
        raise ValueError(f"Expected a project path under {prefix}: {value}")
    target = (ROOT / value).resolve()
    if not target.is_relative_to((ROOT / prefix).resolve()):
        raise ValueError(f"Path escapes its asset directory: {value}")
    return target


def artwork_target(value):
    for prefix in ("dist/assets/photos/", "dist/assets/textures/"):
        if isinstance(value, str) and value.startswith(prefix):
            return relative_target(value, prefix)
    raise ValueError(f"Expected an artwork path under dist/assets/photos/ or dist/assets/textures/: {value}")


def sheet_encoding(sheet):
    config = sheet.get("encoding", {})
    if not isinstance(config, dict) or set(config) - {"maxDimension", "quality"}:
        raise ValueError("Sheet encoding accepts only maxDimension and quality")
    maximum, quality = config.get("maxDimension", 768), config.get("quality", 82)
    if type(maximum) is not int or not 128 <= maximum <= 1024:
        raise ValueError("encoding.maxDimension must be an integer from 128 through 1024")
    if type(quality) is not int or not 40 <= quality <= 95:
        raise ValueError("encoding.quality must be an integer from 40 through 95")
    return {"format": "WEBP", "quality": quality, "method": 6, "maxDimension": maximum}


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            file.write(data)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def write_json(path, data):
    atomic_write(path, (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def crop_rect(width, height, quadrant, trim):
    x, y = QUADRANTS[quadrant]
    half_w, half_h = width // 2, height // 2
    # Trim only the two edges touching the central seam, never the outside border.
    return [x * half_w + (trim if x else 0), y * half_h + (trim if y else 0),
            (x + 1) * half_w - (trim if not x else 0),
            (y + 1) * half_h - (trim if not y else 0)]


def prepare(sheet_id, source_path, trim=0):
    if not re.fullmatch(r"[a-z0-9-]+", sheet_id):
        raise ValueError("Invalid sheet ID")
    if trim not in range(5):
        raise ValueError("Seam trim must be 0 through 4 pixels")
    brief = read_json(BRIEF)
    if brief.get("version") != 1:
        raise ValueError("Unsupported scene-art brief version")
    matches = [sheet for sheet in brief["sheets"] if sheet["id"] == sheet_id]
    if len(matches) != 1:
        raise ValueError(f"Expected one sheet named {sheet_id}")
    sheet = matches[0]
    encoding = sheet_encoding(sheet)
    jobs = sheet["jobs"]
    if len(jobs) != 4 or {job["quadrant"] for job in jobs} != set(QUADRANTS):
        raise ValueError("Each sheet must define exactly one job for each of four quadrants")
    if len({job["id"] for job in jobs}) != 4 or len({job["output"] for job in jobs}) != 4 or len({job["record"] for job in jobs}) != 4:
        raise ValueError("Sheet job IDs, output paths and record paths must be unique")
    if not isinstance(sheet.get("prompt"), str) or len(sheet["prompt"]) < 100:
        raise ValueError("The actual generation prompt must be recorded before processing")
    source_path = Path(source_path).resolve(strict=True)
    source_bytes = source_path.read_bytes()
    with Image.open(io.BytesIO(source_bytes)) as source:
        if source.format != "PNG":
            raise ValueError("Expected the original generated PNG; do not rename another image format")
        source.verify()
    with Image.open(io.BytesIO(source_bytes)) as source:
        width, height = source.size
        if width % 2 or height % 2:
            raise ValueError("Source dimensions must be even for four exactly equal quadrants")
        if min(width, height) < 512 or abs(width - height) > max(2, max(width, height) * .01):
            raise ValueError(f"Expected a square sheet at least 512px, within 1% tolerance; got {width}x{height}. No stretching was applied.")
        picture = source.convert("RGB")
    source_relative = f"assets/sources/batch-v4.2/{sheet_id}.png"
    copied_source = relative_target(source_relative, "assets/sources/")
    source_hash = digest(source_bytes)
    prepared_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    prepared = []
    for job in jobs:
        if not re.fullmatch(r"[a-z0-9-]+", job["id"]):
            raise ValueError("Invalid job ID")
        target = artwork_target(job["output"])
        record_path = relative_target(job["record"], "tools/local-media-records/")
        if target.suffix != ".webp" or record_path.suffix != ".json":
            raise ValueError("Output must be WebP and provenance record must be JSON")
        rect = crop_rect(width, height, job["quadrant"], trim)
        crop = picture.crop(rect)
        crop.thumbnail((encoding["maxDimension"], encoding["maxDimension"]), Image.Resampling.LANCZOS)
        encoded = io.BytesIO()
        crop.save(encoded, "WEBP", quality=encoding["quality"], method=encoding["method"])
        data = encoded.getvalue()
        record = {
            "id": job["id"], "sheetId": sheet_id, "kind": "image", "engine": "built-in image_gen",
            "model": "not reported by tool", "seed": "not reported by tool", "prompt": sheet["prompt"],
            "file": job["output"], "output": job["output"], "sha256": digest(data), "bytes": len(data),
            "preparedAt": prepared_at, "sourceFile": source_relative, "sourceSha256": source_hash,
            "sourceDimensions": [width, height], "quadrant": job["quadrant"], "cropRect": rect,
            "seamTrimPixels": trim, "dimensions": list(crop.size), "width": crop.width, "height": crop.height,
            "encoding": dict(encoding),
            "processing": f"User-requested exact 2x2 quadrant crop; optional internal seam trim; RGB Lanczos thumbnail bounded to {encoding['maxDimension']}px without upscaling or stretching; WebP quality{encoding['quality']} method6. No content retouching.",
            "purpose": job.get("purpose", "山中の掲示物・探索地点に残された記録画像 / " + job["id"]),
            "credit": "AI-generated fictional scene artwork, built-in image_gen; cropped from one four-image sheet.",
            "license": "Generated output; the generating service's applicable terms govern use. No third-party stock license is asserted.",
            "licenseUrl": "https://openai.com/policies/terms-of-use/",
            "source": {"kind": "generated-builtin", "engine": "image_gen", "originalFile": source_relative,
                       "sourceSha256": source_hash, "sheetId": sheet_id, "quadrant": job["quadrant"]},
        }
        prepared.append((job, target, record_path, data, record))
    # Validate and encode all four crops before changing any adopted assets.
    copied_source.parent.mkdir(parents=True, exist_ok=True)
    if source_path != copied_source:
        atomic_write(copied_source, source_bytes)
    for job, target, record_path, data, record in prepared:
        atomic_write(target, data)
        write_json(record_path, record)
        job["status"] = "ready"
    sheet.update({"sourceFile": source_relative, "sourceSha256": source_hash,
                  "sourceDimensions": [width, height], "seamTrimPixels": trim, "status": "ready"})
    write_json(BRIEF, brief)
    return {"sheet": sheet_id, "sourceFile": source_relative, "sourceSha256": source_hash,
            "outputs": [{"file": record["file"], "dimensions": record["dimensions"], "bytes": record["bytes"]}
                        for _, _, _, _, record in prepared]}


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sheet_id")
    parser.add_argument("source", type=Path)
    parser.add_argument("--seam-trim", type=int, choices=range(5), default=0,
                        help="Pixels removed only from internal quadrant seams (default: no trim)")
    args = parser.parse_args()
    print(json.dumps(prepare(args.sheet_id, args.source, args.seam_trim), ensure_ascii=False, indent=2))
