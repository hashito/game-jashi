// Boot: everything is data (game.json + data/*.json). Game-specific code lives in js/ext/ (listed in game.json "ext").
import { loadGame } from './kit/game-core.js';

loadGame('game.json').catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:1em">${e.message}</pre>`);
});
