"""Local ComfyUI/VOICEVOX workers and provenance checks for the shared queue.

Each remote submission is recorded before polling; rerunning resumes the same
prompt instead of assuming that /prompt means generation is finished.
No engine installation, service termination, paid API or model download occurs.
"""
import datetime
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request
import wave

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools/_raw/local-media"
RECORDS = ROOT / "tools/local-media-records"
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def request(url, data=None, timeout=60, binary=False):
    req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode("utf-8"),
                                 headers={"Content-Type": "application/json"} if data is not None else {})
    with HTTP.open(req, timeout=timeout) as response:
        result = response.read()
    return result if binary else json.loads(result)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dated():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save_record(key, record, target, record_dir=RECORDS):
    record.update({"file": target.relative_to(ROOT).as_posix(), "generatedAt": dated(),
                   "sha256": sha(target), "bytes": target.stat().st_size})
    write_json(record_dir / f"{key}.json", record)
    print(json.dumps(record, ensure_ascii=False), flush=True)


def voice(key):
    cfg = read_json(ROOT / "tools/local-media-voices.json")
    text = cfg["clips"][key]
    endpoint = os.getenv("JASHI_VOICEVOX_URL", cfg["endpoint"])
    version = request(endpoint + "/version", timeout=10)
    query = request(endpoint + "/audio_query?" + urllib.parse.urlencode({"speaker": cfg["speaker"], "text": text}), {}, timeout=90)
    query.update(cfg["query"])
    raw = request(endpoint + f"/synthesis?speaker={cfg['speaker']}&enable_interrogative_upspeak=false", query, timeout=180, binary=True)
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / f"voice-{key}.wav").write_bytes(raw)
    write_json(RAW / f"voice-{key}-query.json", query)
    with wave.open(io.BytesIO(raw), "rb") as wav:
        rate, width, channels = wav.getframerate(), wav.getsampwidth(), wav.getnchannels()
        if width != 2 or channels != 1:
            raise ValueError("Expected 16-bit mono synthesis")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float64) / 32768
    before_peak = float(np.max(np.abs(samples)))
    if before_peak >= .999:
        raise ValueError("Raw speech is clipped; reduce synthesis volume")
    activity = np.flatnonzero(np.abs(samples) > .004)
    if not len(activity):
        raise ValueError("Speech synthesis returned silence")
    start = max(0, int(activity[0]) - round(rate * .12))
    end = min(len(samples), int(activity[-1]) + round(rate * .20))
    samples = samples[start:end]
    samples *= (10 ** (-6 / 20)) / max(float(np.max(np.abs(samples))), 1e-9)
    fade = min(round(rate * .006), len(samples) // 4)
    samples[:fade] *= np.linspace(0, 1, fade)
    samples[-fade:] *= np.linspace(1, 0, fade)
    duration = len(samples) / rate
    if not 2 < duration < 20:
        raise ValueError(f"Unexpected speech length {duration:.2f}s")
    target = ROOT / f"dist/assets/audio/guide-{key}.wav"
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate)
        wav.writeframes(np.round(samples * 32767).astype("<i2").tobytes())
    save_record("voice-" + key, {
        "kind": "voice", "engine": "VOICEVOX", "engineVersion": version,
        "speaker": cfg["speaker"], "speakerName": cfg["speakerName"], "style": cfg["style"],
        "credit": cfg["credit"], "licenseUrl": cfg["licenseUrl"], "text": text,
        "querySettings": cfg["query"], "sampleRate": rate, "channels": 1,
        "durationSeconds": round(duration, 3), "peakDbfs": round(20 * math.log10(float(np.max(np.abs(samples)))), 2),
        "rmsDbfs": round(20 * math.log10(float(np.sqrt(np.mean(samples ** 2)))) , 2),
        "rawPeakDbfs": round(20 * math.log10(before_peak), 2), "clippedSamples": int(np.count_nonzero(np.abs(samples) >= .999)),
        "silenceFractionBelowMinus50Db": round(float(np.mean(np.abs(samples) < 10 ** (-50 / 20))), 3),
        "processing": "Trim silence with 120ms/200ms margins; 6ms edge fades; peak normalize to -6dBFS. No effects or altered words."
    }, target)


