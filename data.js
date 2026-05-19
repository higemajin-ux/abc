"use strict";

const SAVE_KEY = "dispatch-hero-save-v8";
const MAX_DISPATCH_HISTORY = 8;

const JOB_LABELS = {
  warrior: "戦士",
  priest: "神官",
  mage: "魔法使い",
  scout: "斥候",
};

const JOB_STATS = {
  warrior: { maxHp: 42, atk: 12, def: 5, dex: 6, luc: 4 },
  priest: { maxHp: 32, atk: 7, def: 3, dex: 7, luc: 8 },
  mage: { maxHp: 28, atk: 8, def: 2, dex: 8, luc: 6 },
  scout: { maxHp: 34, atk: 9, def: 3, dex: 10, luc: 7 },
};

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
    boss: "goblinChief",
    unlockAfter: null,
    flavor: ["朝露の草を踏み、隊列は街道の外へ出た。", "遠くで鐘が鳴り、草むらが小さく揺れた。"],
  },
  forest: {
    id: "forest",
    name: "月影の森",
    durationMs: 5000,
    difficulty: 2,
    baseAtk: 7,
    monsters: ["wolf", "mossMage"],
    boss: "forestWarden",
    unlockAfter: "plain",
    flavor: ["枝葉が月を裂き、足音だけが森に残る。", "古い祠の前で、冷たい風が吹いた。"],
  },
  swamp: {
    id: "swamp",
    name: "沈み杭の沼",
    durationMs: 5000,
    difficulty: 3,
    baseAtk: 11,
    monsters: ["mudSlime", "bogLeech"],
    boss: "marshMaw",
    unlockAfter: "forest",
    flavor: ["腐った桟橋が水面に沈みかけ、隊列は一歩ずつ進んだ。", "泥の泡が弾けるたび、古い杭が小さく揺れた。"],
  },
  ruins: {
    id: "ruins",
    name: "忘れられた遺跡",
    durationMs: 5000,
    difficulty: 4,
    baseAtk: 14,
    monsters: ["skeleton", "stoneGuard"],
    unlockAfter: "swamp",
    boss: "ruinKnight",
    flavor: ["崩れた石畳に、誰かの足跡が続いている。", "壁画の目が、一行を見送った気がした。"],
  },
  canyon: {
    id: "canyon",
    name: "赤鳴りの峡谷",
    durationMs: 5000,
    difficulty: 5,
    baseAtk: 18,
    monsters: ["rockHawk", "canyonBandit"],
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
    boss: "abyssEnvoy",
    unlockAfter: "volcano",
    flavor: ["道は下へ続くはずなのに、影だけが天井へ伸びていく。", "壊れた標識に、まだ出発していない隊の名が刻まれていた。"],
  },
  forgottenCorridor: {
    id: "forgottenCorridor",
    name: "忘却の回廊",
    durationMs: 5000,
    difficulty: 9,
    baseAtk: 40,
    monsters: ["chalkGuard", "lostRecord"],
    boss: "ledgerKeeper",
    unlockAfter: "abyss",
    flavor: ["同じ扉が何度も現れ、壁の番号だけが増えていく。", "記録用の札が、誰の名も残さず白く擦り切れていた。"],
  },
  starMarsh: {
    id: "starMarsh",
    name: "星喰いの湿原",
    durationMs: 5000,
    difficulty: 10,
    baseAtk: 48,
    monsters: ["starMud", "lampToad"],
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
    boss: "lastBishop",
    unlockAfter: "silentRim",
    flavor: ["長い身廊に破れた旗が垂れ、床石には古い足跡が残る。", "祭壇の奥で、冒険者名簿を閉じる音がした。"],
  },
};

const AREA_ORDER = ["plain", "forest", "swamp", "ruins", "canyon", "glacier", "volcano", "abyss", "forgottenCorridor", "starMarsh", "mourningSpire", "borderGate", "ashCapital", "silentRim", "lastCathedral"];

const WORLD_SITUATIONS = {
  plain: [["最近、始まりの草原付近の魔物が活発化している。", "近隣街道にて小規模な襲撃報告あり。"]],
  forest: [["月影の森から戻らない行商人が増えている。", "夜間、森方面で遠吠えが確認された。"]],
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
};

const MONSTERS = {
  slime: { id: "slime", name: "スライム", hp: 18, atk: 5, xp: 8, gold: 7 },
  goblin: { id: "goblin", name: "小鬼", hp: 24, atk: 7, xp: 11, gold: 10 },
  goblinChief: { id: "goblinChief", name: "小鬼頭", hp: 46, atk: 10, xp: 28, gold: 34, rare: true, boss: true },
  wolf: { id: "wolf", name: "森狼", hp: 30, atk: 9, xp: 15, gold: 13 },
  mossMage: { id: "mossMage", name: "苔の術師", hp: 26, atk: 11, xp: 18, gold: 16, rare: true },
  forestWarden: { id: "forestWarden", name: "森の番獣", hp: 62, atk: 14, xp: 46, gold: 52, rare: true, boss: true },
  mudSlime: { id: "mudSlime", name: "沼泥スライム", hp: 36, atk: 12, xp: 24, gold: 20 },
  bogLeech: { id: "bogLeech", name: "沼大蛭", hp: 42, atk: 13, xp: 28, gold: 24 },
  marshMaw: { id: "marshMaw", name: "沼の大口", hp: 78, atk: 17, xp: 62, gold: 70, rare: true, boss: true },
  skeleton: { id: "skeleton", name: "骸骨兵", hp: 38, atk: 12, xp: 24, gold: 20 },
  stoneGuard: { id: "stoneGuard", name: "石の番兵", hp: 48, atk: 13, xp: 30, gold: 26 },
  ruinKnight: { id: "ruinKnight", name: "遺跡の黒騎士", hp: 86, atk: 18, xp: 70, gold: 80, rare: true, boss: true },
  rockHawk: { id: "rockHawk", name: "岩羽のハーピー", hp: 52, atk: 17, xp: 38, gold: 34 },
  canyonBandit: { id: "canyonBandit", name: "谷底の盗賊団", hp: 60, atk: 18, xp: 45, gold: 42 },
  redGorgeWing: { id: "redGorgeWing", name: "赤峡の断頭翼", hp: 112, atk: 24, xp: 96, gold: 110, rare: true, boss: true },
  iceWolf: { id: "iceWolf", name: "氷狼", hp: 66, atk: 20, xp: 52, gold: 48 },
  frostWisp: { id: "frostWisp", name: "霜の灯霊", hp: 58, atk: 22, xp: 58, gold: 52, rare: true },
  whiteFangGiant: { id: "whiteFangGiant", name: "白牙の巨影", hp: 138, atk: 28, xp: 126, gold: 145, rare: true, boss: true },
  emberImp: { id: "emberImp", name: "火の小魔", hp: 44, atk: 15, xp: 34, gold: 32 },
  lavaBeast: { id: "lavaBeast", name: "溶岩獣", hp: 58, atk: 17, xp: 44, gold: 40 },
  flameTyrant: { id: "flameTyrant", name: "火口の暴君", hp: 118, atk: 22, xp: 110, gold: 130, rare: true, boss: true },
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
};
