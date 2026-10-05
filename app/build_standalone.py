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
source_entry=(root/'index.html').read_text()
fallback=re.search(r'(<div id="startup-fallback".*?</noscript>)',source_entry,re.S)[1]
fallback_css=re.search(r'<style>(.*?)</style>',source_entry,re.S)[1]
output='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'"><title>Mooncake Studio</title><style>'''+fallback_css+css.read_text()+'''</style></head><body><div id="app"></div>'''+fallback+'''<script>window.__MOONCAKE_EMBEDDED__='''+json.dumps(assets,separators=(',',':'))+'''</script><script type="module">'''+script+'''</script><pre hidden aria-hidden="true">'''+html.escape(licenses)+'''</pre></body></html>'''
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=root.parent/'release'/'Mooncake-Studio.html');args=parser.parse_args();p=args.output;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(output);print(f'{p}: {p.stat().st_size:,} bytes')
