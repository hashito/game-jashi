// Which kit parts a game needs because of what its game.json asks for (tools/kit-sync.js adds them on a plain sync; game-core loads them with
// import() only when the manifest asks, so a game that does not use a feature neither ships nor loads it).
//   when(gameJson) -> bool;  modules: kit js/<m>.js (their static imports come along);  assets: [[kit dir, game dir]];  tools: kit tools/<t>
module.exports = [
  { id: 'monsters', when: (g) => !!(g.data && g.data.monsters), modules: ['monster-std', 'monster-escape'], assets: [['assets/monster', 'assets/monster']], tools: ['check-escape.mjs'] },
  { id: 'fx', when: (g) => !!g.fx, modules: ['fx', 'fx-std'] },
  { id: 'things', when: (g) => !!(g.things && g.data && g.data.things), modules: ['things', 'things-data'] },
  { id: 'terminals', when: (g) => !!(g.data && g.data.terminals), modules: ['terminal-screen', 'terminal-data'] },
  { id: 'fps-tools', when: (g) => !!(g.data && g.data.plan), tools: ['cdp.mjs', 'smoke.mjs', 'review-shots.mjs'] },   // the headless smoke and the screenshot review stay current in every 3D game (kit.json "ownTools" keeps a game's own copy)
  { id: 'flavor', when: (g) => !!(g.data && g.data.flavor), modules: ['flavor'] },
  { id: 'voice', when: (g) => !!g.voice, modules: ['voice-fx'] },
  { id: 'recipes', when: (g) => !!g.recipes, modules: ['recipes', 'recipes-data'], dynamic: (g) => [(g.recipes.props || g.recipes.openables) && 'props', (g.recipes.props || g.recipes.openables) && 'env-props', (g.recipes.props || g.recipes.openables) && 'prop-batch', g.recipes.openables && 'openables', g.recipes.buildings && 'building', g.recipes.buildings && 'prop-batch', g.recipes.textures && 'texture-library', g.recipes.ambience && 'ambience'].filter(Boolean) },
];
