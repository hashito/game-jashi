// States of a standard 3D game for tools/check-text-contrast.mjs (--hooks): title, HUD, every menu tab, an inventory detail, the journal, the pause menu,
// settings and release notes.  Add the states your own screens need (terminals, documents, mini games) the same way.
//   node tools/check-text-contrast.mjs http://localhost:8000 --hooks tools/contrast-hooks/std.mjs --viewport 390x844,1920x1080 --shots shots/
export const url = (base, { mobile }) => `${new URL(base).origin}/?debug=1&calm=1&qa=1&autostart=1&nointro${mobile ? "&touch=1" : ""}`;

export default async function ({ page, audit, vp }) {
  const mobile = vp[0] < 700;
  const go = async (js, ms = 350) => { await page.eval(js); await page.sleep(ms); };
  const state = async (name) => audit(name);
  const origin = new URL(await page.eval("location.href")).origin;
  await page.goto(`${origin}/?calm=1&qa=1${mobile ? "&touch=1" : ""}`);
  await page.waitFor("document.querySelector('#title') && !document.querySelector('#title').classList.contains('hidden')", 120000);
  await page.sleep(1500);
  await state("title");
  await page.goto(url(origin, { mobile }));
  await page.waitFor("window.__game && window.__game.state && window.__game.state.started", 120000);
  await page.sleep(3500);
  await state("hud");
  for (const tab of ["items", "tasks", "notes", "map"]) { await go(`window.__game.tm.open(${JSON.stringify(tab)})`, 600); await state(`menu ${tab}`); }
  await go(`window.__game.tm.open("items")`, 400); await go(`document.querySelector(".iv-cell")?.click()`, 400);
  await go(`(() => { const d = document.querySelector(".iv-detail"); if (d) d.scrollTop = d.scrollHeight; })()`, 200); await state("inventory detail");
  await go(`window.__game.tm.open("notes")`, 400); await go(`document.querySelector(".jn-main")?.click()`, 300); await state("journal opened entry");
  await go(`window.__game.tm.close()`, 300);
  await go(`window.__game.pm.open()`, 500); await state("pause menu");
  await go(`[...document.querySelectorAll(".pm-item")].find((b) => /設定/.test(b.textContent))?.click()`, 400); await state("settings");
  await go(`window.__game.pm.open()`, 300);
  await go(`[...document.querySelectorAll(".pm-item")].find((b) => /更新/.test(b.textContent))?.click()`, 500); await state("release notes");
}
