"use strict";

const SAVE_KEY = "dispatch-hero-save-v8";
const MAX_DISPATCH_HISTORY = 8;

const JOB_LABELS = {
  warrior: "戦士",
  priest: "神官",
  mage: "魔法使い",
};

const JOB_STATS = {
  warrior: { maxHp: 42, atk: 12, def: 5 },
  priest: { maxHp: 32, atk: 7, def: 3 },
  mage: { maxHp: 28, atk: 8, def: 2 },
};

const PARTY_TEMPLATES = {
  pt1: [
    { id: "pt1-allen", name: "アレン", job: "warrior" },
    { id: "pt1-mina", name: "ミナ", job: "priest" },
    { id: "pt1-gald", name: "ガルド", job: "mage" },
  ],
  pt2: [
    { id: "pt2-rina", name: "リナ", job: "warrior" },
    { id: "pt2-sena", name: "セナ", job: "priest" },
    { id: "pt2-otto", name: "オットー", job: "mage" },
  ],
};

const AREAS = {
  plain: {
    id: "plain",
    name: "始まりの草原",
    durationMs: 5000,
    difficulty: 1,
    monsters: ["slime", "goblin"],
    boss: "goblinChief",
    unlockAfter: null,
    flavor: ["朝露の草を踏み、隊列は街道の外へ出た。", "遠くで鐘が鳴り、草むらが小さく揺れた。"],
  },
  forest: {
    id: "forest",
    name: "月影の森",
    durationMs: 5000,
    difficulty: 2,
    monsters: ["wolf", "mossMage"],
    boss: "forestWarden",
    unlockAfter: "plain",
    flavor: ["枝葉が月を裂き、足音だけが森に残る。", "古い祠の前で、冷たい風が吹いた。"],
  },
  ruins: {
    id: "ruins",
    name: "忘れられた遺跡",
    durationMs: 5000,
    difficulty: 3,
    monsters: ["skeleton", "stoneGuard"],
    unlockAfter: "forest",
    boss: "ruinKnight",
    flavor: ["崩れた石畳に、誰かの足跡が続いている。", "壁画の目が、一行を見送った気がした。"],
  },
  volcano: {
    id: "volcano",
    name: "赤熱の火口",
    durationMs: 5000,
    difficulty: 4,
    monsters: ["emberImp", "lavaBeast"],
    unlockAfter: "ruins",
    boss: "flameTyrant",
    flavor: ["熱風がマントを鳴らし、灰が空を薄く覆う。", "溶岩の照り返しで、剣の縁が赤く光った。"],
  },
};

const AREA_ORDER = ["plain", "forest", "ruins", "volcano"];

const MONSTERS = {
  slime: { id: "slime", name: "スライム", hp: 18, atk: 5, xp: 8, gold: 7 },
  goblin: { id: "goblin", name: "小鬼", hp: 24, atk: 7, xp: 11, gold: 10 },
  goblinChief: { id: "goblinChief", name: "小鬼頭", hp: 46, atk: 10, xp: 28, gold: 34, rare: true, boss: true },
  wolf: { id: "wolf", name: "森狼", hp: 30, atk: 9, xp: 15, gold: 13 },
  mossMage: { id: "mossMage", name: "苔の術師", hp: 26, atk: 11, xp: 18, gold: 16, rare: true },
  forestWarden: { id: "forestWarden", name: "森の番獣", hp: 62, atk: 14, xp: 46, gold: 52, rare: true, boss: true },
  skeleton: { id: "skeleton", name: "骸骨兵", hp: 38, atk: 12, xp: 24, gold: 20 },
  stoneGuard: { id: "stoneGuard", name: "石の番兵", hp: 48, atk: 13, xp: 30, gold: 26 },
  emberImp: { id: "emberImp", name: "火の小魔", hp: 44, atk: 15, xp: 34, gold: 32 },
  lavaBeast: { id: "lavaBeast", name: "溶岩獣", hp: 58, atk: 17, xp: 44, gold: 40 },
  ruinKnight: { id: "ruinKnight", name: "遺跡の黒騎士", hp: 86, atk: 18, xp: 70, gold: 80, rare: true, boss: true },
  flameTyrant: { id: "flameTyrant", name: "火口の暴君", hp: 118, atk: 22, xp: 110, gold: 130, rare: true, boss: true },
};
