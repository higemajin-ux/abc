"use strict";

const SAVE_KEY = "dispatch-hero-save-v8";
const MAX_DISPATCH_HISTORY = 8;

const JOB_LABELS = {
  warrior: "戦士",
  priest: "神官",
  mage: "魔法使い",
  scout: "盗賊",
};

const JOB_SKILLS = {
  warrior: [
    { id: "guard", type: "active", name: "防御", description: "被ダメージを軽減する", effectLines: ["被ダメージ -50%"], noteLine: "※次の行動まで" },
    { id: "cover", type: "passive", name: "かばう", description: "大きなダメージから味方をかばう", effectLines: ["HP70%以下の味方への大ダメージを肩代わり"], noteLine: "※発動率は味方HPで変動" },
    { id: "provoke", type: "active", name: "挑発", description: "敵の狙いを引きつける", effectLines: ["狙われ率 +50%"], noteLine: "※2ターン", requiredLevel: 3 },
    { id: "ironWall", type: "passive", name: "鉄壁", description: "大きく被ダメージを軽減する", effectLines: ["被ダメージ -75%"], noteLine: "※次の行動まで", requiredLevel: 5 },
    { id: "desperateStrike", type: "active", name: "捨て身", description: "危険を承知で強く攻撃する", effectLines: ["与ダメージ 1.8倍", "被ダメージ 1.5倍"], noteLine: "※発動率30%", requiredLevel: 8 },
    { id: "counter", type: "passive", name: "反撃", description: "攻撃を受けた時、反撃することがある", effectLines: ["被弾時60%で反撃", "反撃ダメージ 0.5〜0.8倍"], requiredLevel: 10 },
  ],
  priest: [
    { id: "heal", type: "active", name: "ヒール", description: "傷ついた味方を回復する", effectLines: ["HP45%未満の味方を回復"] },
    { id: "middleHeal", type: "active", name: "ミドルヒール", description: "大きく傷ついた味方を回復する", effectLines: ["HP30%以下の味方を大回復"], requiredLevel: 5 },
    { id: "healRain", type: "active", name: "ヒールレイン", description: "味方全員を少し回復する", effectLines: ["味方全体を少回復"], noteLine: "※2人以上が負傷時", requiredLevel: 8 },
    { id: "prayer", type: "active", name: "状態回復", description: "味方の悪い状態を治療する", effectLines: ["毒・呪い・麻痺・火傷・スロー・盲目を回復"], requiredLevel: 6 },
    { id: "magicBarrier", type: "active", name: "魔力障壁", description: "味方への被ダメージを軽減する", effectLines: ["被ダメージ -50%"], noteLine: "※1回のみ", requiredLevel: 7 },
    { id: "divineGrace", type: "passive", name: "神の加護", description: "倒れそうな時に踏みとどまる", effectLines: ["戦闘不能を1回防ぐ"], noteLine: "※1戦闘1回", requiredLevel: 10 },
    { id: "resurrect", type: "active", name: "リザレクト", description: "倒れた味方を蘇生する。派遣中一度だけ使える", effectLines: ["戦闘不能を100%で蘇生", "復活時HP35%"], noteLine: "※派遣中1回", requiredLevel: 12 },
    { id: "resura", type: "active", name: "リザラ", description: "倒れた味方を復活させることがある", effectLines: ["戦闘不能を50%で蘇生", "復活時HP25%"], requiredLevel: 9 },
  ],
  mage: [
    { id: "firebolt", type: "active", name: "火球", description: "炎で敵を攻撃し、火傷にすることがある", effectLines: ["火傷率30%", "火傷ダメージ 最大HP6%"], noteLine: "※2ターン" },
    { id: "lightning", type: "active", name: "雷撃", description: "雷で敵を攻撃し、麻痺にすることがある", effect: "paralyze", effectChance: 0.25, effectTurns: 2, effectLines: ["麻痺率25%", "集中時ダメージ 1.8倍"], noteLine: "※麻痺2ターン", requiredLevel: 5 },
    { id: "iceLance", type: "active", name: "氷槍", description: "氷で敵を攻撃し、スローにすることがある", effectLines: ["スロー率30%", "集中時ダメージ 1.8倍"], noteLine: "※スロー2ターン", requiredLevel: 7 },
    { id: "acidMist", type: "active", name: "アシッドミスト", description: "酸の霧で敵を攻撃し、毒や猛毒にすることがある", effectLines: ["発動率35%", "毒または猛毒を付与"], noteLine: "※毒3ターン", requiredLevel: 9 },
    { id: "magicFocus", type: "active", name: "魔力集中", description: "魔力を高めて威力を上げる", effectLines: ["次の魔法ダメージ 1.5倍"], noteLine: "※発動率30%", requiredLevel: 4 },
    { id: "magicSense", type: "passive", name: "魔力探知", description: "魔力の流れを読み取り、危険や異変を察知することがある", effectLines: ["レア敵を発見", "危険や異変を察知"], noteLine: "※発見率10%", requiredLevel: 6 },
  ],
  scout: [
    { id: "ambush", type: "passive", name: "奇襲", description: "敵より先に動き、不意打ちを仕掛けることがある", effectLines: ["先制行動"], noteLine: "※発見率100%" },
    { id: "rogueFocus", type: "active", name: "集中", description: "攻撃の会心率を高める", effectLines: ["会心率 +25%"], noteLine: "※2ターン", requiredLevel: 4 },
    { id: "blind", type: "active", name: "目つぶし", description: "敵の攻撃を外れやすくする", effectLines: ["盲目率40%"], noteLine: "※2ターン", requiredLevel: 5 },
    { id: "firstAid", type: "active", name: "応急手当", description: "味方にバリアを付与し、ダメージを防ぐ", effectLines: ["HP30%未満の味方にバリア付与"], noteLine: "※発動率55%", requiredLevel: 6 },
    { id: "treasureFind", type: "passive", name: "宝箱発見", description: "探索中に宝箱を見つけることがある", effectLines: ["追加宝箱を発見"], noteLine: "※発見率20%", requiredLevel: 4 },
    { id: "trapDisarm", type: "passive", name: "罠解除", description: "探索中に罠を解除することがある", effectLines: ["罠解除率 +25%"], noteLine: "※盗賊1人分のみ有効", requiredLevel: 6 },
    { id: "shortcutFind", type: "passive", name: "近道発見", description: "探索中に近道を見つけることがある", effectLines: ["冒険時間 -10%"], noteLine: "※重複不可", requiredLevel: 8 },
  ],
};

const SKILL_DEBUG_INFO = {
  guard: ["発動:HP30%以下 45%", "発動:HP50%以下 25%", "軽減:50%"],
  cover: ["条件:対象HP70%以下", "条件:予測8以上/最大HP25%以上", "発動:HP25%以下 100%", "発動:HP40%以下 70%", "発動:HP70%以下 50%"],
  provoke: ["発動:50%", "条件:味方HP50%以下", "条件:後衛HP70%以下", "持続:2ターン"],
  ironWall: ["条件:HP50%以下/敵2体以上", "軽減:75%"],
  desperateStrike: ["発動:30%", "威力:1.8倍", "被ダメ:1.5倍"],
  counter: ["発動:40%"],

  heal: ["条件:HP45%未満"],
  middleHeal: ["条件:HP30%以下"],
  healRain: ["条件:HP75%以下が2人以上"],
  prayer: ["対象:毒", "対象:猛毒", "対象:呪い", "対象:火傷", "対象:スロー", "対象:麻痺", "対象:盲目"],
  magicBarrier: ["条件:HP65%以下", "軽減:50%"],
  divineGrace: ["条件:神官本人の致死ダメージ", "復帰HP:1", "制限:パーティ1回"],
  resurrect: ["成功:100%", "復活HP:35%", "制限:派遣中1回"],
  resura: ["成功:50%", "復活HP:25%"],

  firebolt: ["火傷:30%", "火傷ダメ:最大HP6%", "火傷:2ターン"],
  lightning: ["威力:攻撃1.8倍参照", "麻痺:25%（ガルド）", "麻痺行動不能:50%", "麻痺:2ターン"],
  iceLance: ["威力:攻撃0.8倍参照", "スロー:30%", "DEX:50%", "スロー:2ターン"],
  acidMist: ["発動:35%", "威力:攻撃0.5倍参照", "毒:100%", "毒ダメ:最大HP5%", "猛毒ダメ:最大HP10%", "毒:3ターン"],
  magicFocus: ["魔法集中:30%", "魔法威力:1.5倍"],
  magicSense: ["発動率:10%", "条件:魔法使いが生存", "条件:ボス以外", "条件:エリアにモンスター候補あり"],

  ambush: ["発動率:100%", "条件:ローグが生存", "条件:奇襲が有効", "効果:先制攻撃"],
  rogueFocus: ["発動:35%", "持続:2ターン", "会心率:+25%"],
  firstAid: ["発動率:55%", "条件:味方HP30%未満", "効果:バリア付与"],
  blind: ["発動:40%", "盲目ミス:40%", "盲目:2ターン"],
  treasureFind: ["発動率:20%"],
  trapDisarm: ["罠発生:20%", "DEX補正:DEX×3%（上限70%）", "盗賊補正:+25%", "最終上限:90%", "罠ダメージ:最大HP10%"],
  shortcutFind: ["発動率:100%"],
};