def photo(key):
    cfg = read_json(ROOT / "tools/local-media-comfy-prompts.json")
    job = next(j for j in cfg["jobs"] if j["id"] == key)
    endpoint = os.getenv("JASHI_COMFY_URL", cfg.get("endpoint", "http://127.0.0.1:8188"))
    model, seed, width, height = job["model"], job["seed"], job["width"], job["height"]
    flux = "flux" in model.lower()
    workflow = {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": model}},
        "5": {"class_type": "EmptySD3LatentImage" if flux else "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": job["prompt"], "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "" if flux else job.get("negative", "text, watermark, blurry, deformed, illustration"), "clip": ["4", 1]}},
        "3": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": job.get("steps", 4 if flux else 26), "cfg": 1 if flux else 6.5,
                "sampler_name": "euler" if flux else "dpmpp_2m", "scheduler": "simple" if flux else "karras", "denoise": 1,
                "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"jashi-v4-1/{key}-{seed}", "images": ["8", 0]}},
    }
    recipe = hashlib.sha256(json.dumps(workflow, sort_keys=True).encode()).hexdigest()
    ticket_path = RAW / f"image-{key}-ticket.json"
    ticket = read_json(ticket_path) if ticket_path.exists() else None
    if ticket and ticket.get("recipe") == recipe and ticket.get("endpoint") == endpoint:
        pid = ticket["promptId"]
        print(f"Resuming {key}: {pid}", flush=True)
    else:
        # Do not jump ahead of other producers. Once accepted, let ComfyUI own execution order.
        deadline = time.monotonic() + 1800
        while True:
            q = request(endpoint + "/queue", timeout=15)
            if not q.get("queue_running") and not q.get("queue_pending"):
                break
            if time.monotonic() > deadline:
                raise TimeoutError("Other ComfyUI jobs did not become idle; no job submitted")
            time.sleep(5)
        write_json(RAW / f"image-{key}-workflow.json", workflow)
        posted = request(endpoint + "/prompt", {"prompt": workflow, "client_id": "jashi-v4-1-local-media"}, timeout=30)
        pid = posted["prompt_id"]
        write_json(ticket_path, {"promptId": pid, "recipe": recipe, "endpoint": endpoint, "submittedAt": dated()})
        print(f"Submitted {key}: {pid}", flush=True)
    deadline = time.monotonic() + 2400
    while time.monotonic() < deadline:
        entry = request(endpoint + "/history/" + pid, timeout=30).get(pid)
        if entry:
            if entry.get("status", {}).get("status_str") == "error":
                write_json(RAW / f"image-{key}-error.json", entry)
                raise RuntimeError(f"ComfyUI job {pid} failed; see image-{key}-error.json")
            images = entry.get("outputs", {}).get("9", {}).get("images", [])
            if images:
                image = images[0]
                data = request(endpoint + "/view?" + urllib.parse.urlencode(image), timeout=60, binary=True)
                raw_path = RAW / f"image-{key}-{seed}.png"
                raw_path.write_bytes(data)
                target = ROOT / job["output"]
                target.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(io.BytesIO(data)) as original:
                    original.verify()
                with Image.open(io.BytesIO(data)) as original:
                    picture = original.convert("RGB")
                    if picture.width != width or picture.height != height:
                        raise ValueError(f"Unexpected generated dimensions {picture.size}")
                    picture.thumbnail((1400, 1050), Image.Resampling.LANCZOS)
                    picture.save(target, "WEBP", quality=88, method=6)
                    pixels = np.asarray(picture, dtype=np.float64)
                    luminance = pixels @ np.array([.2126, .7152, .0722])
                save_record("image-" + key, {"kind": "image", "engine": "ComfyUI", "model": model,
                    "seed": seed, "steps": workflow["3"]["inputs"]["steps"], "promptId": pid, "prompt": job["prompt"],
                    "width": picture.width, "height": picture.height, "sourceSha256": hashlib.sha256(data).hexdigest(),
                    "meanLuminance": round(float(luminance.mean()), 2), "luminanceStdDev": round(float(luminance.std()), 2),
                    "processing": "RGB WebP encoding only; no content edits or compositing.", "purpose": job["purpose"],
                    "credit": "Local AI-generated scene photograph; not a photograph of a real event."}, target,
                    ROOT / cfg.get("recordDirectory", "tools/local-media-records"))
                return
        time.sleep(3)
    raise TimeoutError(f"ComfyUI {pid} is not finished; inspect history before rerunning")


def verify_voice(key):
    """Reuse shipped speech without contacting an engine or altering the output."""
    cfg = read_json(ROOT / "tools/local-media-voices.json")
    record = read_json(RECORDS / f"voice-{key}.json")
    target = ROOT / record["file"]
    if record.get("text") != cfg["clips"][key] or record.get("querySettings") != cfg["query"]:
        raise ValueError(f"Speech recipe changed for {key}; regenerate explicitly with the voice queue")
    for field in ("speaker", "speakerName", "style", "credit"):
        if record.get(field) != cfg[field]:
            raise ValueError(f"Speech {field} changed for {key}")
    if record.get("engine") != "VOICEVOX" or sha(target) != record["sha256"]:
        raise ValueError(f"Speech provenance or bytes differ for {key}")
    with wave.open(str(target), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (24000, 1, 2):
            raise ValueError(f"Unexpected WAV format for {key}")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float64) / 32768
        duration = len(samples) / wav.getframerate()
    peak = float(np.max(np.abs(samples)))
    if not 2 < duration < 20 or not .49 < peak < .51 or np.any(np.abs(samples) >= .999):
        raise ValueError(f"Speech QA failed for {key}")
    write_json(ROOT / f"tools/local-media-verification/voice-{key}.json", {
        "file": record["file"], "sha256": record["sha256"], "status": "verified-existing",
        "durationSeconds": round(duration, 3), "peakDbfs": round(20 * math.log10(peak), 2),
        "engineContacted": False, "verifiedAt": dated()})
    print(f"Verified existing voice: {key}; no synthesis", flush=True)


def ledger():
    assets = []
    for path in sorted(RECORDS.glob("*.json")):
        r = read_json(path)
        target = ROOT / r["file"]
        if not target.is_file() or sha(target) != r["sha256"]:
            raise ValueError(f"Output differs from verified record: {r['file']}")
        source = dict(r.get("source", {}))
        # Imported image_gen originals must never be labelled as local inference.
        source_kind = source.get("kind")
        if not source_kind:
            if r["engine"] not in ("VOICEVOX", "ComfyUI"):
                raise ValueError(f"Missing explicit source.kind for {path.name}")
            source_kind = "generated-local"
        source.update({"kind": source_kind, "engine": r["engine"], "sha256": r["sha256"],
                       "record": path.relative_to(ROOT).as_posix()})
        assets.append({"file": r["file"], "purpose": r.get("purpose", "修司の探索案内 / " + path.stem),
                       "status": "ready", "credit": r["credit"],
                       "source": source})
    if len(assets) != 11:
        raise ValueError(f"Expected 3 photographs and 8 voice clips; got {len(assets)}")
    write_json(ROOT / "assets/production.json", {"version": 1, "assets": assets})
    print(f"Verified ledger: {len(assets)} assets", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    RAW.mkdir(parents=True, exist_ok=True)
    action = sys.argv[1]
    if action == "voice": voice(sys.argv[2])
    elif action == "verify-voice": verify_voice(sys.argv[2])
    elif action == "photo": photo(sys.argv[2])
    elif action == "ledger": ledger()
    else: raise ValueError("Expected voice ID, photo ID, or ledger")
