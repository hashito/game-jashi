"""Package an explicitly selected original and preserve its real provenance.

Used only for an approved existing source. Local ComfyUI generation uses
local-media-worker.py photo ID instead. No content edits or compositing.
"""
import json
import sys
import runpy
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
job = next(j for j in json.loads((root / 'tools/photo-prompts.json').read_text(encoding='utf-8'))['jobs'] if j['id'] == sys.argv[1])
source = root / 'assets/sources' / (job['id'] + '.png')
origin = job.get('importSource')
if not origin or not origin.get('engine') or not origin.get('originalFile'):
    raise ValueError('No explicitly selected importSource provenance in photo-prompts.json')
if origin.get('kind') not in ('generated-builtin', 'edited-builtin'):
    raise ValueError('An explicit builtin generation/edit source kind is required')
target = root / job['output']
target.parent.mkdir(parents=True, exist_ok=True)
with Image.open(source) as original:
    source_size = original.size
    photo = original.convert('RGB')
    photo.thumbnail((1400, 1050), Image.Resampling.LANCZOS)
    photo.save(target, format='WEBP', quality=88, method=6)
worker = runpy.run_path(str(root / 'tools/local-media-worker.py'))
if worker['sha'](source) != origin['sourceSha256']:
    raise ValueError('Selected original differs from its recorded SHA-256')
with Image.open(target) as packaged:
    luma = np.asarray(packaged.convert('RGB'), dtype=np.float64) @ np.array([.2126, .7152, .0722])
worker['save_record']('image-' + job['id'], {
    'kind': 'image', 'engine': origin['engine'], 'source': origin,
    'brief': job['prompt'], 'promptStatus': job.get('promptStatus', 'production brief; exact generation request not archived'),
    'width': photo.width, 'height': photo.height, 'sourceWidth': source_size[0], 'sourceHeight': source_size[1],
    'meanLuminance': round(float(luma.mean()), 2), 'luminanceStdDev': round(float(luma.std()), 2),
    'darkFractionBelow16': round(float(np.mean(luma < 16)), 4),
    'qa': job['qa'],
    'sourceSha256': worker['sha'](source), 'purpose': job['purpose'],
    'processing': 'RGB WebP quality88 and fit within 1400x1050 only; no crop, content edits, or compositing.',
    'credit': 'AI-generated scene photograph; source method explicitly recorded; not a real-event photograph.'
}, target)
