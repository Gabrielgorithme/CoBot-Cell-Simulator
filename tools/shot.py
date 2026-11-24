import sys, json, asyncio
from playwright.async_api import async_playwright
# usage: shot.py <html> <out_prefix> '<json list of steps>'  ; step = {"js": "...", "wait": ms, "name": "x"}
async def main():
    html, prefix, steps = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else [{"name": "a"}]
    w, h = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (1600, 900)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--allow-file-access-from-files"])
        pg = await b.new_page(viewport={"width": w, "height": h})
        logs = []
        pg.on("console", lambda m: logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: logs.append("pageerror: " + str(e)))
        await pg.goto("file://" + html)
        try:
            await pg.wait_for_function("document.body.dataset.ready==='1' || document.body.dataset.error", timeout=90000)
        except Exception as e:
            logs.append("timeout waiting ready")
        err = await pg.evaluate("document.body.dataset.error||''")
        if err: print("ERROR:", err[:1500])
        for s in steps:
            if s.get("js"):
                try:
                    r = await pg.evaluate(s["js"])
                    if r is not None: print(s.get("name", ""), "=>", json.dumps(r)[:1500])
                except Exception as e: print("JS error:", str(e)[:800])
            if s.get("wait"): await pg.wait_for_timeout(s["wait"])
            if s.get("name") and not s.get("noshot"): await pg.screenshot(path=f"{prefix}_{s['name']}.png")
        for l in logs[:25]: print(l[:400])
        await b.close()
asyncio.run(main())
