"""Download public presentation assets; deliberately exclude the trajectory archive."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import urlsplit
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1] / 'vendor' / 'site'
ORIGIN = 'https://www.swe-marathon.org'

def download(path):
    target = ROOT / urlsplit(path).path.lstrip('/')
    if target.exists():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(Request(ORIGIN + path, headers={'User-Agent': 'SWE-Marathon-Replica/1.0'}), timeout=45) as response:
        body = response.read()
        if 'text/html' in response.headers.get('Content-Type', '') and not path.endswith('.html'):
            raise RuntimeError(f'Unexpected HTML for asset {path}')
    target.write_bytes(body)
    print(f'{path}: {len(body):,} bytes', flush=True)
    return target

pending = {'/favicon.png', '/icon-192.png', '/apple-touch-icon.png', '/site.webmanifest',
           '/og-image-staircase-20260605.png', '/benchmark-horizons.svg'}
seen = set()
while True:
    for file in ROOT.rglob('*'):
        if file.suffix not in {'.html', '.js', '.css', '.webmanifest'}:
            continue
        text = file.read_text()
        pending.update(re.findall(r'/assets/[\w./-]+(?:\?[\w=]+)?', text))
        pending.update('/' + x for x in re.findall(r'(?<![/\w])assets/[\w./-]+\.(?:js|css)', text))
        pending.update('/assets/' + x for x in re.findall(r'\./([\w-]+\.(?:js|css))', text))
    batch = sorted(pending - seen)
    if not batch:
        break
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(download, batch))
    seen.update(batch)

manifest = [{'path': str(f.relative_to(ROOT)), 'bytes': f.stat().st_size,
             'sha256': hashlib.sha256(f.read_bytes()).hexdigest()}
            for f in sorted(ROOT.rglob('*')) if f.is_file()]
(ROOT.parent / 'manifest.json').write_text(json.dumps({
    'origin': ORIGIN, 'capturedOn': '2026-10-19', 'files': manifest
}, indent=2) + '\n')
print(f'Snapshot complete: {len(manifest)} files')