const JOB_STATS = {
  warrior: { maxHp: 44, atk: 11, def: 6, dex: 5, luc: 4 },
  priest: { maxHp: 34, atk: 7, def: 4, dex: 7, luc: 9 },
  mage: { maxHp: 28, atk: 12, def: 2, dex: 7, luc: 6 },
  scout: { maxHp: 30, atk: 9, def: 2, dex: 11, luc: 9 },
};

const OPTION_MASTER = {
  attackUp: {
    id: "attackUp",
    name: "攻撃",
    maxLevel: 10,
  },
  attackPercent: {
    id: "attackPercent",
    name: "攻撃%",
    maxLevel: 10,
  },
  hpUp: {
    id: "hpUp",
    name: "HP",
    maxLevel: 10,
  },
  blindStrike: {
    id: "blindStrike",
    name: "盲目",
  },
  poisonStrike: {
    id: "poisonStrike",
    name: "毒",
  },
};

// Optional equipment fields:
// options: []
// fixedOptions: [] // unused reserved field
// optionCandidates: []
OPTION_MASTER.criticalRate = {
  id: "criticalRate",
  name: "クリ率",
  maxLevel: 10,
};

OPTION_MASTER.hpPercent = {
  id: "hpPercent",
  name: "HP%",
  maxLevel: 10,
};

OPTION_MASTER.defenseUp = {
  id: "defenseUp",
  name: "DEF",
  maxLevel: 10,
};

OPTION_MASTER.defensePercent = {
  id: "defensePercent",
  name: "DEF%",
  maxLevel: 10,
  format(level) {
    return `${1 + Math.max(0, Number(level) || 0) * 2}%`;
  },
};

OPTION_MASTER.criticalDamage = {
  id: "criticalDamage",
  name: "クリダメ",
  maxLevel: 10,
};

const EQUIPMENT_ITEMS = {
  oldSword: { id: "oldSword", name: "古びた剣", slot: "weapon", atk: 2 },
  tinStaff: { id: "tinStaff", name: "錫杖", slot: "weapon", atk: 1, luc: 1 },
  dagger: { id: "dagger", name: "短剣", slot: "weapon", atk: 1, dex: 1 },
  scorchedStaff: { id: "scorchedStaff", name: "焦げた杖", slot: "weapon", atk: 2 },
  kinglessSword: { id: "kinglessSword", name: "王なき剣", slot: "weapon", rarity: "artifact", atk: 1, sellGold: 300 },
  leatherArmor: { id: "leatherArmor", name: "革鎧", slot: "armor", def: 1, maxHp: 2 },
  monkRobe: { id: "monkRobe", name: "修道服", slot: "armor", def: 1, luc: 1 },
  lightLeatherArmor: { id: "lightLeatherArmor", name: "軽革鎧", slot: "armor", def: 1, dex: 1 },
  travelWear: { id: "travelWear", name: "旅装束", slot: "armor", def: 1 },
};

const EQUIPMENT_SLOTS = [
  { key: "weapon", label: "武器", kind: "weapon" },
  { key: "armor", label: "防具", kind: "armor" },
  { key: "accessory1", label: "装飾1", kind: "accessory" },
  { key: "accessory2", label: "装飾2", kind: "accessory" },
  { key: "relic", label: "遺物", kind: "relic" },
];

const DEFAULT_EQUIPMENT_BY_MEMBER = {
  "pt1-allen": { weapon: "oldSword", armor: "leatherArmor", accessory1: null, accessory2: null, relic: null },
  "pt1-mina": { weapon: "tinStaff", armor: "monkRobe", accessory1: null, accessory2: null, relic: null },
  "pt1-nil": { weapon: "dagger", armor: "lightLeatherArmor", accessory1: null, accessory2: null, relic: null },
  "pt1-gald": { weapon: "scorchedStaff", armor: "travelWear", accessory1: null, accessory2: null, relic: null },
};

const DEFAULT_EQUIPMENT_BY_JOB = {
  warrior: { weapon: "oldSword", armor: "leatherArmor", accessory1: null, accessory2: null, relic: null },
  priest: { weapon: "tinStaff", armor: "monkRobe", accessory1: null, accessory2: null, relic: null },
  mage: { weapon: "scorchedStaff", armor: "travelWear", accessory1: null, accessory2: null, relic: null },
  scout: { weapon: "dagger", armor: "lightLeatherArmor", accessory1: null, accessory2: null, relic: null },
};

const DROP_RATES = {
  normal: 0.6,
  rare: 0.85,
  boss: 1,
};

const DROP_RARITY_WEIGHTS = {
  normal: { common: 60, uncommon: 30, rare: 9, epic: 0.9, legendary: 0.1, artifact: 0.01 },
  rare: { common: 35, uncommon: 40, rare: 20, epic: 4, legendary: 1, artifact: 0.1 },
  boss: { common: 0, uncommon: 50, rare: 35, epic: 13, legendary: 2, artifact: 0.25 },
};

