"""After npm run build, inline all browser resources into one file://-ready HTML."""
from pathlib import Path
import base64,json,re,html,argparse
root=Path(__file__).resolve().parent
dist=root/'dist'
entry=(dist/'index.html').read_text()
js=dist/re.search(r'<script[^>]*src="([^"]+)"',entry)[1]
css=dist/re.search(r'<link[^>]*href="([^"]+\.css)"',entry)[1]
worker=next((dist/'assets').glob('worker-*.js'))
b64=lambda f:base64.b64encode(f.read_bytes()).decode()
worker_js=re.sub(r'export\{[^}]*\};?\s*$','',worker.read_text()).replace('import.meta.url','self.location.href')
assets={'wasm':b64(dist/'manifold.wasm'),'worker':base64.b64encode(worker_js.encode()).decode(),'rocketURL':'data:image/svg+xml;base64,'+b64(dist/'rocket.svg')}
script=re.sub(r'</script',r'<\\/script',js.read_text(),flags=re.I)
license_files=[root.parent/'LICENSE',*sorted((root/'licenses').glob('*'))]
licenses='\n\n'.join(p.name+'\n'+p.read_text() for p in license_files)
fallback='''<div id="startup-fallback" class="startup-fallback" role="status" aria-live="polite"><div class="startup-fallback__card"><strong>Starting Mooncake Studio…</strong><p data-startup-detail>If this message remains, this preview is blocking the app’s JavaScript, WebAssembly, or web worker. On iPhone, open the hosted HTTPS version in Safari instead of using Files or Quick Look.</p></div></div><noscript><div class="startup-fallback"><div class="startup-fallback__card"><strong>JavaScript is required.</strong><p>Open the hosted Mooncake Studio page in a current browser.</p></div></div></noscript>'''
fallback_css='''.startup-fallback{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:#e8e8e6;color:#242424;font:16px/1.5 system-ui,sans-serif}.startup-fallback__card{max-width:34rem;padding:24px;border:1px solid #aaa;background:#f7f7f5;box-shadow:0 8px 30px #0002}.startup-fallback strong{display:block;margin-bottom:8px;font-size:1.15rem}.startup-fallback p{margin:0}'''
output='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'"><title>Mooncake Studio</title><style>'''+fallback_css+css.read_text()+'''</style></head><body><div id="app"></div>'''+fallback+'''<script>window.__MOONCAKE_EMBEDDED__='''+json.dumps(assets,separators=(',',':'))+'''</script><script type="module">'''+script+'''</script><pre hidden aria-hidden="true">'''+html.escape(licenses)+'''</pre></body></html>'''
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=root.parent/'release'/'Mooncake-Studio.html');args=parser.parse_args();p=args.output;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(output);print(f'{p}: {p.stat().st_size:,} bytes')
