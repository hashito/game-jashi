"""Repackage retained runtime originals; never overwrite source images.

Pillow is needed only for authoring. The generated report verifies deploy files.
"""
import argparse, hashlib, io, json, sys
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
sha=lambda data:hashlib.sha256(data).hexdigest()
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
write=lambda p,obj:(ROOT/p).write_bytes((json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
plan=read('tools/runtime-image-plan.json')
items=read('dist/assets/items/manifest.json')
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--items-only',action='store_true',help='Update only rendered item thumbnails, preserving verified environment images')
args=parser.parse_args()
sys.stdout.reconfigure(encoding='utf-8')
item_jobs=[]
for item in items['items']:
    stem=Path(item['file']).stem
    item_jobs.append({'source':f'dist/assets/items/{stem}.png','output':f'dist/assets/items/{stem}.webp','lossless':True,'maxBytes':24576})
all_jobs=list(plan['images'])+item_jobs
jobs=item_jobs if args.items_only else all_jobs
reports=[]
if args.items_only:
    previous=read('assets/runtime-images.json')
    wanted={job['output'] for job in plan['images']}
    reports=[entry for entry in previous['images'] if entry['output'] in wanted]
    if {entry['output'] for entry in reports}!=wanted:
        raise ValueError('Run the full runtime optimizer once before using --items-only')
    for entry in reports:
        if sha((ROOT/entry['source']).read_bytes())!=entry['sourceSha256'] or sha((ROOT/entry['output']).read_bytes())!=entry['sha256']:
            raise ValueError('Environment image changed; run the full optimizer: '+entry['source'])
for job in jobs:
    source=(ROOT/job['source']).resolve();target=(ROOT/job['output']).resolve()
    if not source.is_relative_to(ROOT/'dist/assets') or not target.is_relative_to(ROOT/'dist/assets') or source==target:
        raise ValueError('Runtime image paths must be distinct files inside dist/assets')
    raw=source.read_bytes()
    with Image.open(io.BytesIO(raw)) as image:
        original=image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
    source_alpha=original.convert('RGBA').getchannel('A').getextrema()[0]<255
    dim=job.get('maxDimension',max(original.size));quality=job.get('quality',100)
    while True:
        result=original.copy();result.thumbnail((dim,dim),Image.Resampling.LANCZOS)
        buffer=io.BytesIO();result.save(buffer,'WEBP',lossless=job.get('lossless',False),quality=quality,method=6,exact=True)
        data=buffer.getvalue()
        if len(data)<=job['maxBytes']:break
        if job.get('lossless'):raise ValueError('Lossless thumbnail exceeds budget: '+job['source'])
        if quality>54:quality-=6
        elif dim>160:dim=max(160,int(dim*.8));quality=job['quality']
        else:raise ValueError('Cannot meet image budget: '+job['source'])
    with Image.open(io.BytesIO(data)) as decoded:
        if job.get('lossless') and original.convert('RGBA').tobytes()!=decoded.convert('RGBA').tobytes():
            raise ValueError('Lossless thumbnail changed pixels: '+job['source'])
        alpha=decoded.convert('RGBA').getchannel('A')
        has_alpha=alpha.getextrema()[0]<255
        if result.convert('RGBA').getchannel('A').tobytes()!=alpha.tobytes():
            raise ValueError('WebP packaging changed the resized alpha mask: '+job['source'])
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    reports.append({**job,'sourceSha256':sha(raw),'sourceBytes':len(raw),'sourceSize':list(original.size),'sha256':sha(data),'bytes':len(data),'size':list(result.size),'quality':quality,'sourceAlpha':source_alpha,'alpha':has_alpha,'sourceRecord':'ASSETS.md (historical generation record)' if not job.get('lossless') else 'tools/make-item-images.mjs (in-game 3D model render)','processing':'Size/format/compression only; source file retained. Lossless thumbnails have identical decoded RGBA pixels; resized alpha masks are preserved exactly.'})
for item in items['items']:item['file']=str(Path(item['file']).with_suffix('.webp')).replace('\\','/')
write('dist/assets/items/manifest.json',items)
write('assets/runtime-images.json',{'version':1,'images':reports,'excludedFromBuild':[job['source'].removeprefix('dist/') for job in all_jobs]+plan['excludeUnused']})
print(json.dumps({'files':len(reports),'updated':len(jobs),'beforeBytes':sum(r['sourceBytes'] for r in reports),'afterBytes':sum(r['bytes'] for r in reports)},indent=2))
