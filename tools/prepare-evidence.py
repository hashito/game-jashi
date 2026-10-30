"""Package selected image_gen originals; compression only, no visual retouching."""
import json, hashlib
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
BASE=Path('C:/Users/hasit/.codex/generated_images/01a17abc-33fb-7811-a323-50521555304b')
SOURCES={'boots-detail':'exec-89150f7c-6203-478f-982b-502bcbde652e.png','ledger-detail':'exec-1c7d0f54-b08d-49ad-b911-1226eb29ea32.png','mirror-detail':'exec-52a91ee4-972b-4232-9e66-dd6d160cedbc.png'}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
brief_path=ROOT/'tools/photo-briefs-v4.2.json'
brief=json.loads(brief_path.read_text(encoding='utf-8-sig'))
ledger_path=ROOT/'assets/production.json';ledger=json.loads(ledger_path.read_text(encoding='utf-8-sig'))
for job in brief['jobs']:
    source=BASE/SOURCES[job['id']];out=ROOT/job['output']
    with Image.open(source) as im:
        im=im.convert('RGB');im.thumbnail((768,576),Image.Resampling.LANCZOS)
        out.parent.mkdir(parents=True,exist_ok=True);im.save(out,'WEBP',quality=76,method=6)
        dims=list(im.size)
    record_path=f"tools/local-media-records/{job['id']}-v4-2.json"
    record={'id':job['id'],'engine':'built-in image_gen','model':'not reported by tool','seed':'not reported by tool','prompt':job['prompt'],'sourceFile':str(source),'sourceSha256':sha(source),'output':job['output'],'sha256':sha(out),'dimensions':dims,'bytes':out.stat().st_size,'encoding':{'format':'WEBP','quality':76,'method':6,'maxWidth':768,'maxHeight':576},'processing':'Original PNG to RGB, bounded 768x576 Lanczos resize, WebP quality76 method6; no upscaling, retouching or lossy recompression','review':'Generated fictional evidence close-up; visually inspected. The 3D model thumbnail remains the authoritative object recognition guide. Fine writing is provided as readable HTML, not generated lettering.'}
    record.update({'file':job['output'],'purpose':'小物の任意調査に使う接写写真','credit':'AI-generated fictional evidence photograph, built-in image_gen.','source':{'kind':'generated-builtin','engine':'image_gen','originalFile':str(source),'sourceSha256':sha(source)}})
    (ROOT/record_path).write_bytes((json.dumps(record,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    ledger['assets']=[a for a in ledger['assets'] if a['file']!=job['output']]
    ledger['assets'].append({'file':job['output'],'purpose':'小物の任意調査に使う接写写真','status':'ready','credit':'AI-generated fictional evidence photograph, built-in image_gen.','source':{'kind':'generated-builtin','engine':'image_gen','sha256':sha(out),'record':record_path}})
    job['status']='ready';job['record']=record_path
    print(job['id'],dims,out.stat().st_size,sha(out))
brief_path.write_bytes((json.dumps(brief,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
ledger_path.write_bytes((json.dumps(ledger,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
