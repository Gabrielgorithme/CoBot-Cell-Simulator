import sys, json, asyncio
from playwright.async_api import async_playwright
# usage: shot-mobile.py <html> <out_prefix> '<json steps>' [width height]   (touch device emulation)
async def main():
    html, prefix, steps = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    w, h = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (390, 844)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); logs = []
        pg.on("pageerror", lambda e: logs.append("pageerror: " + str(e)))
        await pg.goto("file://" + html)
        await pg.wait_for_function("document.body.dataset.ready==='1' || document.body.dataset.error", timeout=120000)
        for s in steps:
            if s.get("js"):
                try:
                    r = await pg.evaluate(s["js"])
                    if r is not None: print(s.get("name", ""), "=>", json.dumps(r)[:1200])
                except Exception as e: print("JS error:", str(e)[:600])
            if s.get("tap"): await pg.tap(s["tap"])
            if s.get("wait"): await pg.wait_for_timeout(s["wait"])
            if s.get("name") and not s.get("noshot"): await pg.screenshot(path=f"{prefix}_{s['name']}.png")
        for l in logs[:10]: print(l[:300])
        await b.close()
asyncio.run(main())