// Optional equipment fields:
// options: []
// fixedOptions: [] // unused reserved field
// optionCandidates: []
const EQUIPMENT_DROPS = [
  {
    id: "chippedSword",
    name: "欠けた剣",
    slot: "weapon",
    rarity: "common",
    atk: 1,
    sellGold: 10,
    // Example future option payload:
    // chippedSword+3 -> 攻撃Lv4 / 盲目Lv2
  },
  { id: "oldCharm", name: "古い護符", slot: "accessory", rarity: "uncommon", luc: 1, sellGold: 12 },
  { id: "travelerHat", name: "旅人の帽子", slot: "accessory", rarity: "rare", luc: 1, sellGold: 10, setId: "traveler", dropAreas: ["plain"], dropEnemies: ["slime", "goblin"] },
  { id: "travelerCloak", name: "旅人の外套", slot: "armor", rarity: "rare", def: 1, luc: 1, sellGold: 12, setId: "traveler", dropAreas: ["forest"], dropEnemies: ["wolf", "mossMage"] },
  { id: "travelerShoes", name: "旅人の靴", slot: "accessory", rarity: "rare", dex: 1, luc: 1, sellGold: 11, setId: "traveler", dropAreas: ["forest"], dropEnemies: ["wolf", "mossMage"] },
  { id: "crackedRing", name: "ひび割れた指輪", slot: "accessory", rarity: "uncommon", dex: 1, sellGold: 9 },
  { id: "silverBuckle", name: "銀留めの帯具", slot: "accessory", rarity: "rare", def: 1, luc: 1, sellGold: 28 },
  { id: "emberPendant", name: "燠火の首飾り", slot: "accessory", rarity: "epic", atk: 2, luc: 1, sellGold: 70, flavor: "火は消えている。それでも、胸元だけが夜に温かい。" },
  { id: "saintFragment", name: "聖片の護符", slot: "accessory", rarity: "legendary", maxHp: 4, luc: 2, sellGold: 180, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"], flavor: "聖者の名は欠けて読めない。祈りの跡だけが指に残る。" },
  { id: "ashGrimoire", name: "灰の魔導書", slot: "accessory", rarity: "artifact", sellGold: 260, flavor: "焼け落ちた塔の地下で見つかった。頁の灰は、今も指に残る。" },
  { id: "namelessSignet", name: "名も無き聖印", slot: "accessory", rarity: "artifact", sellGold: 280, flavor: "祈りの名は削られている。それでも、誰かはこれを握っていた。" },
  { id: "blackKingRing", name: "黒王の指輪", slot: "accessory", rarity: "artifact", sellGold: 320, flavor: "王が消えた後も、指輪だけは玉座に残っていた。" },
{ id: "rustyAxe", name: "錆びた斧", slot: "weapon", rarity: "common", atk: 2, dex: -1, sellGold: 11 },

{ id: "mercenarySword", name: "傭兵の剣", slot: "weapon", rarity: "uncommon", atk: 4, dex: 1, sellGold: 24 },

{ id: "smolderingDagger", name: "燻る短剣", slot: "weapon", rarity: "uncommon", atk: 3, luc: 1, sellGold: 25, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"] },

{ id: "blackIronSword", name: "黒鉄の剣", slot: "weapon", rarity: "rare", atk: 6, def: 1, sellGold: 55 },

{ id: "ashCoveredStaff", name: "灰かぶりの杖", slot: "weapon", rarity: "rare", atk: 5, luc: 2, sellGold: 60 },

{ id: "emberRemnantBlade", name: "名残火の刃", slot: "weapon", rarity: "epic", atk: 8, maxHp: -3, sellGold: 120, flavor: "刃の奥に、まだ赤いものが眠っている。長く握ると脈が乱れる。" },

{ id: "gravekeeperGreatsword", name: "墓守の大剣", slot: "weapon", rarity: "legendary", atk: 10, def: 2, dex: -1, sellGold: 220, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"], flavor: "墓標の列より重い。抜くたび、土の匂いが濃くなる。" },

{ id: "patchedCloak", name: "継ぎ布の外套", slot: "armor", rarity: "common", def: 1, maxHp: 2, sellGold: 10 },

{ id: "blackLeatherArmor", name: "黒革の軽鎧", slot: "armor", rarity: "uncommon", def: 3, dex: 1, sellGold: 30 },

{ id: "oldBreastplate", name: "古い胸当て", slot: "armor", rarity: "rare", def: 5, maxHp: 4, dex: -1, sellGold: 65 },

{ id: "sootRobe", name: "煤けた法衣", slot: "armor", rarity: "rare", def: 3, luc: 3, sellGold: 60, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"] },

{ id: "fallenKingMail", name: "亡国の鎖帷子", slot: "armor", rarity: "epic", def: 7, maxHp: 6, sellGold: 130, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"], flavor: "内側に古い血の輪が残る。旗印は、誰も覚えていない。" },

{ id: "ashKingCloak", name: "灰王の外套", slot: "armor", rarity: "legendary", def: 6, maxHp: 10, luc: 2, sellGold: 240, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"], flavor: "灰は払っても戻ってくる。肩に掛けると、遠い戴冠の声がする。" },

{ id: "dryHolyMark", name: "乾いた聖印", slot: "accessory", rarity: "common", luc: 1, sellGold: 10, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"] },

{ id: "rustedEarring", name: "赤錆の耳飾り", slot: "accessory", rarity: "uncommon", dex: 1, luc: 1, sellGold: 20, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"] },

{ id: "pilgrimShoes", name: "巡礼者の靴", slot: "accessory", rarity: "uncommon", dex: 2, sellGold: 24, dropAreas: ["swamp"], dropEnemies: ["mudSlime", "bogLeech", "marshMaw"] },

{ id: "thiefGloves", name: "盗賊の手袋", slot: "accessory", rarity: "rare", dex: 3, luc: 1, sellGold: 60 },
  { id: "blackPage", name: "黒い頁", slot: "relic", rarity: "epic", luc: 2, sellGold: 140, flavor: "文字は光を吸って読めない。閉じても、頁をめくる音がする。" },
  { id: "brokenStarMap", name: "割れた星図", slot: "relic", rarity: "legendary", dex: 2, luc: 3, sellGold: 240, flavor: "星の半分が失われている。残った星だけが、地下を指している。" },
  { id: "namelessTablet", name: "名前の消えた記録板", slot: "relic", rarity: "artifact", luc: 5, maxHp: 5, sellGold: 500, flavor: "名は削られたのではない。石そのものが、名を拒んでいる。" },
];

const PARTY_TEMPLATES = {
  pt1: [
    { id: "pt1-allen", name: "アレン", job: "warrior", formation: "前衛" },
    { id: "pt1-mina", name: "ミナ", job: "priest", formation: "中衛" },
    { id: "pt1-nil", name: "ニル", job: "scout", formation: "中衛" },
    { id: "pt1-gald", name: "ガルド", job: "mage", formation: "後衛" },
  ],
  pt2: [
    { id: "pt2-rina", name: "リナ", job: "warrior", formation: "前衛" },
    { id: "pt2-sena", name: "セナ", job: "priest", formation: "中衛" },
    { id: "pt2-kai", name: "カイ", job: "scout", formation: "中衛" },
    { id: "pt2-otto", name: "オットー", job: "mage", formation: "後衛" },
  ],
};

const MEMBER_BATTLE_LINES = {
  アレン: {
    wounded: "まだいける……！",
    critical: "くっ、足が……",
    down: "すまない、ここまでだ……",
  },
  ミナ: {
    wounded: "少し、傷が深いです",
    critical: "回復が……間に合わない……",
    down: "ごめんなさい、動けません……",
  },
  ガルド: {
    wounded: "面白くなってきたな",
    critical: "ちっ、油断したか",
    down: "……後は任せた",
  },
  リナ: {
    wounded: "まだ押し返せる！",
    critical: "まずい、踏ん張りが……",
    down: "ごめん、後を頼む……",
  },
  セナ: {
    wounded: "傷が深いです、でも……",
    critical: "祈りが、追いつかない……",
    down: "すみません、動けません……",
  },
  オットー: {
    wounded: "この程度なら計算内だ",
    critical: "くっ、読み違えたか……",
    down: "ここから先は任せた……",
  },
  ニル: {
    wounded: "まだ影は踏ませない",
    critical: "息が、乱れてきた……",
    down: "ここまで、みたいだ……",
  },
  カイ: {
    wounded: "まだ逃げ道はある",
    critical: "足が重い……まずいな",
    down: "悪い、先に落ちる……",
  },
};

const JOB_BATTLE_LINES = {
  warrior: {
    wounded: "まだ倒れるわけにはいかない……！",
    critical: "くっ、体が重い……",
    down: "ここまでだ……後を頼む……",
  },
  priest: {
    wounded: "傷が深くなってきました",
    critical: "回復が追いつきません……",
    down: "ごめんなさい、動けません……",
  },
  mage: {
    wounded: "少し、集中が乱れたな",
    critical: "まずい、魔力が散る……",
    down: "……後は任せた",
  },
  scout: {
    wounded: "まだ動ける、問題ない",
    critical: "足を取られた……！",
    down: "悪い、ここまでだ……",
  },
};

const MEMBER_BOSS_LINES = {
  アレン: {
    normal: ["嫌な予感がする", "ここから先は普通じゃない"],
    critical: ["くっ……嫌な予感しかしない", "この傷で、どこまで踏み込めるか……"],
  },
  ミナ: {
    normal: ["少し胸騒ぎがします", "空気が違います"],
    critical: ["怖いです……でも、退けません", "祈りが、届くでしょうか……"],
  },
  ガルド: {
    normal: ["敵も本気らしいな", "構えろ"],
    critical: ["ちっ、この傷で大物か", "面白いが……長引かせるなよ"],
  },
  リナ: {
    normal: ["来るよ、全員構えて", "ここが山場みたいだね"],
    critical: ["まずいね……でも引けない", "このまま押し切るしかない"],
  },
  セナ: {
    normal: ["静かすぎます……", "嫌な気配が近づいています"],
    critical: ["息を整えて……まだ支えます", "どうか、間に合って……"],
  },
  オットー: {
    normal: ["来るぞ。構えろ", "この沈黙、嫌な手合いだ"],
    critical: ["読み違える余裕はないな", "この状況で大物とは……"],
  },
  ニル: {
    normal: ["足音が消えた……来る", "影の向きが変わった"],
    critical: ["まずい、逃げ足が鈍ってる", "この気配、近すぎる……"],
  },
  カイ: {
    normal: ["道が塞がれた。来るぞ", "空気が止まったな"],
    critical: ["足が重い……でも見えてる", "退路は細い。急ごう"],
  },
};

const JOB_BOSS_LINES = {
  warrior: {
    normal: ["嫌な気配だ。前に出る", "ここからが本番だ"],
    critical: ["傷は深いが、まだ立てる", "倒れる前に道を開く"],
  },
  priest: {
    normal: ["皆さん、気をつけてください", "空気が変わりました"],
    critical: ["祈りを切らさないようにします", "まだ、支えられます……"],
  },
  mage: {
    normal: ["魔力の流れが乱れている", "大きいのが来るぞ"],
    critical: ["集中を切らせば終わりだな", "残る魔力で押し切る"],
  },
  scout: {
    normal: ["気配が近い。伏せるなよ", "退路を見ておく"],
    critical: ["足は重いが、目は利く", "来るなら今だ……"],
  },
};

const MEMBER_RETURN_LINES = {
  アレン: {
    normal: ["生きて戻れたな", "まずは報告に向かおう"],
    wounded: ["手当てが先だな……", "みんな、よく戻った"],
  },
  ミナ: {
    normal: ["負傷者の手当てを急ぎます", "皆さん、無事でよかったです"],
    wounded: ["すぐに治療します……", "少し休んでから報告しましょう"],
  },
  ガルド: {
    normal: ["悪くない戦果だ", "次はもっと派手にいくか"],
    wounded: ["さすがに骨が折れたな", "……酒より先に包帯だな"],
  },
  リナ: {
    normal: ["帰ってこられたね", "報告、済ませちゃおう"],
    wounded: ["ちょっと休ませて……", "みんな、無理しすぎ"],
  },
  セナ: {
    normal: ["手当ての準備をします", "無事な方から報告をお願いします"],
    wounded: ["まだ治療が必要です", "傷口を見せてください"],
  },
  オットー: {
    normal: ["記録する価値はあったな", "次の準備に移ろう"],
    wounded: ["想定より消耗したな", "まずは態勢を立て直す"],
  },
  ニル: {
    normal: ["足跡は消してきた", "戻る道は覚えたよ"],
    wounded: ["少し、息を整える", "次はもっとうまく抜ける"],
  },
  カイ: {
    normal: ["帰路は確保済みだ", "全員戻った。それで十分"],
    wounded: ["足が重いな……", "先に水をもらうよ"],
  },
};

const JOB_RETURN_LINES = {
  warrior: {
    normal: ["生きて戻れた。それで十分だ", "報告に向かおう"],
    wounded: ["少し手当てがいるな", "まだ立てる。先に報告だ"],
  },
  priest: {
    normal: ["負傷者を確認します", "皆さん、手当てを受けてください"],
    wounded: ["治療を急ぎます……", "少し休ませてください"],
  },
  mage: {
    normal: ["記録を整理しておこう", "魔力の乱れも収まったな"],
    wounded: ["消耗が大きいな……", "少し集中を戻す時間がいる"],
  },
  scout: {
    normal: ["帰り道は問題ない", "周囲に追跡はない"],
    wounded: ["足を休めたいところだ", "次はもっと静かに戻る"],
  },
};

const AREAS = {
  plain: {
    id: "plain",
    name: "始まりの草原",
    durationMs: 5000,
    difficulty: 1,
    baseAtk: 4,
    monsters: ["slime", "goblin"],
    normalEncounterGroupWeights: { 1: 70, 2: 25, 3: 5 },
    boss: "goblinChief",
    unlockAfter: null,
    treasureRates: [0.7, 0.5, 0.25, 0.12],
    trapRates: [0.25, 0.15, 0.1, 0.05],
    flavor: ["朝露の草を踏み、隊列は街道の外へ出た。", "遠くで鐘が鳴り、草むらが小さく揺れた。"],
  },
  plainEntrance: {
    id: "plainEntrance",
    name: "平原入口",
    durationMs: 5000,
    difficulty: 1,
    baseAtk: 4,
    monsters: ["slime", "goblin"],
    normalEncounterGroupWeights: { 1: 80, 2: 20 },
    unlockAfter: null,
    treasureRates: [0.7, 0.5, 0.25, 0.12],
    trapRates: [0.2, 0.1, 0.05, 0.02],
    flavor: ["街道を離れてまもなく、草丈の低い平原が広がる。", "朝の風に揺れる草の先で、小さな影が跳ねた。"],
  },
  plainRoad: {
    id: "plainRoad",
    name: "平原道中",
    durationMs: 5000,
    difficulty: 1,
    baseAtk: 4,
    monsters: ["slime", "goblin", "goblinArcher"],
    normalEncounterGroupWeights: { 1: 70, 2: 25, 3: 5 },
    unlockAfter: "plainEntrance",
    treasureRates: [0.7, 0.5, 0.25, 0.12],
    trapRates: [0.25, 0.15, 0.1, 0.05],
    flavor: ["踏み固められた獣道の脇に、荒らされた荷車の跡が残る。", "草むらの奥で、短い怒鳴り声が風に混じった。"],
  },
  goblinNest: {
    id: "goblinNest",
    name: "ゴブリンの巣",
    durationMs: 5000,
    difficulty: 1,
    baseAtk: 5,
    monsters: ["goblin", "axeGoblin", "goblinArcher", "goblinMage"],
    normalEncounterGroupWeights: { 1: 75, 2: 20, 3: 5 },
    boss: "goblinChief",
    unlockAfter: "plainRoad",
    treasureRates: [0.7, 0.5, 0.25, 0.12],
    trapRates: [0.25, 0.15, 0.1, 0.05],
    flavor: ["粗末な見張り台と焚き火跡が、草原の奥に固まっている。", "掘り返された土の匂いの中に、群れの生活臭が混じっていた。"],
  },
  forest: {
    id: "forest",
    name: "月影の森",
    durationMs: 5000,
    difficulty: 2,
    baseAtk: 7,
    monsters: ["wolf", "mossMage"],
    normalEncounterGroupWeights: { 1: 60, 2: 30, 3: 10 },
    boss: "forestWarden",
    unlockAfter: "goblinNest",
    flavor: ["枝葉が月を裂き、足音だけが森に残る。", "古い祠の前で、冷たい風が吹いた。"],
  },
  howlingRoad: {
    id: "howlingRoad",
    name: "遠吠えの道",
    durationMs: 5000,
    difficulty: 2,
    baseAtk: 7,
    monsters: ["wolf"],
    normalEncounterGroupWeights: { 1: 75, 2: 20, 3: 5 },
    unlockAfter: "goblinNest",
    flavor: ["街道脇の木立から、途切れ途切れの遠吠えが聞こえる。", "踏み荒らされた下草の先で、獣道が闇へ続いていた。"],
  },
  mossTrail: {
    id: "mossTrail",
    name: "苔むす獣道",
    durationMs: 5000,
    difficulty: 2,
    baseAtk: 7,
    monsters: ["wolf", "mossMage"],
    normalEncounterGroupWeights: { 1: 60, 2: 30, 3: 10 },
    unlockAfter: "howlingRoad",
    flavor: ["湿った苔が石を覆い、足跡は途中で途切れている。", "木々の隙間で、誰かに見られているような気配が続いた。"],
  },
  beastTerritory: {
    id: "beastTerritory",
    name: "巨獣の縄張り",
    durationMs: 5000,
    difficulty: 2,
    baseAtk: 8,
    monsters: ["mossMage"],
    normalEncounterGroupWeights: { 1: 80, 2: 20 },
    boss: "forestWarden",
    unlockAfter: "mossTrail",
    flavor: ["折れた幹と抉れた地面が、この先の主を黙って示している。", "森の空気が重くなり、奥で大きな息遣いが揺れた。"],
  },
  swamp: {
    id: "swamp",
    name: "沈み杭の沼",
    durationMs: 5000,
    difficulty: 3,
    baseAtk: 11,
    monsters: ["mudSlime", "bogLeech"],
    normalEncounterGroupWeights: { 1: 55, 2: 30, 3: 15 },
    boss: "marshMaw",
    unlockAfter: "beastTerritory",
    flavor: ["腐った桟橋が水面に沈みかけ、隊列は一歩ずつ進んだ。", "泥の泡が弾けるたび、古い杭が小さく揺れた。"],
  },
  ruins: {
    id: "ruins",
    name: "忘れられた遺跡",
    durationMs: 5000,
    difficulty: 4,
    baseAtk: 14,
    monsters: ["skeleton", "stoneGuard"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    unlockAfter: "swamp",
    boss: "ruinKnight",
    trapRates: [0.75, 0.5, 0.25, 0.12],
    flavor: ["崩れた石畳に、誰かの足跡が続いている。", "壁画の目が、一行を見送った気がした。"],
  },
  canyon: {
    id: "canyon",
    name: "赤鳴りの峡谷",
    durationMs: 5000,
    difficulty: 5,
    baseAtk: 18,
    monsters: ["rockHawk", "canyonBandit"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "redGorgeWing",
    unlockAfter: "ruins",
    flavor: ["吊り橋の下で風が鳴り、谷底は赤い霧に隠れている。", "岩棚に刻まれた古い矢印が、崖の奥を示していた。"],
  },
  glacier: {
    id: "glacier",
    name: "白冠の氷原",
    durationMs: 5000,
    difficulty: 6,
    baseAtk: 22,
    monsters: ["iceWolf", "frostWisp"],
    normalEncounterGroupWeights: { 1: 35, 2: 45, 3: 20 },
    boss: "whiteFangGiant",
    unlockAfter: "canyon",
    flavor: ["雪面は硬く、足音が鋭く跳ね返る。", "吹雪の切れ間に、黒い山影が息をするように揺れた。"],
  },
  volcano: {
    id: "volcano",
    name: "赤熱の火口",
    durationMs: 5000,
    difficulty: 7,
    baseAtk: 27,
    monsters: ["emberImp", "lavaBeast"],
    normalEncounterGroupWeights: { 1: 35, 2: 45, 3: 20 },
    unlockAfter: "glacier",
    boss: "flameTyrant",
    flavor: ["熱風がマントを鳴らし、灰が空を薄く覆う。", "溶岩の照り返しで、剣の縁が赤く光った。"],
  },
  abyss: {
    id: "abyss",
    name: "深淵",
    durationMs: 5000,
    difficulty: 8,
    baseAtk: 33,
    monsters: ["abyssCrawler", "namelessShade"],
    normalEncounterGroupWeights: { 1: 35, 2: 45, 3: 20 },
    boss: "abyssEnvoy",
    unlockAfter: "volcano",
    treasureRates: [0.3, 0.2, 0.1, 0.05],
    trapRates: [0.8, 0.55, 0.3, 0.15],
    flavor: ["道は下へ続くはずなのに、影だけが天井へ伸びていく。", "壊れた標識に、まだ出発していない隊の名が刻まれていた。"],
  },
  forgottenCorridor: {
    id: "forgottenCorridor",
    name: "忘却の回廊",
    durationMs: 5000,
    difficulty: 9,
    baseAtk: 40,
    monsters: ["chalkGuard", "lostRecord"],
    normalEncounterGroupWeights: { 1: 45, 2: 35, 3: 20 },
    boss: "ledgerKeeper",
    unlockAfter: "abyss",
    trapRates: [0.75, 0.5, 0.25, 0.12],
    flavor: ["同じ扉が何度も現れ、壁の番号だけが増えていく。", "記録用の札が、誰の名も残さず白く擦り切れていた。"],
  },
  starMarsh: {
    id: "starMarsh",
    name: "星喰いの湿原",
    durationMs: 5000,
    difficulty: 10,
    baseAtk: 48,
    monsters: ["starMud", "lampToad"],
    normalEncounterGroupWeights: { 1: 45, 2: 35, 3: 20 },
    boss: "starMarshLord",
    unlockAfter: "forgottenCorridor",
    flavor: ["曇天の下、湿原の水面だけが夜空のように光っている。", "水草の奥で小さな星明かりが沈み、泥が静かに膨らんだ。"],
  },
  mourningSpire: {
    id: "mourningSpire",
    name: "嘆きの尖塔",
    durationMs: 5000,
    difficulty: 11,
    baseAtk: 57,
    monsters: ["bellShade", "towerGargoyle"],
    normalEncounterGroupWeights: { 1: 45, 2: 35, 3: 20 },
    boss: "mourningBellMaster",
    unlockAfter: "starMarsh",
    flavor: ["螺旋階段は細く、下から冷たい風が吹き上がる。", "上階から、誰かが未提出の報告書を読む声が落ちてきた。"],
  },
  borderGate: {
    id: "borderGate",
    name: "境界の門",
    durationMs: 5000,
    difficulty: 12,
    baseAtk: 67,
    monsters: ["borderHound", "permitWraith"],
    normalEncounterGroupWeights: { 1: 45, 2: 35, 3: 20 },
    boss: "gateArbiter",
    unlockAfter: "mourningSpire",
    flavor: ["巨大な門柱の間で、道がこちら側と向こう側に分かれている。", "門の隙間から、地図にない街道の風が吹いた。"],
  },
  ashCapital: {
    id: "ashCapital",
    name: "灰冠の王都",
    durationMs: 5000,
    difficulty: 13,
    baseAtk: 78,
    monsters: ["ashGuard", "emptyThroneServant"],
    normalEncounterGroupWeights: { 1: 45, 2: 35, 3: 20 },
    boss: "ashCrownMarshal",
    unlockAfter: "borderGate",
    flavor: ["灰をかぶった大通りに、使われなくなった看板が並ぶ。", "無人の広場で王令が読み上げられ、灰が拍手のように舞った。"],
  },
  silentRim: {
    id: "silentRim",
    name: "静寂の外縁",
    durationMs: 5000,
    difficulty: 14,
    baseAtk: 90,
    monsters: ["silentScout", "voicelessMage"],
    normalEncounterGroupWeights: { 1: 45, 2: 35, 3: 20 },
    boss: "rimAuditor",
    unlockAfter: "ashCapital",
    flavor: ["靴音も息遣いも、少し遅れて背後に落ちる。", "世界の端を測る杭が、霧の中で等間隔に立っている。"],
  },
  lastCathedral: {
    id: "lastCathedral",
    name: "終末の大聖堂",
    durationMs: 5000,
    difficulty: 15,
    baseAtk: 104,
    monsters: ["finalAcolyte", "crackedSaint"],
    normalEncounterGroupWeights: { 1: 45, 2: 35, 3: 20 },
    boss: "lastBishop",
    unlockAfter: "silentRim",
    flavor: ["長い身廊に破れた旗が垂れ、床石には古い足跡が残る。", "祭壇の奥で、冒険者名簿を閉じる音がした。"],
  },
  mistRainRoad: {
    id: "mistRainRoad",
    name: "霧雨の街道",
    durationMs: 5000,
    difficulty: 16,
    baseAtk: 119,
    monsters: ["mistRoadStray", "wetCloakBandit", "rainMoth"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "milestoneWatcher",
    unlockAfter: "lastCathedral",
    flavor: ["霧が深い。", "濡れた轍は、街道の途中で途切れていた。", "嫌な静けさが続く。"],
  },
  abandonedWatchtower: {
    id: "abandonedWatchtower",
    name: "捨てられた監視塔",
    durationMs: 5000,
    difficulty: 17,
    baseAtk: 135,
    monsters: ["towerRat", "rustedLookout", "hollowSignalman", "shutterWraith"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "blindTowerKeeper",
    unlockAfter: "mistRainRoad",
    flavor: ["折れた見張り窓から、冷たい雨だけが入ってくる。", "誰もいないはずの上階で、床板がきしんだ。", "何かに見られている気がする。"],
  },
  witheredForestGate: {
    id: "witheredForestGate",
    name: "枯森の入口",
    durationMs: 5000,
    difficulty: 18,
    baseAtk: 152,
    monsters: ["dryBranchCrawler", "barklessWolf", "ashLeafImp", "rootBoundShade"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "witheredGateStag",
    unlockAfter: "abandonedWatchtower",
    flavor: ["葉のない枝が、風もないのに少しだけ揺れた。", "足跡は途中で消えていた。", "森の奥から、名を呼ばれた気がした。"],
  },
  blackwaterMarsh: {
    id: "blackwaterMarsh",
    name: "黒水湿地",
    durationMs: 5000,
    difficulty: 19,
    baseAtk: 171,
    monsters: ["blackwaterLeech", "sunkenLantern", "mudVeilCrawler", "bogMourner", "tarScaleNewt"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "blackwaterUndertow",
    unlockAfter: "witheredForestGate",
    flavor: ["水面は黒く、空だけを映さなかった。", "沈んだ杭のそばで、小さな泡が続いている。", "ぬかるみに残った足跡は、片道分しかなかった。"],
  },
  forgottenChapel: {
    id: "forgottenChapel",
    name: "忘れられた礼拝堂",
    durationMs: 5000,
    difficulty: 20,
    baseAtk: 192,
    monsters: ["dustAcolyte", "crackedBell", "pewCreeper", "stainedGlassMote", "silentConfessor"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "chapelWithoutSaint",
    unlockAfter: "blackwaterMarsh",
    flavor: ["祭壇布は湿り、古い祈りの文字がにじんでいる。", "礼拝席の下に、誰かの荷物だけが残っていた。", "鐘はないのに、遠くで一度だけ鳴った。"],
  },
  redMoonCanyon: {
    id: "redMoonCanyon",
    name: "赤月の峡谷",
    durationMs: 5000,
    difficulty: 21,
    baseAtk: 215,
    monsters: ["redMoonHawk", "gorgeWhisperer", "cliffGnawer", "bloodDustBandit", "moonlitJackal"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "redMoonHeadsman",
    unlockAfter: "forgottenChapel",
    flavor: ["谷底に赤い月光が溜まり、影の向きが合わない。", "石壁に古い処刑記録が刻まれていた。", "落石の音だけが、何度も同じ場所から返ってくる。"],
  },
  northernOldRoad: {
    id: "northernOldRoad",
    name: "北方旧街道",
    durationMs: 5000,
    difficulty: 22,
    baseAtk: 240,
    monsters: ["frostbittenCourier", "oldRoadHound", "whiteMileWraith", "brokenSledGuard", "snowMurkOwl"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "northRoadPaleRider",
    unlockAfter: "redMoonCanyon",
    flavor: ["古い標識は北だけを指し続けている。", "雪に埋もれた焚き火跡から、まだ細い煙が出ていた。", "風の中に、荷車の軋む音が混じる。"],
  },
  sealedMineRuins: {
    id: "sealedMineRuins",
    name: "封鎖鉱山跡",
    durationMs: 5000,
    difficulty: 23,
    baseAtk: 268,
    monsters: ["sealedPickman", "oreDustBat", "blackLungShade", "chainCart", "deepVeinCrawler", "gloomQuartz"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "sealedMineForeman",
    unlockAfter: "northernOldRoad",
    flavor: ["封鎖札は新しい。だが坑道の奥からは古い歌が聞こえる。", "鉱車の車輪跡が、出口ではなく地下へ続いていた。", "壁の鉱脈が、脈のように暗く光った。"],
  },
  silentCorridor: {
    id: "silentCorridor",
    name: "沈黙の回廊",
    durationMs: 5000,
    difficulty: 24,
    baseAtk: 298,
    monsters: ["hushCrawler", "voicelessSentry", "curtainShade", "stillStepMonk", "muteArchivist", "echoEater"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "corridorThatListens",
    unlockAfter: "sealedMineRuins",
    flavor: ["声を出すと、少し遅れて別の声が同じ言葉を返した。", "壁の燭台は冷えきっている。", "嫌な静けさが続く。"],
  },
  lightlessCatacomb: {
    id: "lightlessCatacomb",
    name: "灯なき地下墓地",
    durationMs: 5000,
    difficulty: 25,
    baseAtk: 330,
    monsters: ["unlitBoneguard", "graveMoth", "namelessReliquary", "coffinListener", "paleTombHound", "burialInk"],
    normalEncounterGroupWeights: { 1: 50, 2: 35, 3: 15 },
    boss: "lightlessGravePrior",
    unlockAfter: "silentCorridor",
    flavor: ["灯りは持ち込んだそばから弱くなった。", "墓碑銘のない石棺が、通路の両側に並んでいる。", "足跡は途中で消えていた。"],
  },
};

const AREA_ORDER = ["plainEntrance", "plainRoad", "goblinNest", "howlingRoad", "mossTrail", "beastTerritory", "swamp", "ruins", "canyon", "glacier", "volcano", "abyss", "forgottenCorridor", "starMarsh", "mourningSpire", "borderGate", "ashCapital", "silentRim", "lastCathedral", "mistRainRoad", "abandonedWatchtower", "witheredForestGate", "blackwaterMarsh", "forgottenChapel", "redMoonCanyon", "northernOldRoad", "sealedMineRuins", "silentCorridor", "lightlessCatacomb"];

const WORLD_SITUATIONS = {
  plain: [["最近、始まりの草原付近の魔物が活発化している。", "近隣街道にて小規模な襲撃報告あり。"]],
  plainEntrance: [["街道脇の平原入口で、小型魔物の目撃報告が増えている。"]],
  plainRoad: [["平原道中にて、荷の荒らし跡と小鬼の足跡が確認された。"]],
  goblinNest: [["平原奥でゴブリンの巣穴らしき拠点が見つかった。", "偵察隊は統率個体の存在を警告している。"]],
  forest: [["月影の森から戻らない行商人が増えている。", "夜間、森方面で遠吠えが確認された。"]],
  howlingRoad: [["月影の森の入口街道で、夜毎に遠吠えが重なっている。"]],
  mossTrail: [["苔むす獣道で、獣の足跡に混じって奇妙な術式痕が見つかった。"]],
  beastTerritory: [["森の深部で巨獣の縄張りが確認された。", "先行隊は奥へ進まず、警戒報告のみを持ち帰った。"]],
  swamp: [["沈み杭の沼で消息を絶つ冒険者が出ている。", "周辺村落では井戸水の変色が確認された。"]],
  ruins: [["忘れられた遺跡内部で未知の紋章が発見された。", "調査班は夜間活動を停止した。"]],
  canyon: [["赤鳴りの峡谷監視隊より、説明できない落石音の報告あり。", "吊り橋の通行許可はギルド管理下へ移された。"]],
  glacier: [["白冠の氷原方面の監視塔が一晩で凍結した。", "防寒符の追加配布を受付で開始した。"]],
  volcano: [["赤熱の火口から火山灰が麓の街道まで届き始めている。", "耐熱装備なしでの派遣は認められない。"]],
  abyss: [["深淵周辺で時間感覚異常が報告されている。", "ギルドは封印付き報告書の閲覧権限を制限した。"]],
  forgottenCorridor: [["忘却の回廊で、派遣記録の一部が白紙化する事例が確認された。", "受付では帰還者の氏名確認を二名体制に変更した。"]],
  starMarsh: [["星喰いの湿原周辺で、夜間でもないのに星明かりが水面に映るとの報告あり。", "湿原監視所は発光泥の採取を禁止した。"]],
  mourningSpire: [["嘆きの尖塔上層から、未提出の報告書を読み上げる声が聞こえるという。", "高所探索許可は熟練冒険者に限定された。"]],
  borderGate: [["境界の門で、通行証に存在しない出入口の印が増える事例あり。", "門前監視隊は帰還確認の手順を二重化した。"]],
  ashCapital: [["灰冠の王都で、無人の広場に王令が掲示され続けている。", "ギルドは掲示物の回収を禁じ、写しのみ提出させている。"]],
  silentRim: [["静寂の外縁では、声と足音が記録水晶に残らない事例が増えている。", "測量班は手信号による帰還確認を採用した。"]],
  lastCathedral: [["終末の大聖堂から、冒険者名簿にない者の帰還報告が届いた。", "最深部への派遣は複数隊の交代制でのみ認められる。"]],
  mistRainRoad: [["霧雨の街道で、荷馬車の灯りが途中から消える報告が続いている。", "街道札は濡れていないのに、文字だけが流れていた。"]],
  abandonedWatchtower: [["捨てられた監視塔の上階に、夜だけ火のない見張りが立つという。", "監視塔付近で古い警鐘の音が記録された。"]],
  witheredForestGate: [["枯森の入口では、入った人数と戻った人数が合わない報告がある。", "森番の古い札は、内側から爪で削られていた。"]],
  blackwaterMarsh: [["黒水湿地の水位は変わらないのに、杭だけが日ごとに沈んでいる。", "湿地周辺で、濡れた足跡が家屋の前まで続いていた。"]],
  forgottenChapel: [["忘れられた礼拝堂から、無人の祈祷記録が届いた。", "礼拝堂の鐘楼には鐘がないが、鐘の音だけは残っている。"]],
  redMoonCanyon: [["赤月の峡谷では、夜間の月光が谷底だけ赤く染まる。", "峡谷警備隊は崖下の調査を一時停止した。"]],
  northernOldRoad: [["北方旧街道で、凍った荷車が進行方向を逆に向けて発見された。", "旧街道の標識は、雪を払っても同じ地名しか現れない。"]],
  sealedMineRuins: [["封鎖鉱山跡の封印札が、内側から破られていた。", "坑道の奥で、古い作業日誌が毎朝一行ずつ増えている。"]],
  silentCorridor: [["沈黙の回廊では、会話記録の一部だけが空白になる。", "帰還者は全員、同じ曲がり角を覚えていなかった。"]],
  lightlessCatacomb: [["灯なき地下墓地へ向かった灯火係が、空のランタンだけを残して戻らなかった。", "墓地の名簿には、まだ生きている者の名前が混じっている。"]],
};

// Optional monster fields:
// special: "selfDestruct"
const MONSTERS = {
  slime: { id: "slime", name: "スライム", hp: 18, atk: 5, xp: 8, gold: 7, drops: ["oldCharm", "travelerHat"] },
  goblin: { id: "goblin", name: "ゴブリン", hp: 24, atk: 7, xp: 11, gold: 10, drops: ["chippedSword", "travelerHat"] },
  axeGoblin: { id: "axeGoblin", name: "アックスゴブリン", hp: 30, atk: 9, xp: 14, gold: 12, special: "heavySwingLite", traitsText: "低確率で重い一撃を放つ。", drops: ["chippedSword", "travelerHat"] },
  goblinArcher: { id: "goblinArcher", name: "ゴブリンアーチャー", hp: 22, atk: 8, xp: 12, gold: 11, targeting: "backlineBias", traitsText: "後衛を狙いやすい。", drops: ["oldCharm", "travelerHat"] },
  goblinMage: { id: "goblinMage", name: "メイジゴブリン", hp: 20, atk: 9, xp: 13, gold: 12, special: "fireboltLite", traitsText: "低確率で火球を使う。", drops: ["oldCharm", "emberPendant"] },
  goblinChief: { id: "goblinChief", name: "ゴブリンチーフ", hp: 46, atk: 10, xp: 28, gold: 34, rare: true, boss: true, drops: ["silverBuckle", "emberPendant"] },
  wolf: { id: "wolf", name: "ウルフ", hp: 30, atk: 9, xp: 15, gold: 13, drops: ["patchedCloak", "travelerCloak", "travelerShoes"] },
  mossMage: { id: "mossMage", name: "モスメイジ", hp: 26, atk: 11, xp: 18, gold: 16, rare: true, special: "curseTouch", traitsText: "低確率で呪いを付与する。", drops: ["oldCharm", "emberPendant", "travelerCloak", "travelerShoes"] },
  forestWarden: { id: "forestWarden", name: "森の番獣", hp: 62, atk: 14, xp: 46, gold: 52, rare: true, boss: true, drops: ["blackLeatherArmor"] },
  mudSlime: { id: "mudSlime", name: "沼泥スライム", hp: 36, atk: 12, xp: 24, gold: 20 },
  bogLeech: { id: "bogLeech", name: "沼大蛭", hp: 42, atk: 13, xp: 28, gold: 24 },
  marshMaw: { id: "marshMaw", name: "沼の大口", hp: 78, atk: 17, xp: 62, gold: 70, rare: true, boss: true },
  skeleton: { id: "skeleton", name: "スケルトン", hp: 38, atk: 12, xp: 24, gold: 20, drops: ["rustyAxe"] },
  stoneGuard: { id: "stoneGuard", name: "ストーンゴーレム", hp: 48, atk: 13, xp: 30, gold: 26, drops: ["crackedRing"] },
  ruinKnight: { id: "ruinKnight", name: "遺跡の黒騎士", hp: 86, atk: 18, xp: 70, gold: 80, rare: true, boss: true, drops: ["blackIronSword", "oldBreastplate"] },
  rockHawk: { id: "rockHawk", name: "岩羽のハーピー", hp: 52, atk: 17, xp: 38, gold: 34 },
  canyonBandit: { id: "canyonBandit", name: "谷底の盗賊団", hp: 60, atk: 18, xp: 45, gold: 42, drops: ["mercenarySword"] },
  redGorgeWing: { id: "redGorgeWing", name: "赤峡の断頭翼", hp: 112, atk: 24, xp: 96, gold: 110, rare: true, boss: true, drops: ["thiefGloves"] },
  iceWolf: { id: "iceWolf", name: "氷狼", hp: 66, atk: 20, xp: 52, gold: 48 },
  frostWisp: { id: "frostWisp", name: "霜の灯霊", hp: 58, atk: 22, xp: 58, gold: 52, rare: true, drops: ["oldCharm"] },
  whiteFangGiant: { id: "whiteFangGiant", name: "白牙の巨影", hp: 138, atk: 28, xp: 126, gold: 145, rare: true, boss: true },
  emberImp: { id: "emberImp", name: "火の小魔", hp: 44, atk: 15, xp: 34, gold: 32 },
  lavaBeast: { id: "lavaBeast", name: "溶岩獣", hp: 58, atk: 17, xp: 44, gold: 40 },
  flameTyrant: { id: "flameTyrant", name: "火口の暴君", hp: 118, atk: 22, xp: 110, gold: 130, rare: true, boss: true, drops: ["ashCoveredStaff", "emberRemnantBlade"] },
  abyssCrawler: { id: "abyssCrawler", name: "深淵の這う影", hp: 82, atk: 27, xp: 72, gold: 68 },
  namelessShade: { id: "namelessShade", name: "名もなき影", hp: 76, atk: 29, xp: 78, gold: 74, rare: true },
  abyssEnvoy: { id: "abyssEnvoy", name: "深淵の使者", hp: 176, atk: 36, xp: 170, gold: 210, rare: true, boss: true },
  chalkGuard: { id: "chalkGuard", name: "白墨の衛兵", hp: 94, atk: 32, xp: 88, gold: 86 },
  lostRecord: { id: "lostRecord", name: "迷い札の亡者", hp: 88, atk: 34, xp: 94, gold: 92, rare: true },
  ledgerKeeper: { id: "ledgerKeeper", name: "忘録の番人", hp: 210, atk: 42, xp: 220, gold: 270, rare: true, boss: true },
  starMud: { id: "starMud", name: "星泥スライム", hp: 110, atk: 38, xp: 108, gold: 105 },
  lampToad: { id: "lampToad", name: "灯喰い蛙", hp: 104, atk: 40, xp: 116, gold: 112, rare: true },
  starMarshLord: { id: "starMarshLord", name: "星泥の大主", hp: 255, atk: 49, xp: 285, gold: 340, rare: true, boss: true },
  bellShade: { id: "bellShade", name: "鐘鳴らしの影", hp: 126, atk: 45, xp: 132, gold: 128 },
  towerGargoyle: { id: "towerGargoyle", name: "塔守の石像", hp: 144, atk: 43, xp: 138, gold: 136 },
  mourningBellMaster: { id: "mourningBellMaster", name: "嘆鐘の塔主", hp: 305, atk: 58, xp: 360, gold: 430, rare: true, boss: true },
  borderHound: { id: "borderHound", name: "境目の猟犬", hp: 152, atk: 52, xp: 160, gold: 152 },
  permitWraith: { id: "permitWraith", name: "通行証の亡者", hp: 148, atk: 55, xp: 172, gold: 164, rare: true },
  gateArbiter: { id: "gateArbiter", name: "境門の裁定者", hp: 370, atk: 68, xp: 455, gold: 540, rare: true, boss: true },
  ashGuard: { id: "ashGuard", name: "灰衣の近衛", hp: 180, atk: 62, xp: 205, gold: 190 },
  emptyThroneServant: { id: "emptyThroneServant", name: "空玉座の従者", hp: 168, atk: 66, xp: 218, gold: 205, rare: true },
  ashCrownMarshal: { id: "ashCrownMarshal", name: "灰冠王の近衛長", hp: 450, atk: 82, xp: 575, gold: 680, rare: true, boss: true },
  silentScout: { id: "silentScout", name: "無音の斥候", hp: 210, atk: 74, xp: 255, gold: 236 },
  voicelessMage: { id: "voicelessMage", name: "声をなくした術師", hp: 198, atk: 79, xp: 275, gold: 252, rare: true },
  rimAuditor: { id: "rimAuditor", name: "外縁監査官", hp: 535, atk: 98, xp: 730, gold: 860, rare: true, boss: true },
  finalAcolyte: { id: "finalAcolyte", name: "終鐘の侍者", hp: 246, atk: 88, xp: 320, gold: 295 },
  crackedSaint: { id: "crackedSaint", name: "割れた聖像", hp: 270, atk: 92, xp: 345, gold: 320, rare: true },
  lastBishop: { id: "lastBishop", name: "終鐘の司教", hp: 650, atk: 116, xp: 920, gold: 1100, rare: true, boss: true },
  mistRoadStray: { id: "mistRoadStray", name: "霧道の野犬", hp: 285, atk: 96, xp: 380, gold: 340 },
  wetCloakBandit: { id: "wetCloakBandit", name: "濡れ外套の追剥", hp: 300, atk: 99, xp: 398, gold: 365 },
  rainMoth: { id: "rainMoth", name: "雨翅の蛾", hp: 276, atk: 104, xp: 420, gold: 390, rare: true },
  milestoneWatcher: { id: "milestoneWatcher", name: "道標の監視者", hp: 710, atk: 126, xp: 1080, gold: 1260, rare: true, boss: true },
  towerRat: { id: "towerRat", name: "塔鼠の群れ", hp: 318, atk: 106, xp: 450, gold: 405 },
  rustedLookout: { id: "rustedLookout", name: "錆びた見張り", hp: 336, atk: 109, xp: 470, gold: 430 },
  hollowSignalman: { id: "hollowSignalman", name: "虚ろな信号手", hp: 310, atk: 114, xp: 495, gold: 455 },
  shutterWraith: { id: "shutterWraith", name: "雨戸の亡霊", hp: 325, atk: 118, xp: 520, gold: 490, rare: true },
  blindTowerKeeper: { id: "blindTowerKeeper", name: "盲目の塔守", hp: 780, atk: 139, xp: 1260, gold: 1460, rare: true, boss: true },
  dryBranchCrawler: { id: "dryBranchCrawler", name: "枯枝這い", hp: 350, atk: 120, xp: 545, gold: 505 },
  barklessWolf: { id: "barklessWolf", name: "樹皮なき狼", hp: 370, atk: 124, xp: 570, gold: 535 },
  ashLeafImp: { id: "ashLeafImp", name: "灰葉の小魔", hp: 342, atk: 129, xp: 600, gold: 560 },
  rootBoundShade: { id: "rootBoundShade", name: "根縛りの影", hp: 360, atk: 132, xp: 630, gold: 600, rare: true },
  witheredGateStag: { id: "witheredGateStag", name: "枯門の角獣", hp: 865, atk: 154, xp: 1460, gold: 1680, rare: true, boss: true },
  blackwaterLeech: { id: "blackwaterLeech", name: "黒水蛭", hp: 395, atk: 136, xp: 665, gold: 620 },
  sunkenLantern: { id: "sunkenLantern", name: "沈み灯籠", hp: 382, atk: 141, xp: 690, gold: 650 },
  mudVeilCrawler: { id: "mudVeilCrawler", name: "泥帳這い", hp: 410, atk: 144, xp: 720, gold: 680 },
  bogMourner: { id: "bogMourner", name: "湿地の弔い人", hp: 390, atk: 149, xp: 750, gold: 715, rare: true },
  tarScaleNewt: { id: "tarScaleNewt", name: "瀝青鱗の水蜥蜴", hp: 425, atk: 146, xp: 735, gold: 700 },
  blackwaterUndertow: { id: "blackwaterUndertow", name: "黒水の引き込み手", hp: 970, atk: 174, xp: 1700, gold: 1960, rare: true, boss: true },
  dustAcolyte: { id: "dustAcolyte", name: "埃の侍祭", hp: 440, atk: 153, xp: 790, gold: 745 },
  crackedBell: { id: "crackedBell", name: "割れ鐘", hp: 470, atk: 156, xp: 820, gold: 775 },
  pewCreeper: { id: "pewCreeper", name: "長椅子這い", hp: 455, atk: 160, xp: 850, gold: 800 },
  stainedGlassMote: { id: "stainedGlassMote", name: "色硝子の微光", hp: 430, atk: 166, xp: 885, gold: 840, rare: true },
  silentConfessor: { id: "silentConfessor", name: "沈黙の告解者", hp: 465, atk: 163, xp: 870, gold: 820 },
  chapelWithoutSaint: { id: "chapelWithoutSaint", name: "聖者なき礼拝堂", hp: 1090, atk: 194, xp: 1980, gold: 2280, rare: true, boss: true },
  redMoonHawk: { id: "redMoonHawk", name: "赤月鷹", hp: 490, atk: 170, xp: 925, gold: 875 },
  gorgeWhisperer: { id: "gorgeWhisperer", name: "峡谷の囁き手", hp: 478, atk: 175, xp: 960, gold: 910 },
  cliffGnawer: { id: "cliffGnawer", name: "崖噛み獣", hp: 515, atk: 178, xp: 990, gold: 940 },
  bloodDustBandit: { id: "bloodDustBandit", name: "血塵の盗賊", hp: 500, atk: 183, xp: 1030, gold: 980, rare: true },
  moonlitJackal: { id: "moonlitJackal", name: "月明かりの山犬", hp: 505, atk: 180, xp: 1010, gold: 955 },
  redMoonHeadsman: { id: "redMoonHeadsman", name: "赤月の断罪人", hp: 1230, atk: 218, xp: 2320, gold: 2680, rare: true, boss: true },
  frostbittenCourier: { id: "frostbittenCourier", name: "凍えた伝令", hp: 535, atk: 188, xp: 1080, gold: 1025 },
  oldRoadHound: { id: "oldRoadHound", name: "旧街道の猟犬", hp: 555, atk: 191, xp: 1110, gold: 1050 },
  whiteMileWraith: { id: "whiteMileWraith", name: "白き一里塚の亡霊", hp: 525, atk: 198, xp: 1160, gold: 1100, rare: true },
  brokenSledGuard: { id: "brokenSledGuard", name: "壊れ橇の護衛", hp: 570, atk: 194, xp: 1135, gold: 1080 },
  snowMurkOwl: { id: "snowMurkOwl", name: "雪濁りの梟", hp: 545, atk: 201, xp: 1185, gold: 1125 },
  northRoadPaleRider: { id: "northRoadPaleRider", name: "北道の青白き騎手", hp: 1380, atk: 244, xp: 2700, gold: 3120, rare: true, boss: true },
  sealedPickman: { id: "sealedPickman", name: "封じ札の坑夫", hp: 600, atk: 206, xp: 1240, gold: 1180 },
  oreDustBat: { id: "oreDustBat", name: "鉱塵蝙蝠", hp: 585, atk: 212, xp: 1280, gold: 1215 },
  blackLungShade: { id: "blackLungShade", name: "黒肺の影", hp: 610, atk: 216, xp: 1325, gold: 1260, rare: true },
  chainCart: { id: "chainCart", name: "鎖引き鉱車", hp: 635, atk: 210, xp: 1300, gold: 1235 },
  deepVeinCrawler: { id: "deepVeinCrawler", name: "深脈這い", hp: 620, atk: 220, xp: 1360, gold: 1290 },
  gloomQuartz: { id: "gloomQuartz", name: "陰り水晶", hp: 590, atk: 224, xp: 1395, gold: 1340, rare: true },
  sealedMineForeman: { id: "sealedMineForeman", name: "封鎖鉱山の親方", hp: 1560, atk: 276, xp: 3150, gold: 3660, rare: true, boss: true },
  hushCrawler: { id: "hushCrawler", name: "静寂這い", hp: 660, atk: 230, xp: 1460, gold: 1380 },
  voicelessSentry: { id: "voicelessSentry", name: "声なき衛兵", hp: 680, atk: 234, xp: 1500, gold: 1420 },
  curtainShade: { id: "curtainShade", name: "帳の影", hp: 648, atk: 240, xp: 1540, gold: 1470, rare: true },
  stillStepMonk: { id: "stillStepMonk", name: "静歩の修道士", hp: 675, atk: 238, xp: 1525, gold: 1450 },
  muteArchivist: { id: "muteArchivist", name: "無言の記録官", hp: 655, atk: 244, xp: 1580, gold: 1500 },
  echoEater: { id: "echoEater", name: "反響喰らい", hp: 690, atk: 248, xp: 1620, gold: 1540, rare: true },
  corridorThatListens: { id: "corridorThatListens", name: "聞き耳を持つ回廊", hp: 1780, atk: 310, xp: 3660, gold: 4260, rare: true, boss: true },
  unlitBoneguard: { id: "unlitBoneguard", name: "灯なき骨守", hp: 720, atk: 256, xp: 1690, gold: 1600 },
  graveMoth: { id: "graveMoth", name: "墓所蛾", hp: 700, atk: 262, xp: 1730, gold: 1640 },
  namelessReliquary: { id: "namelessReliquary", name: "名なしの聖遺箱", hp: 745, atk: 258, xp: 1765, gold: 1680, rare: true },
  coffinListener: { id: "coffinListener", name: "棺の聞き手", hp: 735, atk: 266, xp: 1810, gold: 1725 },
  paleTombHound: { id: "paleTombHound", name: "青白い墓犬", hp: 760, atk: 270, xp: 1855, gold: 1760 },
  burialInk: { id: "burialInk", name: "埋葬墨", hp: 710, atk: 274, xp: 1900, gold: 1820, rare: true },
  lightlessGravePrior: { id: "lightlessGravePrior", name: "灯なき墓所の院長", hp: 2050, atk: 350, xp: 4300, gold: 5000, rare: true, boss: true },
};
