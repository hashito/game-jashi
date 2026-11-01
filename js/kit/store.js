/* game-kit 6e0b6f0: js/store.js — edit in game-kit and run tools/kit-sync.js */
// Saves and settings in localStorage. Every access is wrapped: in a private window or with storage
// blocked the game still plays, only resuming does not. From 未然調書 / ひだまり薬局 save.js.
//
//   const store = new Store('hidamari', 1);     // keys hidamari.save.v1 / hidamari.settings.v1
//   store.save({ ... }); store.load(); store.clear();
//   const settings = store.settings({ volume: 0.7, bgm: 0.5, sensitivity: 1, fontScale: 1 });
//   store.saveSettings(settings);
//   store.autosave(() => game.snapshot())       // on tab hide / page hide
export class Store {
  constructor(name, version = 1) {
    this.version = version;
    this.key = `${name}.save.v${version}`;
    this.skey = `${name}.settings.v${version}`;
  }

  static read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  static write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    const s = Store.read(this.key);
    return s && s.v === this.version ? s : null;
  }

  save(data) {
    return Store.write(this.key, { ...data, v: this.version, savedAt: Date.now() });
  }

  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* storage blocked */
    }
  }

  settings(defaults) {
    return { ...defaults, ...(Store.read(this.skey) || {}) };
  }

  saveSettings(s) {
    return Store.write(this.skey, s);
  }

  autosave(snapshot) {
    const go = () => {
      const d = snapshot();
      if (d) this.save(d);
    };
    document.addEventListener("visibilitychange", () => document.hidden && go());
    addEventListener("pagehide", go);
  }
}
