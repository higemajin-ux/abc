"use strict";

let nextId = 1;
let tickId = null;
let worldTickId = null;
let storageRenderCount = -1;
let storageSortMode = "new";
let storageFilterMode = "all";
let storageFilterOpen = false;
let storageAutoSellOpen = false;
let storageBulkSellMode = false;
let storageFusionMode = false;
let storageFusionMessage = "";
const selectedStorageGroups = new Set();
let selectedStorageFusionTargetIndex = null;
const selectedStorageFusionMaterialGroupIds = new Set();
const openDetailPartyIds = new Set();
const SHORTCUT_REDUCTION_RATE = 0.1;
const MIN_MISSION_DURATION_MS = 5000;
const DEVELOPER_MISSION_DURATION_MS = 6000;
registerDropEquipmentItems();
let state = {
  parties: [defaultParty("pt1", "第一小隊"), defaultParty("pt2", "第二小隊")],
  stats: { gold: 0 },
  areaClears: {},
  storage: [],
  autoSell: { common: false, uncommon: false },
  records: defaultRecords(),
  developerMode: false,
};

function $(id) {
  return document.getElementById(id);
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${nextId++}`;
}

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function defaultStats() {
  return { gold: 0, kills: 0, missionsStarted: 0, missionsCleared: 0 };
}

function defaultGuildStats() {
  return { gold: 0 };
}

function cloneEquipmentOptions(options) {
  return Array.isArray(options) ? options.map((option) => ({ ...option })) : undefined;
}

function cloneEquipmentOptionIds(optionIds) {
  return Array.isArray(optionIds) ? optionIds.filter(Boolean).map((id) => String(id)) : undefined;
}

function normalizeEquipmentItem(item, base = {}) {
  if (!item?.id && !base?.id) return null;
  const merged = {
    ...base,
    ...item,
    options: cloneEquipmentOptions(item?.options) ?? cloneEquipmentOptions(base?.options),
    fixedOptions: cloneEquipmentOptionIds(item?.fixedOptions) ?? cloneEquipmentOptionIds(base?.fixedOptions),
    optionCandidates: cloneEquipmentOptionIds(item?.optionCandidates) ?? cloneEquipmentOptionIds(base?.optionCandidates),
  };
  return {
    ...merged,
    rarity: normalizeRarity(merged.rarity || base.rarity),
    sellGold: merged.sellGold || base.sellGold || 0,
  };
}

function registerEquipmentItem(item) {
  if (!item?.id) return null;
  const base = EQUIPMENT_ITEMS[item.id] || EQUIPMENT_DROPS.find((drop) => drop.id === item.id) || {};
  const normalized = normalizeEquipmentItem(item, base);
  EQUIPMENT_ITEMS[normalized.id] = normalized;
  return normalized;
}

function registerDropEquipmentItems() {
  (EQUIPMENT_DROPS || []).forEach(registerEquipmentItem);
}

function storageItemFromEquipment(item) {
  const base = EQUIPMENT_ITEMS[item?.id] || EQUIPMENT_DROPS.find((drop) => drop.id === item?.id) || {};
  const normalized = normalizeEquipmentItem(item, base);
  if (!normalized) return null;
  return {
    ...normalized,
    ...(normalized.options ? { options: cloneEquipmentOptions(normalized.options) } : {}),
    ...(normalized.fixedOptions ? { fixedOptions: cloneEquipmentOptionIds(normalized.fixedOptions) } : {}),
    ...(normalized.optionCandidates ? { optionCandidates: cloneEquipmentOptionIds(normalized.optionCandidates) } : {}),
    rarity: normalizeRarity(normalized.rarity),
    sellGold: normalized.sellGold || 0,
    locked: !!item.locked,
    storedAt: Date.now(),
  };
}

function storageItemFromEquipmentId(itemId) {
  if (!itemId) return null;
  if (typeof itemId === "object") return storageItemFromEquipment(itemId);
  return storageItemFromEquipment(EQUIPMENT_ITEMS[itemId] || EQUIPMENT_DROPS.find((drop) => drop.id === itemId));
}

function hasItemInstanceData(item) {
  if (!item || typeof item !== "object") return false;
  return (
    (Array.isArray(item.options) && item.options.length > 0) ||
    (Array.isArray(item.fixedOptions) && item.fixedOptions.length > 0) ||
    (Array.isArray(item.optionCandidates) && item.optionCandidates.length > 0) ||
    Number(item.plus) > 0 ||
    Number(item.enhance) > 0
  );
}

function equipmentStatLine(item) {
  if (!item) return "";
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  const parts = ["maxHp", "atk", "def", "dex", "luc"]
    .map((key) => ({ key, value: equipmentStatValue(item, key) }))
    .filter(({ value }) => value)
    .map(({ key, value }) => `${labels[key]}${value > 0 ? "+" : ""}${value}`);
  return parts.length ? parts.join(" / ") : "性能なし";
}

function equipmentStatValue(item, key) {
  const baseValue = Number(item?.[key]) || 0;
  const plus = Math.max(0, Number(item?.plus) || 0);
  if (!baseValue || plus <= 0) return baseValue;
  return baseValue + plus;
}

function equipmentDisplayName(item) {
  const name = item?.name || "名称不明の装備";
  const plus = Math.max(0, Number(item?.plus) || 0);
  return plus > 0 ? `${name}+${plus}` : name;
}

function equipmentStorageLine(item) {
  const sellGold = equipmentSellGoldValue(item);
  return `${equipmentStatLine(item)} / 売却 ${sellGold}G`;
}

function formatEquipmentOptionDetail(option, meta, level) {
  if (typeof meta?.format === "function") return meta.format(level);
  if (option?.id === "attackUp") return `ATK+${level * 2}`;
  if (option?.id === "attackPercent") return `${level * 5}%`;
  if (option?.id === "hpUp") return `HP+${level * 5}`;
  if (option?.id === "hpPercent") return `${level * 5}%`;
  if (option?.id === "criticalRate") return `${level}%`;
  if (option?.id === "blindStrike") return `${level * 5}%`;
  if (option?.id === "poisonStrike") return `${level * 5}%`;
  return "";
}

function formatEquipmentOptionCandidate(optionId) {
  const meta = OPTION_MASTER?.[optionId];
  if (!meta?.name) return String(optionId);
  const option = { id: optionId, level: 1 };
  const detail = formatEquipmentOptionDetail(option, meta, 1);
  const text = `${meta.name}Lv1`;
  return detail ? `${text}（${detail}）` : text;
}

function canFixEquipmentOption(item) {
  return (Array.isArray(item?.options) ? item.options.length : 0) < 3;
}

function equipmentOptionCandidatesStorageHtml(item, context = {}) {
  const optionCandidates = Array.isArray(item?.optionCandidates) ? item.optionCandidates : [];
  if (!optionCandidates.length) return "";
  const canFix = canFixEquipmentOption(item);
  const storageIndex = typeof context?.storageIndex === "number" ? context.storageIndex : null;
  const lines = optionCandidates
    .map((optionId) => {
      const text = formatEquipmentOptionCandidate(optionId);
      if (!text) return "";
      if (storageIndex == null) return text;
      return `<button type="button" class="storage-lock-btn" data-storage-option-fix="${storageIndex}" data-option-id="${String(optionId)}" ${canFix ? "" : "disabled"}>${text}</button>`;
    })
    .filter(Boolean);
  if (!lines.length) return "";
  return `<div class="storage-effect">成長候補<br>（1つ選んでください）<br><br>${lines.join("<br>")}</div>`;
}

function equipmentOptionsStorageHtml(item, context = {}) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const lines = options
    .map((option) => {
      const meta = OPTION_MASTER?.[option?.id];
      if (!meta?.name) return "";
      const level = Number(option?.level) || 0;
      const detail = level > 0 ? formatEquipmentOptionDetail(option, meta, level) : "";
      const text = level > 0 ? `${meta.name}Lv${level}` : meta.name;
      return detail ? `${text}（${detail}）` : text;
    })
    .filter(Boolean);
  const optionsHtml = lines.length ? `<div class="storage-effect">${lines.join("<br>")}</div>` : "";
  return `${optionsHtml}${equipmentOptionCandidatesStorageHtml(item, context)}`;
}

function defaultAutoSellSettings() {
  return { common: false, uncommon: false };
}

function formatMissionDurationLabel(durationMs) {
  const seconds = Math.max(0, Number(durationMs) || 0) / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}秒`;
}

function ensureAutoSellSettings(target = state) {
  const defaults = defaultAutoSellSettings();
  target.autoSell = { ...defaults, ...(target.autoSell || {}) };
  target.autoSell.common = !!target.autoSell.common;
  target.autoSell.uncommon = !!target.autoSell.uncommon;
  return target.autoSell;
}

function defaultRecords() {
  return { equipment: [], enemies: {} };
}

function ensureRecords(target = state) {
  target.records = { ...defaultRecords(), ...(target.records || {}) };
  const equipment = Array.isArray(target.records.equipment) ? target.records.equipment : [];
  target.records.equipment = [...new Set(equipment.filter(Boolean))];
  target.records.enemies = Object.fromEntries(
    Object.entries(target.records.enemies || {})
      .filter(([enemyId]) => !!enemyId)
      .map(([enemyId, record]) => [enemyId, { kills: Math.max(0, Number(record?.kills) || 0) }])
  );
  return target.records;
}

function ensureDeveloperMode(target = state) {
  target.developerMode = target.developerMode === true;
  return target.developerMode;
}

function ensureGuildStats(target = state) {
  target.stats = { ...defaultGuildStats(), ...(target.stats || {}) };
  target.stats.gold = Math.max(0, Number(target.stats.gold) || 0);
  return target.stats;
}

function recordEquipment(item, target = state) {
  if (!item?.id) return false;
  const records = ensureRecords(target);
  if (records.equipment.includes(item.id)) return false;
  records.equipment.push(item.id);
  return true;
}

function recordEquippedEquipment(party, target = state) {
  for (const member of party?.members || []) {
    const equipment = ensureCharacterEquipment(member);
    for (const { key } of EQUIPMENT_SLOTS) {
      const item = storageItemFromEquipmentId(equipment?.[key]);
      if (!item?.id) continue;
      recordEquipment(item, target);
    }
  }
}

function recordEnemyKill(enemy, target = state) {
  if (!enemy?.id) return false;
  const records = ensureRecords(target);
  const current = records.enemies[enemy.id]?.kills || 0;
  records.enemies[enemy.id] = { kills: current + 1 };
  return true;
}

function wasAutoSoldDrop(item) {
  return item?.autoSold === true || (item?.autoSold == null && shouldAutoSellDrop(item));
}

function defaultParty(id, name) {
  const members = (PARTY_TEMPLATES[id] || PARTY_TEMPLATES.pt1).map((m) => createMember(m));
  return {
    id,
    name,
    members,
    hero: members[0],
    selectedArea: "plain",
    mission: null,
    dispatches: [],
    expandedDispatchIds: [],
    lastReport: null,
    stats: defaultStats(),
  };
}

function getParty(id) {
  return state.parties.find((p) => p.id === id);
}

function getArea(id) {
  return AREAS[id] || AREAS.plain;
}

function isAreaUnlocked(id) {
  const area = getArea(id);
  return !area.unlockAfter || (state.areaClears[area.unlockAfter] || 0) > 0;
}

function getUnlockHint(id) {
  const area = getArea(id);
  if (!area.unlockAfter) return "解放済";
  return `${AREAS[area.unlockAfter].name}を1回クリア`;
}

function ensureValidSelectedArea(party) {
  if (!isAreaUnlocked(party.selectedArea)) {
    party.selectedArea = AREA_ORDER.find(isAreaUnlocked) || "plain";
  }
}

function recordAreaClear(areaId) {
  state.areaClears[areaId] = (state.areaClears[areaId] || 0) + 1;
}

function shouldBossAppear(area) {
  return !!area.boss;
}

function chooseBoss(area) {
  return MONSTERS[area.boss] || MONSTERS[pick(area.monsters)];
}

function generateBattle(area, party) {
  const encounters = [];
  const normalCount = clamp(area.difficulty + roll(0, 1), 1, 4);
  const speechState = {};
  const shortcutEvents = buildShortcutExplorationEvents(party.members, area);
  const dispatchMembersSnapshot = snapshotPartyHp(party.members);

  for (let i = 0; i < normalCount; i += 1) {
    encounters.push(runEncounter(party.members, MONSTERS[pick(area.monsters)], area, speechState, party.name));
    if (party.members.every((member) => member.hp <= 0)) break;
  }

  const stoppedByDraw = encounters.at(-1)?.draw && party.members.every((member) => member.hp <= 0);
  const failedBeforeBoss =
    (party.members.every((member) => member.hp <= 0) && !stoppedByDraw) ||
    encounters.some((encounter) => !encounter.victory && !encounter.draw);
  if (!failedBeforeBoss && !stoppedByDraw) {
    encounters.push(runEncounter(party.members, chooseBoss(area), area, speechState, party.name));
  }

  const noRewards = encounters.some((encounter) => encounter.draw);
  const failed = failedBeforeBoss || encounters.some((encounter) => !encounter.victory && !encounter.draw);
  const treasureEvents = encounterExplorationEvents(encounters, "treasureFind");
  const trapEvents = encounterExplorationEvents(encounters, "trapDisarm");
  const treasureDropRolls = !noRewards && treasureEvents.length ? rollTreasureEquipmentDrops(party.members, encounters, treasureEvents.length) : [];
  const extraEquipmentDrops = treasureDropRolls.filter(Boolean);
  treasureEvents.forEach((event, index) => {
    const item = treasureDropRolls[index];
    event.text += item
      ? `<br>宝箱の中から${dropNameHtml(item)}を見つけた。${treasureRarityTagHtml(item)}`
      : "<br>中に使える物は残っていなかった。";
  });
  const trapDisarmed = trapEvents.length > 0;
  const shortcutFound = shortcutEvents.length > 0;

  return {
    encounters,
    treasureEvents,
    trapEvents,
    shortcutEvents,
    dispatchMembersSnapshot,
    extraEquipmentDrops,
    trapDisarmed,
    noRewards,
    kills: noRewards ? 0 : encounters.reduce((sum, e) => sum + e.kills, 0),
    xp: noRewards ? 0 : encounters.reduce((sum, e) => sum + e.xp, 0),
    gold: noRewards ? 0 : encounters.reduce((sum, e) => sum + e.gold, 0) + extraEquipmentDrops.reduce((sum, item) => sum + (wasAutoSoldDrop(item) ? equipmentSellGoldValue(item) : 0), 0),
    failed,
    forcedReturn: failed && party.members.every((member) => member.hp <= 0),
    shortcutFound,
  };
}

function encounterExplorationEvents(encounters, skillId) {
  return (encounters || []).flatMap((encounter) =>
    (encounter.explorationEvents || []).filter((event) => event?.skillId === skillId)
  );
}

function rollTreasureEquipmentDrops(members, encounters, count = 1) {
  const victories = (encounters || []).filter((encounter) => encounter?.victory && encounter.monster);
  return Array.from({ length: count }, () => {
    const encounter = pick(victories);
    return encounter ? rollEquipmentDrop(members, encounter.monster) : null;
  });
}

function treasureRarityTagHtml(item) {
  const rarity = normalizeRarity(item?.rarity);
  if (!["rare", "epic", "legendary", "artifact"].includes(rarity)) return "";
  return ` <span class="${rarityClassName(rarity)}">[${rarity.toUpperCase()}]</span>`;
}

function shortcutMissionReductionMs(area, rewards) {
  const durationMs = missionDurationMs(area);
  if (!rewards?.shortcutFound || durationMs <= MIN_MISSION_DURATION_MS) return 0;
  return Math.min(Math.floor(durationMs * SHORTCUT_REDUCTION_RATE), durationMs - MIN_MISSION_DURATION_MS);
}

function missionDurationMs(area) {
  if (state.developerMode) return DEVELOPER_MISSION_DURATION_MS;
  return Math.max(0, Number(area?.durationMs) || 0);
}

function battleSummary(encounter) {
  const result = encounter.draw ? "相打ち" : encounter.victory ? "討伐成功" : "撤退";
  if (encounter.draw) return `${encounter.monster.name}: ${result} / 報酬なし`;
  return `${encounter.monster.name}: ${result} / ${encounter.xp}XP / ${encounter.gold}G`;
}

function buildDeliveryBoxHtml(rewards) {
  const names = [
    ...(rewards?.encounters || []).map((encounter) => encounter?.equipmentDrop),
    ...(rewards?.extraEquipmentDrops || []),
  ]
    .filter(Boolean)
    .map((drop) => {
      const item = storageItemFromEquipment(drop) || drop;
      const suffix = wasAutoSoldDrop(drop) ? "（売却）" : "";
      return `${dropNameHtml(item)}${suffix}`;
    });
  if (!names.length) return "";
  return `今回の冒険で装備を持ち帰った。<br>納品箱：<br>${names.map((name) => `・${name}`).join("<br>")}`;
}

function buildMvpLine(party, rewards) {
  const stats = new Map(
    party.members.map((member) => [member.name, { member, score: 0 }])
  );
  const names = [...stats.keys()].sort((a, b) => b.length - a.length);
  let actorName = null;

  const addScore = (name, amount) => {
    const stat = stats.get(name);
    if (!stat || amount <= 0) return;
    stat.score += amount;
  };

  for (const encounter of rewards.encounters || []) {
    for (const event of encounter.events || []) {
      const text = event.text || "";
      const starter = names.find((name) => text.startsWith(name));
      if (starter) actorName = starter;
      else if (text.includes("の攻撃。")) actorName = null;

      const damage = text.match(/に(\d+)ダメージ/);
      if (damage && actorName) addScore(actorName, Math.ceil(Number(damage[1]) / 10));

      const healing = text.match(/HPが(\d+)回復/);
      if (healing && actorName) addScore(actorName, Math.ceil(Number(healing[1]) / 8));

      if (text.includes("を討伐") && actorName) addScore(actorName, 8);
      if (text.includes("かばった") && starter) addScore(starter, 5);
      if (text.includes("奇襲を使った") && starter) addScore(starter, 4);
      if (/(魔力障壁|集中|挑発|鉄壁|盾を構え|状態が安定|応急手当|リザラ|リザレクト)/.test(text) && starter) {
        addScore(starter, 3);
      }
      if (/(毒に侵された|猛毒化|火傷を負った|動きが鈍った)/.test(text) && actorName) {
        addScore(actorName, 4);
      }
    }
  }

  const best = [...stats.values()].sort((a, b) => b.score - a.score)[0];
  if (!best || best.score <= 0) return null;
  return `今回もっとも活躍したのは${best.member.name}だったようだ。`;
}

function reportAuthorName(party, mvpLine, returnEvents) {
  const mvpName = mvpLine?.match(/^今回もっとも活躍したのは(.+)だったようだ。$/)?.[1];
  if (mvpName) return mvpName;

  const returnSpeaker = returnEvents
    .map((event) => event.text?.split("「")[0])
    .find((name) => party.members.some((member) => member.name === name));
  if (returnSpeaker) return returnSpeaker;

  return party.members.find((member) => member.hp > 0)?.name || party.members[0]?.name || null;
}

function snapshotMembers(members) {
  return members.map((member) => ({
    id: member.id,
    hp: member.hp,
    maxHp: member.maxHp,
  }));
}

function applyMembersSnapshot(party, snapshot) {
  if (!snapshot?.length) return false;
  const byId = new Map(snapshot.map((member) => [member.id, member]));
  let changed = false;
  for (const member of party.members) {
    const snap = byId.get(member.id);
    if (!snap) continue;
    const nextHp = clamp(snap.hp, 0, member.maxHp);
    if (member.hp !== nextHp) {
      member.hp = nextHp;
      changed = true;
    }
  }
  party.hero = party.members[0];
  return changed;
}

function isShortcutEvent(event) {
  return event?.skillId === "shortcutFind";
}

function shortcutExplorationEvents(rewards) {
  return (rewards?.shortcutEvents || []).map((event) => ({
    event,
    snapshot: rewards.dispatchMembersSnapshot,
  }));
}

function dispatchExplorationEvents(rewards) {
  return [];
}

function randomDispatchEventTime(startedAt, endsAt, offset = 0) {
  const span = Math.max(1, endsAt - startedAt);
  const timestamp = startedAt + Math.floor(span * (0.22 + Math.random() * 0.62)) + offset;
  return Math.min(Math.max(startedAt + 2 + offset, timestamp), endsAt - 1);
}

function normalExplorationEvents(encounter) {
  return (encounter.explorationEvents || []).filter((event) => !isShortcutEvent(event));
}

function buildScheduledJournal(party, area, rewards, startedAt, endsAt) {
  const entries = [];
  const span = endsAt - startedAt;
  entries.push({
    id: uid("entry"),
    timestamp: startedAt + 350,
    type: "flavor",
    title: `${party.name}、${area.name}へ出発。`,
    shown: false,
  });

  shortcutExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: startedAt + 351 + eventIndex,
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  area.flavor.forEach((text, index) => {
    entries.push({
      id: uid("entry"),
      timestamp: startedAt + Math.floor(span * (0.18 + index * 0.14)),
      type: "flavor",
      title: text,
      shown: false,
    });
  });

  dispatchExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: randomDispatchEventTime(startedAt, endsAt, eventIndex),
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  rewards.encounters.forEach((encounter, index) => {
    const lastIndex = Math.max(1, rewards.encounters.length - 1);
    const ratio = 0.3 + (index / lastIndex) * 0.48;
    const battleTime = startedAt + Math.floor(span * ratio);
    if (encounter.enemy?.boss || encounter.monster?.boss) {
      const preludeTime = startedAt + Math.floor(span * Math.max(0.2, ratio - 0.08));
      entries.push({
        id: uid("entry"),
        timestamp: preludeTime,
        type: "flavor",
        title: "……空気が重い",
        membersSnapshot: encounter.startMembersSnapshot,
        shown: false,
      });
      (encounter.bossPreludeEvents || []).forEach((event, eventIndex) => {
        entries.push({
          id: uid("entry"),
          timestamp: preludeTime + eventIndex + 1,
          type: "flavor",
          title: event.text,
          membersSnapshot: encounter.startMembersSnapshot,
          shown: false,
        });
      });
    }
    const explorationEvents = normalExplorationEvents(encounter);
    explorationEvents.forEach((event, eventIndex) => {
      entries.push({
        id: uid("entry"),
        timestamp: Math.max(startedAt, battleTime - explorationEvents.length + eventIndex),
        type: "flavor",
        title: event.text,
        debug: event.debug,
        membersSnapshot: event.membersSnapshot || encounter.startMembersSnapshot,
        shown: false,
      });
    });
    entries.push({
      id: uid("entry"),
      timestamp: battleTime,
      type: "battle",
      title: `${encounter.monster.name}との戦闘記録（${encounter.draw ? "相打ち" : encounter.victory ? "勝利" : "撤退"}）`,
      monsterBoss: !!encounter.monster.boss,
      monsterRare: !!encounter.monster.rare && !encounter.monster.boss,
      battleDetail: encounter.events,
      summary: battleSummary(encounter),
      membersSnapshot: encounter.membersSnapshot,
      shown: false,
    });
  });

  entries.push({
    id: uid("entry"),
    timestamp: endsAt,
    type: "return",
    title: rewards.noRewards ? "相打ち報告（全戦闘記録▼）" : `帰還報告（全戦闘記録▼）`,
    battleDetail: rewards.encounters.flatMap((e) => e.events),
    summary: rewards.noRewards ? "相打ち / 報酬なし" : `${rewards.kills}体討伐、${rewards.gold}G、${rewards.xp}XPを獲得`,
    mvpLine: buildMvpLine(party, rewards),
    deliveryBox: buildDeliveryBoxHtml(rewards),
    membersSnapshot: rewards.encounters.at(-1)?.membersSnapshot,
    shown: false,
  });

  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

function buildScheduledJournalV2(party, area, rewards, startedAt, endsAt) {
  const entries = [];
  const span = endsAt - startedAt;
  let forcedReturnAt = endsAt;
  const encounterCount = rewards.encounters.length;
  const encounterRatios = rewards.encounters.map((_, index) => {
    const slot = (index + 1) / (encounterCount + 1);
    const jitter = (Math.random() - 0.5) * 0.12;
    return clamp(0.1 + slot * 0.75 + jitter, 0.1, 0.85);
  });
  entries.push({
    id: uid("entry"),
    timestamp: startedAt,
    type: "flavor",
    title: `${party.name}、${area.name}へ出発。`,
    shown: false,
  });

  shortcutExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: startedAt + 1 + eventIndex,
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  if (!rewards.forcedReturn) {
    area.flavor.forEach((text, index) => {
      entries.push({
        id: uid("entry"),
        timestamp: startedAt + Math.floor(span * (0.18 + index * 0.14)),
        type: "flavor",
        title: text,
        shown: false,
      });
    });
  }

  dispatchExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: randomDispatchEventTime(startedAt, endsAt, eventIndex),
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  rewards.encounters.forEach((encounter, index) => {
    const ratio = encounterRatios[index];
    const battleTime = startedAt + Math.floor(span * ratio);
    if (rewards.forcedReturn && index === rewards.encounters.length - 1) {
      forcedReturnAt = battleTime + 1;
    }
    if (encounter.enemy?.boss || encounter.monster?.boss) {
      const preludeTime = startedAt + Math.floor(span * Math.max(0.2, ratio - 0.08));
      entries.push({
        id: uid("entry"),
        timestamp: preludeTime,
        type: "flavor",
        title: "……空気が重い",
        membersSnapshot: encounter.startMembersSnapshot,
        shown: false,
      });
      (encounter.bossPreludeEvents || []).forEach((event, eventIndex) => {
        entries.push({
          id: uid("entry"),
          timestamp: preludeTime + eventIndex + 1,
          type: "flavor",
          title: event.text,
          membersSnapshot: encounter.startMembersSnapshot,
          shown: false,
        });
      });
    }
    const explorationEvents = normalExplorationEvents(encounter);
    explorationEvents.forEach((event, eventIndex) => {
      entries.push({
        id: uid("entry"),
        timestamp: Math.max(startedAt, battleTime - explorationEvents.length + eventIndex),
        type: "flavor",
        title: event.text,
        debug: event.debug,
        membersSnapshot: event.membersSnapshot || encounter.startMembersSnapshot,
        shown: false,
      });
    });
    entries.push({
      id: uid("entry"),
      timestamp: battleTime,
      type: "battle",
      title: `${encounter.monster.name}との戦闘記録（${encounter.draw ? "相打ち" : encounter.victory ? "勝利" : "撤退"}）`,
      monsterBoss: !!encounter.monster.boss,
      monsterRare: !!encounter.monster.rare && !encounter.monster.boss,
      battleDetail: encounter.events,
      summary: battleSummary(encounter),
      membersSnapshot: encounter.membersSnapshot,
      shown: false,
    });
  });

  if (rewards.forcedReturn) {
    entries.push({
      id: uid("entry"),
      timestamp: forcedReturnAt,
      type: "flavor",
      title: "全員のHPが尽き、全滅した。",
      forceReturn: true,
      shown: false,
    });
  }

  const returnTime = rewards.forcedReturn ? forcedReturnAt : endsAt;
  const returnMembersSnapshot = rewards.encounters.at(-1)?.membersSnapshot;
  const mvpLine = buildMvpLine(party, rewards);
  const returnEvents = buildReturnEvents(party.members, returnMembersSnapshot, mvpLine);
  const deliveryBox = buildDeliveryBoxHtml(rewards);
  const reportAuthor = reportAuthorName(party, mvpLine, returnEvents);
  returnEvents.forEach((event, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: Math.max(startedAt, returnTime - returnEvents.length + eventIndex),
      type: "flavor",
      title: event.text,
      membersSnapshot: returnMembersSnapshot,
      shown: false,
    });
  });

  entries.push({
    id: uid("entry"),
    timestamp: returnTime,
    type: "return",
    title: rewards.noRewards ? "相打ち報告（全戦闘記録▼）" : rewards.forcedReturn ? "全滅により強制帰還（全戦闘記録▼）" : "帰還報告（全戦闘記録▼）",
    battleDetail: rewards.encounters.flatMap((e) => e.events),
    reportAuthor,
    summary: rewards.noRewards
      ? "相打ち / 報酬なし"
      : rewards.forcedReturn
      ? `全滅により強制帰還 / ${rewards.kills}体討伐 / ${rewards.gold}G / ${rewards.xp}XP`
      : `${rewards.kills}体討伐、${rewards.gold}G、${rewards.xp}XPを獲得`,
    mvpLine,
    deliveryBox,
    membersSnapshot: rewards.encounters.at(-1)?.membersSnapshot,
    shown: false,
  });

  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

function getActiveDispatch(party) {
  return party.dispatches.find((d) => d.status === "active") || null;
}

function trimDispatches(party) {
  if (party.dispatches.length <= MAX_DISPATCH_HISTORY) return;
  const removed = party.dispatches.splice(MAX_DISPATCH_HISTORY);
  const removedIds = new Set(removed.map((d) => d.id));
  party.expandedDispatchIds = (party.expandedDispatchIds || []).filter((id) => !removedIds.has(id));
}

function revealDueEntries(party) {
  const dispatch = getActiveDispatch(party);
  if (!dispatch || !party.mission) return false;

  const now = Date.now();
  let changed = false;
  for (const entry of party.mission.journal) {
    if (entry.shown || entry.timestamp > now) continue;
    entry.shown = true;
    dispatch.entries.push({ ...entry });
    if (applyMembersSnapshot(party, entry.membersSnapshot)) {
      changed = true;
    }
    if (entry.forceReturn) {
      party.mission.failed = true;
      party.mission.endsAt = entry.timestamp;
    }
    changed = true;
  }
  return changed;
}

function applyMemberXp(member, xp, levelUps) {
  member.xp += xp;
  while (member.xp >= member.xpToNext) {
    member.xp -= member.xpToNext;
    member.level += 1;
    member.xpToNext = Math.floor(member.xpToNext * 1.35);
    syncMemberStats(member);
    member.hp = member.maxHp;
    levelUps.push({ name: member.name, level: member.level });
  }
}

function applyRewards(party, area, rewards) {
  const s = party.stats;
  ensureGuildStats().gold += rewards.gold;
  s.kills += rewards.kills;
  if (!rewards.noRewards) s.missionsCleared += 1;
  recordEnemyKills(rewards);
  if (!rewards.noRewards) storeEquipmentDrops(rewards);

  const levelUps = [];
  const xpEach = rewards.noRewards ? 0 : Math.max(1, Math.floor(rewards.xp / party.members.length));
  party.members.forEach((member) => {
    applyMemberXp(member, xpEach, levelUps);
    member.hp = member.maxHp;
  });
  party.hero = party.members[0];

  const names = [...new Set(rewards.encounters.map((e) => e.monster.name))];
  party.lastReport = {
    areaName: area.name,
    monsters: names.join("、"),
    ...rewards,
    levelUps,
  };
}

function recordEnemyKills(rewards) {
  for (const encounter of rewards?.encounters || []) {
    if (!encounter?.victory) continue;
    recordEnemyKill(encounter.monster);
  }
}

function storeEquipmentDrops(rewards) {
  if (!state.storage) state.storage = [];
  const drops = [
    ...(rewards?.encounters || []).map((encounter) => encounter?.equipmentDrop),
    ...(rewards?.extraEquipmentDrops || []),
  ];
  for (const item of drops) {
    const storedItem = storageItemFromEquipment(item);
    recordEquipment(storedItem);
    if (!item || !storedItem || wasAutoSoldDrop(item)) continue;
    state.storage.push({ ...storedItem, foundBy: item.finderName || "" });
  }
}

function findMemberById(memberId) {
  return findPartyMemberById(memberId)?.member || null;
}

function findPartyMemberById(memberId) {
  for (const party of state.parties) {
    const member = party.members.find((m) => m.id === memberId);
    if (member) return { party, member };
  }
  return null;
}

function equipStorageItem(index, memberId, targetSlot) {
  if (!state.storage?.length) return;
  const storedItem = storageItemFromEquipment(state.storage[index]);
  const found = findPartyMemberById(memberId);
  const member = found?.member;
  if (!storedItem || !member) return;

  const slot = storedItem.slot === "accessory" ? targetSlot : storedItem.slot;
  if (!isEquipmentSlot(slot)) return;
  if (storedItem.slot !== "accessory" && slot !== storedItem.slot) return;

  const equipment = ensureCharacterEquipment(member);
  const previousItem = storageItemFromEquipmentId(equipment[slot]);
  state.storage.splice(index, 1);
  equipment[slot] = hasItemInstanceData(storedItem) ? storageItemFromEquipment(storedItem) : storedItem.id;
  if (previousItem) state.storage.push(previousItem);
  syncMemberStats(member);
  storageRenderCount = -1;
  if (found.party) openDetailPartyIds.add(found.party.id);
  saveGame();
  renderAll();
}

function unequipMemberItem(memberId, slot) {
  if (!isEquipmentSlot(slot)) return;
  const found = findPartyMemberById(memberId);
  const member = found?.member;
  if (!member) return;

  const equipment = ensureCharacterEquipment(member);
  const itemId = equipment[slot];
  const removedItem = storageItemFromEquipmentId(itemId);
  if (!removedItem) return;

  equipment[slot] = null;
  if (!state.storage) state.storage = [];
  state.storage.push(removedItem);
  syncMemberStats(member);
  storageRenderCount = -1;
  if (found.party) openDetailPartyIds.add(found.party.id);
  saveGame();
  renderAll();
}

function sellStorageItem(index) {
  return sellStorageItemByIndex(index);
}

function sellStorageItemByIndex(index, { deferRender = false } = {}) {
  if (!state.storage?.length) return;
  const storedItem = storageItemFromEquipment(state.storage[index]);
  if (!storedItem || storedItem.locked) return false;

  const sellGold = equipmentSellGoldValue(storedItem);
  ensureGuildStats().gold += sellGold;
  state.storage.splice(index, 1);
  storageRenderCount = -1;
  if (!deferRender) {
    saveGame();
    renderAll();
  }
  return true;
}

function fixStorageItemOptionCandidate(index, optionId) {
  if (!state.storage?.length || typeof index !== "number") return false;
  const storedItem = storageItemFromEquipment(state.storage[index]);
  if (!storedItem) return false;
  const optionCandidates = Array.isArray(storedItem.optionCandidates) ? storedItem.optionCandidates.map((id) => String(id)) : [];
  if (!optionCandidates.includes(String(optionId))) return false;
  if (!canFixEquipmentOption(storedItem)) return false;

  const nextOptions = Array.isArray(storedItem.options) ? storedItem.options.map((option) => ({ ...option })) : [];
  nextOptions.push({ id: String(optionId), level: 1 });
  state.storage[index] = storageItemFromEquipment({
    ...storedItem,
    options: nextOptions,
    optionCandidates: [],
  });
  storageRenderCount = -1;
  saveGame();
  renderAll();
  return true;
}

function toggleStorageLock(index) {
  if (!state.storage?.length || !state.storage[index]) return;
  state.storage[index].locked = !state.storage[index].locked;
  storageRenderCount = -1;
  saveGame();
  renderAll();
}

function missionProgress(party) {
  if (!party.mission) return 0;
  const { startedAt, endsAt } = party.mission;
  const total = endsAt - startedAt;
  return total <= 0 ? 100 : clamp(((Date.now() - startedAt) / total) * 100, 0, 100);
}

function progressStage(progress) {
  if (progress <= 35) return { key: "explore", label: "探索中" };
  if (progress <= 70) return { key: "danger", label: "危険区域" };
  if (progress <= 90) return { key: "boss", label: "ボス接近" };
  return { key: "return", label: "帰還準備" };
}

function progressLabel(party) {
  if (!party.mission) return "冒険へ行く";
  const progress = Math.round(missionProgress(party));
  return `${progressStage(progress).label} ${progress}%`;
}

function applyProgressState(wrap, party) {
  const bar = wrap.querySelector(".btn-progress");
  const label = wrap.querySelector(".btn-label");
  if (!party?.mission || !bar) return;

  const progress = missionProgress(party);
  const stage = progressStage(progress);
  bar.style.width = `${progress}%`;
  bar.className = `btn-progress progress-${stage.key}`;
  if (label) label.textContent = `${stage.label} ${Math.round(progress)}%`;
}

function startMission(partyId) {
  const party = getParty(partyId);
  if (!party || party.mission) return;

  ensureValidSelectedArea(party);
  if (!isAreaUnlocked(party.selectedArea)) return;

  const area = getArea(party.selectedArea);
  party.members.forEach((member) => {
    if (member.hp <= 0) member.hp = member.maxHp;
  });
  const startMembersSnapshot = snapshotMembers(party.members);
  const rewards = generateBattle(area, party);
  const now = Date.now();
  const plannedEndsAt = now + missionDurationMs(area);
  const endsAt = plannedEndsAt - shortcutMissionReductionMs(area, rewards);
  const dispatchId = uid("dispatch");
  applyMembersSnapshot(party, startMembersSnapshot);

  party.dispatches.unshift({
    id: dispatchId,
    areaId: area.id,
    areaName: area.name,
    startedAt: now,
    endsAt,
    status: "active",
    entries: [],
  });
  trimDispatches(party);

  party.mission = {
    dispatchId,
    areaId: area.id,
    startedAt: now,
    endsAt,
    plannedEndsAt,
    rewards,
    failed: false,
    startMembersSnapshot,
    journal: buildScheduledJournalV2(party, area, rewards, now, endsAt),
  };

  party.stats.missionsStarted += 1;
  revealDueEntries(party);

  saveGame();
  renderPartyCard(party);
  renderReports();
  renderLogs();
  ensureTick();
}

function completeMission(party) {
  if (!party.mission) return;

  const area = getArea(party.mission.areaId);
  const dispatch = party.dispatches.find((d) => d.id === party.mission.dispatchId);
  revealDueEntries(party);

  if (dispatch) {
    dispatch.status = "complete";
    dispatch.endsAt = party.mission.endsAt;
    dispatch.summary = party.mission.journal.find((e) => e.type === "return")?.summary;
  }

  const missionFailed = party.mission.failed;

  if (!missionFailed && !party.mission.rewards?.noRewards) {
    recordAreaClear(area.id);
  }
  applyRewards(party, area, party.mission.rewards);
  party.mission = null;

  saveGame();
  renderPartyCard(party);
  renderReports();
  renderStages();
  renderWorldSituation();
  storageRenderCount = -1;
  renderStorage();
  renderRecordsSection();
  renderStats();
  renderLogs();
}

function processMissions() {
  let dirty = false;
  let partyDirty = false;
  for (const party of state.parties) {
    if (!party.mission) continue;
    if (revealDueEntries(party)) {
      dirty = true;
      partyDirty = true;
    }
    if (party.mission.failed) {
      completeMission(party);
    }
    else if (Date.now() >= party.mission.endsAt) {
      party.mission.failed = !!party.mission.rewards?.failed;
      completeMission(party);
    }
  }

  updateProgressBars();
  if (partyDirty) updatePartyCards();
  if (dirty) renderLogs();
  if (!state.parties.some((p) => p.mission)) stopTick();
}

function updateProgressBars() {
  document.querySelectorAll("[data-progress]").forEach((wrap) => {
    const party = getParty(wrap.dataset.progress);
    applyProgressState(wrap, party);
  });
}

function currentDispatchLabel(dispatch) {
  if (dispatch.status === "active") return `いまの派遣（${dispatch.areaName}）`;
  return `直近の派遣（${dispatch.areaName}）`;
}

function pastDispatchLabel(pastIndex, dispatch) {
  return `${pastIndex}回前の派遣（${dispatch.areaName}）`;
}

function entryButtonHtml(entry, open) {
  const monsterTag = entry.monsterBoss
    ? '<span class="enemy-tag boss-tag">[BOSS]</span>'
    : entry.monsterRare
      ? '<span class="enemy-tag rare-tag">[RARE]</span>'
      : "";
  const debug = state.developerMode && entry.debug?.length
    ? `<br><span class="log-debug">[DEBUG]</span>${entry.debug.map((line) => `<br><span class="log-debug">${line}</span>`).join("")}`
    : "";
  let title = entry.title;
  if (entry.type === "return") {
    title = title.replace(/（全戦闘記録[▼▲]）$/, "");
    title += open ? "（全戦闘記録▲）" : "（全戦闘記録▼）";
  } else if (entry.battleDetail?.length) {
    title += open ? " ▲" : " ▼";
  }
  return `<span class="time">${formatClock(entry.timestamp)}</span>${title}${debug}${monsterTag}`;
}

function renderLogEntry(entry) {
  const hasBattle = entry.battleDetail?.length > 0;
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "log-entry" +
    (entry.type === "flavor" ? " flavor" : "") +
    (entry.type === "battle" ? " battle" : "") +
    (hasBattle ? " clickable" : "");

  btn.innerHTML = entryButtonHtml(entry, false);
  li.appendChild(btn);

  if (hasBattle) {
    const detail = document.createElement("div");
    detail.className = "battle-detail";
    detail.innerHTML = entry.type === "return" && entry.reportAuthor
      ? `<p>${entry.reportAuthor}からの報告</p>`
      : "";
    const detailEvents = entry.type === "battle"
      ? entry.battleDetail.filter((ev) => !isEquipmentDropEvent(ev))
      : entry.battleDetail;
    detail.innerHTML += detailEvents
      .map((ev, index, events) => `<p class="${battleEventClass(ev, events[index - 1])}">${ev.text}</p>`)
      .join("");
    if (entry.summary && entry.type === "return") {
      detail.innerHTML += `<p><strong>合計:</strong> ${entry.summary}</p>`;
    }
    if (entry.mvpLine && entry.type === "return") {
      detail.innerHTML += `<p>${entry.mvpLine}</p>`;
    }
    li.appendChild(detail);
    if (entry.deliveryBox && entry.type === "return") {
      const delivery = document.createElement("div");
      delivery.className = "delivery-box";
      delivery.innerHTML = entry.deliveryBox;
      li.appendChild(delivery);
    }
    btn.addEventListener("click", () => {
      const open = detail.classList.toggle("open");
      btn.innerHTML = entryButtonHtml(entry, open);
    });
  }

  return li;
}

function isEquipmentDropEvent(event) {
  const text = event?.text || "";
  return /rarity-[a-z]+/.test(text) && /(見つけた|売却した|売却)/.test(text);
}

function battleEventClass(event, prevEvent = null) {
  const kind = event.kind || "";
  const classes = kind.split(/\s+/).filter(Boolean);
  if (kind === "turn-separator" || kind === "action-break") return kind;
  if (kind === "intro") return kind;
  if (classes.includes("initial-hp")) return kind;
  if ((event.text || "").includes("hp-text")) {
    const prevClasses = (prevEvent?.kind || "").split(/\s+/);
    return classes.includes("enemy-action") || prevClasses.includes("enemy-action")
      ? `${kind} enemy-action enemy-hp`.trim()
      : `${kind} ally-action ally-hp`.trim();
  }
  if (classes.includes("enemy-action")) return kind;
  return `${kind} ally-action`.trim();
}

function appendEntriesToList(ul, entries) {
  if (!entries.length) {
    ul.innerHTML = '<li class="log-empty">ログ待機中...</li>';
    return;
  }
  [...entries]
    .sort((a, b) => {
      const timeDiff = b.timestamp - a.timestamp;
      if (timeDiff) return timeDiff;
      if (a.type === "return" && b.type !== "return") return -1;
      if (b.type === "return" && a.type !== "return") return 1;
      return 0;
    })
    .forEach((entry) => ul.appendChild(renderLogEntry(entry)));
}

function renderCurrentDispatchLog(root, party) {
  const dispatch = party.dispatches[0];
  if (!dispatch) {
    root.innerHTML = '<p class="log-empty">まだログがありません</p>';
    return;
  }

  const cap = document.createElement("p");
  cap.className = "current-dispatch-label";
  cap.textContent = currentDispatchLabel(dispatch);
  if (dispatch.status === "active") cap.textContent += ` · ${formatClock(dispatch.endsAt)}まで`;
  root.appendChild(cap);

  const ul = document.createElement("ul");
  ul.className = "adventure-log";
  appendEntriesToList(ul, dispatch.entries);
  root.appendChild(ul);
}

function renderPastDispatchLog(root, party) {
  const past = party.dispatches.slice(1);
  if (!past.length) {
    root.innerHTML = '<p class="log-empty">過去の派遣はありません</p>';
    return;
  }

  past.forEach((dispatch, i) => {
    const pastIndex = i + 1;
    const expanded = (party.expandedDispatchIds || []).includes(dispatch.id);
    const group = document.createElement("div");
    group.className = "dispatch-group" + (expanded ? "" : " collapsed");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "dispatch-head";
    const sub = dispatch.summary ? dispatch.summary : `${formatClock(dispatch.endsAt)} 帰還`;
    head.innerHTML = `${pastDispatchLabel(pastIndex, dispatch)}<br><span class="sub">${sub}</span>`;
    head.addEventListener("click", () => {
      if (!party.expandedDispatchIds) party.expandedDispatchIds = [];
      const ids = party.expandedDispatchIds;
      const idx = ids.indexOf(dispatch.id);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(dispatch.id);
      saveGame();
      renderLogs();
    });

    const body = document.createElement("div");
    body.className = "dispatch-body";
    const ul = document.createElement("ul");
    ul.className = "adventure-log";
    appendEntriesToList(ul, dispatch.entries);
    body.appendChild(ul);
    group.appendChild(head);
    group.appendChild(body);
    root.appendChild(group);
  });
}

function memberChips(party) {
  return party.members
    .map((m) => {
      const hpRate = m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0;
      let hpClass = "hp-safe";
      let hpText = `${m.hp}/${m.maxHp}`;
      if (m.hp <= 0) {
        hpClass = "hp-down";
        hpText = "戦闘不能";
      } else if (hpRate < 30) {
        hpClass = "hp-danger";
      } else if (hpRate < 50) {
        hpClass = "hp-caution";
      } else if (hpRate < 70) {
        hpClass = "hp-warn";
      }
      return `<span class="member-chip ${hpClass}">
        <span class="member-name">${m.name}</span>
        <span class="member-job">${JOB_LABELS[m.job]}</span>
        <span class="member-hp">${hpText}</span>
      </span>`;
    })
    .join("");
}

function memberStatValue(value) {
  return value == null ? "-" : value;
}

function memberEquipmentBonusValue(member, key) {
  return getEquipmentBonus(member)?.[key] || 0;
}

function memberStatBreakdownText(total, bonus) {
  const sign = bonus >= 0 ? "+" : "-";
  return `${sign}${Math.abs(Number(bonus) || 0)}`;
}

function memberStatWithBreakdown(member, key) {
  const total = Number(member?.[key]);
  if (!Number.isFinite(total)) return "-";
  const bonus = memberEquipmentBonusValue(member, key);
  return `${total} <small class="member-stat-detail">(${memberStatBreakdownText(total, bonus)})</small>`;
}

function memberHpWithBreakdown(member) {
  const hp = Number(member?.hp);
  const maxHp = Number(member?.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp)) return "-";
  const bonus = memberEquipmentBonusValue(member, "maxHp");
  return `${hp} / ${maxHp} <small class="member-stat-detail">(${memberStatBreakdownText(maxHp, bonus)})</small>`;
}

function memberStatusStrikeRateText(member) {
  const rates = typeof getEquipmentStatusStrikeRates === "function"
    ? getEquipmentStatusStrikeRates(member)
    : { poison: 0, blind: 0 };
  const parts = [];
  if (rates.poison > 0) parts.push(`毒${Math.round(rates.poison * 100)}%`);
  if (rates.blind > 0) parts.push(`盲目${Math.round(rates.blind * 100)}%`);
  return parts.length ? `付与率：${parts.join(" / ")}` : "";
}

function memberFormation(member) {
  return member.formation || "中衛";
}

function equipmentSlotLabel(slot) {
  return EQUIPMENT_SLOTS.find(({ key }) => key === slot)?.label || slot;
}

function equipmentSlotKind(slot) {
  return EQUIPMENT_SLOTS.find(({ key }) => key === slot)?.kind || slot;
}

function isEquipmentSlot(slot) {
  return EQUIPMENT_SLOTS.some(({ key }) => key === slot);
}

function equipmentCandidateList(member, slot) {
  const kind = equipmentSlotKind(slot);
  const equipment = ensureCharacterEquipment(member);
  const equippedItem = storageItemFromEquipmentId(equipment[slot]);
  const hasItem = !!equippedItem;
  const candidates = (state.storage || [])
    .map((rawItem, index) => ({ item: storageItemFromEquipment(rawItem), index }))
    .filter(({ item }) => item?.slot === kind);

  const currentChoice = hasItem
    ? `<div class="equip-choice-current ${rarityClassName(equippedItem.rarity)}" aria-disabled="true">
        <span class="equip-choice-head"><strong>現在：${equipmentDisplayName(equippedItem)}</strong><span>${normalizeRarity(equippedItem.rarity)}</span></span>
        <span class="equip-choice-meta">${equipmentStatLine(equippedItem)}</span>
        ${equipmentOptionsStorageHtml(equippedItem)}
      </div>`
    : "";

  const removeChoice = hasItem
    ? `<button type="button" class="equip-choice-btn unequip-choice-btn" data-unequip="true" data-member-id="${member.id}" data-slot="${slot}">
        <span class="equip-choice-head"><strong>なし</strong><span>解除</span></span>
        <span class="equip-choice-meta">装備を外す</span>
      </button>`
    : "";

  if (!removeChoice && !candidates.length) {
    return '<p class="equipment-empty">保管庫に候補はありません</p>';
  }

  return currentChoice + removeChoice + candidates
    .map(({ item, index }) => {
      const rarity = normalizeRarity(item.rarity);
      return `<button type="button" class="equip-choice-btn ${rarityClassName(rarity)}" data-storage-index="${index}" data-member-id="${member.id}" data-slot="${slot}">
        <span class="equip-choice-head"><strong>${equipmentDisplayName(item)}</strong><span>${rarity}</span></span>
        <span class="equip-choice-meta">${equipmentStorageLine(item)}</span>
        ${equipmentOptionsStorageHtml(item)}
      </button>`;
    })
    .join("");
}

function equipmentSlotHtml(member, slot) {
  const equipment = ensureCharacterEquipment(member);
  const item = storageItemFromEquipmentId(equipment[slot]);
  const rarity = normalizeRarity(item?.rarity);
  const name = item ? `${equipmentDisplayName(item)} / ${equipmentStatLine(item)}` : "なし";
  return `<div class="member-equipment-slot">
    <button type="button" class="equip-slot-btn" data-member-id="${member.id}" data-slot="${slot}">
      <span>${equipmentSlotLabel(slot)}</span>
      <strong class="${rarityClassName(rarity)}">${name}</strong>
    </button>
    <div class="equipment-candidates" hidden>${equipmentCandidateList(member, slot)}</div>
  </div>`;
}

function skillDebugHtml(skill) {
  const debugInfo = typeof SKILL_DEBUG_INFO === "object" ? SKILL_DEBUG_INFO : {};
  const lines = skill?.debug || debugInfo[skill?.id] || [];
  if (!state.developerMode || !lines.length) return "";
  return `<div class="skill-debug"><strong>[DEBUG]</strong>${lines.map((line) => `<span>${line}</span>`).join("")}</div>`;
}

function skillDescriptionHtml(skill) {
  if (!skill?.description) return "";
  return `<div class="skill-description"><strong>説明：</strong><span>${skill.description}</span></div>`;
}

function skillTypeHtml(skill) {
  const labels = { active: "【アクティブ】", passive: "【パッシブ】" };
  const label = labels[skill?.type];
  return label ? `<span class="skill-type">${label}</span>` : "";
}

function memberSkillListHtml(member) {
  const skills = JOB_SKILLS?.[member.job] || [];
  if (!skills.length) return "";
  const settings = normalizeSkillSettings(member);
  return `<div class="member-skills">
    <div class="member-skills-title">スキル：</div>
    <ul>
      ${skills
        .map(
          (skill) =>
            `<li data-skill-id="${skill.id}">
              <label>
                <input type="checkbox" class="skill-toggle" data-member-id="${member.id}" data-skill-id="${skill.id}" ${settings[skill.id] !== false ? "checked" : ""}>
                <strong>${skill.name}</strong>
                ${skillTypeHtml(skill)}
              </label>
              ${skillDescriptionHtml(skill)}
              ${skillDebugHtml(skill)}
            </li>`
        )
        .join("")}
    </ul>
  </div>`;
}

function setMemberSkillSetting(memberId, skillId, enabled) {
  const member = findMemberById(memberId);
  if (!member || !skillId) return;
  member.skillSettings = normalizeSkillSettings(member);
  member.skillSettings[skillId] = !!enabled;
  saveGame();
}

function memberDetails(party) {
  return party.members
    .map(
      (m) => `<div class="member-detail-card ${!party.mission && m.hp <= 0 ? "down" : ""}">
        <div class="member-detail-head">
          <strong>${m.name}</strong>
          <span>${JOB_LABELS[m.job] || m.job}</span>
          <span>Lv${m.level || 1}</span>
          <span class="member-formation">【${memberFormation(m)}】</span>
        </div>
        <div class="member-stat-grid">
          <div class="member-stat-row"><span>HP</span><strong>${memberHpWithBreakdown(m)}</strong></div>
          <div class="member-stat-row"><span>ATK</span><strong>${memberStatWithBreakdown(m, "atk")}</strong></div>
          <div class="member-stat-row"><span>DEF</span><strong>${memberStatWithBreakdown(m, "def")}</strong></div>
          <div class="member-stat-row"><span>DEX</span><strong>${memberStatWithBreakdown(m, "dex")}</strong></div>
          <div class="member-stat-row"><span>LUC</span><strong>${memberStatWithBreakdown(m, "luc")}</strong></div>
        </div>
        ${memberStatusStrikeRateText(m) ? `<div class="member-stat-detail">${memberStatusStrikeRateText(m)}</div>` : ""}
        <div class="member-stat-detail">※（+）は装備とオプションの合計補正です。</div>
        ${memberSkillListHtml(m)}
        <div class="member-equipment">${EQUIPMENT_SLOTS
          .map(({ key }) => equipmentSlotHtml(m, key))
          .join("")}</div>
        ${formatActiveSetBonuses(m)}
      </div>`
    )
    .join("");
}

function areaOptions(selected) {
  return AREA_ORDER.map((id) => {
    const a = AREAS[id];
    const unlocked = isAreaUnlocked(id);
    const label = unlocked ? `${a.name}（${formatMissionDurationLabel(missionDurationMs(a))}）` : `${a.name}（${getUnlockHint(id)}）`;
    return `<option value="${id}" ${id === selected ? "selected" : ""} ${unlocked ? "" : "disabled"}>${label}</option>`;
  }).join("");
}

function updatePartyCards() {
  document.querySelectorAll("[data-party-card]").forEach((card) => {
    const party = getParty(card.dataset.partyCard);
    if (!party) return;
    const leader = party.members[0];
    const leaderHp = card.querySelector(".leader-hp");
    if (leaderHp) leaderHp.textContent = `HP ${leader.hp}/${leader.maxHp}`;
    const memberList = card.querySelector(".member-list");
    if (memberList) memberList.innerHTML = memberChips(party);
  });
}

function createPartyCard(party) {
  const on = !!party.mission;
  const area = on ? getArea(party.mission.areaId) : getArea(party.selectedArea);
  const card = document.createElement("div");
  card.className = "party-card" + (on ? " on-mission-card" : "");
  card.dataset.partyCard = party.id;
  card.innerHTML = renderPartyCardContent(party, on, area);

  if (!on) {
    card.querySelector(".area-select").addEventListener("change", (e) => {
      party.selectedArea = e.target.value;
      saveGame();
    });
  }
  const detailToggle = card.querySelector(".detail-toggle");
  const memberDetailsRoot = card.querySelector(".member-details");
  if (detailToggle && memberDetailsRoot && openDetailPartyIds.has(party.id)) {
    memberDetailsRoot.removeAttribute("hidden");
    detailToggle.setAttribute("aria-expanded", "true");
    detailToggle.textContent = "閉じる";
  }
  detailToggle?.addEventListener("click", () => {
    if (!memberDetailsRoot) return;
    const open = memberDetailsRoot.hasAttribute("hidden");
    memberDetailsRoot.toggleAttribute("hidden", !open);
    detailToggle.setAttribute("aria-expanded", String(open));
    detailToggle.textContent = open ? "閉じる" : "詳細";
    if (open) openDetailPartyIds.add(party.id);
    else openDetailPartyIds.delete(party.id);
  });
  card.querySelectorAll(".equip-slot-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const slotRoot = button.closest(".member-equipment-slot");
      const candidates = slotRoot?.querySelector(".equipment-candidates");
      if (!candidates) return;
      const open = candidates.hasAttribute("hidden");
      card.querySelectorAll(".equipment-candidates").forEach((list) => {
        if (list !== candidates) list.setAttribute("hidden", "");
      });
      candidates.toggleAttribute("hidden", !open);
    });
  });
  card.querySelectorAll(".equip-choice-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.unequip === "true") {
        unequipMemberItem(button.dataset.memberId, button.dataset.slot);
        return;
      }
      equipStorageItem(Number(button.dataset.storageIndex), button.dataset.memberId, button.dataset.slot);
    });
  });
  card.querySelectorAll(".skill-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      setMemberSkillSetting(input.dataset.memberId, input.dataset.skillId, input.checked);
    });
  });
  card.querySelector(".dispatch-btn")?.addEventListener("click", () => startMission(party.id));
  return card;
}

function renderPartyCardContent(party, on, area) {
  return `
      ${renderPartySummarySection(party, on, area)}
      ${renderMemberSection(party)}
      ${renderExpeditionSection(party, on, area)}
    `;
}

function renderPartySummarySection(party, on, area) {
  const leader = party.members?.[0] || party.hero || {};
  return `
      <div class="party-card-head">
        <h3>${party.name}</h3>
        <button type="button" class="detail-toggle" aria-expanded="false">詳細</button>
      </div>
      <div class="row"><span>隊長 ${leader.name || "-"}</span><span class="muted">Lv.${leader.level || 1}</span></div>
      <div class="row">
        <span class="${on ? "status-mission" : "status-idle"}">${on ? `${area.name}で戦闘中` : "派遣待機中"}</span>
        <span class="muted leader-hp">HP ${leader.hp ?? "-"}/${leader.maxHp ?? "-"}</span>
      </div>
    `;
}

function renderMemberSection(party) {
  return `
      <div class="member-list">${memberChips(party)}</div>
      <div class="member-details" hidden>${memberDetails(party)}</div>
    `;
}

function renderExpeditionSection(party, on, area) {
  return `
      <div class="eta">帰還予定：${on ? formatClock(party.mission.endsAt) : "--"}</div>
      <label class="field-label">派遣先</label>
      <select class="area-select" ${on ? "disabled" : ""}>${areaOptions(party.selectedArea)}</select>
      <div class="dispatch-wrap" data-progress="${party.id}">
        <button type="button" class="primary dispatch-btn ${on ? "on-mission" : ""}" ${on ? "disabled" : ""}>
          <span class="btn-progress ${on ? `progress-${progressStage(missionProgress(party)).key}` : ""}" style="width:${on ? missionProgress(party) : 0}%"></span>
          <span class="btn-label">${progressLabel(party)}</span>
        </button>
      </div>
    `;
}

function renderPartyCard(party) {
  const current = document.querySelector(`[data-party-card="${party.id}"]`);
  const next = createPartyCard(party);
  if (current) current.replaceWith(next);
  else $("parties-root").appendChild(next);
}

function renderParties() {
  const root = $("parties-root");
  if (!root) return;
  root.innerHTML = "";

  for (const party of state.parties) {
    root.appendChild(createPartyCard(party));
  }
}

function renderPartySection() {
  renderParties();
}

function updateDeveloperButton() {
  const button = $("developer-btn");
  if (!button) return;
  button.classList.toggle("active", !!state.developerMode);
  button.setAttribute("aria-pressed", String(!!state.developerMode));
}

function toggleDeveloperMode() {
  state.developerMode = !state.developerMode;
  saveGame();
  updateDeveloperButton();
  renderPartySection();
}

function renderReports() {
  const root = $("reports-root");
  if (!root) return;
  root.innerHTML = state.parties
    .map((p) => {
      const r = p.lastReport;
      const body = r
        ? `<strong>${p.name}</strong>が<strong>${r.areaName}</strong>から帰還。<br>${r.monsters} など <strong>${r.kills}</strong> 体、<strong>${r.gold}</strong> G、<strong>${r.xp}</strong> XP` +
          (r.levelUps?.length ? ` → ${r.levelUps.map((u) => `${u.name} Lv.${u.level}`).join("、")}` : "")
        : "まだ帰還していません";
      return `<div class="sub-panel"><h3>${p.name}</h3><p class="report">${body}</p></div>`;
    })
    .join("");
}

function renderReportSection() {
  renderReports();
}

function renderStats() {
  const root = $("stats-root");
  if (!root) return;
  const guildGold = ensureGuildStats().gold;
  const guildPanel = `<div class="sub-panel"><h3>ギルド資金</h3>
        <div class="stats">
          <div class="stat-cell"><div class="label">ゴールド</div>${guildGold} G</div>
        </div></div>`;
  const partyPanels = state.parties
    .map((p) => {
      const s = p.stats;
      return `<div class="sub-panel"><h3>${p.name}</h3>
        <div class="stats">
          <div class="stat-cell"><div class="label">討伐</div>${s.kills} 体</div>
          <div class="stat-cell"><div class="label">派遣</div>${s.missionsStarted} 回</div>
          <div class="stat-cell"><div class="label">完了</div>${s.missionsCleared} 回</div>
        </div></div>`;
    })
    .join("");
  root.innerHTML = guildPanel + partyPanels;
}

function renderStatsSection() {
  renderStats();
}

function storageGroupKey(item, fallback) {
  if (typeof fallback === "string" && fallback.startsWith("equipped-")) return fallback;
  if (item?.options?.length || item?.fixedOptions?.length || item?.optionCandidates?.length) return `optioned-${fallback}`;
  if (item?.locked) return `locked-${fallback}`;
  if (Number(item?.plus) > 0 || Number(item?.enhance) > 0) {
    return `${item?.id || "item"}:plus-${Number(item?.plus) || 0}:enhance-${Number(item?.enhance) || 0}`;
  }
  return item?.id || `item-${fallback}`;
}

function rarityRank(rarity) {
  return ["common", "uncommon", "rare", "epic", "legendary", "artifact"].indexOf(normalizeRarity(rarity));
}

function storageSlotRank(slot) {
  const index = EQUIPMENT_SLOTS.findIndex(({ key, kind }) => key === slot || kind === slot);
  return index >= 0 ? index : EQUIPMENT_SLOTS.length;
}

function compareStorageGroups(a, b) {
  if (storageSortMode === "rarity") {
    return rarityRank(b.item.rarity) - rarityRank(a.item.rarity) || b.latestIndex - a.latestIndex;
  }
  if (storageSortMode === "type") {
    return storageSlotRank(a.item.slot) - storageSlotRank(b.item.slot) || a.item.name.localeCompare(b.item.name, "ja");
  }
  if (storageSortMode === "name") {
    return a.item.name.localeCompare(b.item.name, "ja") || b.latestIndex - a.latestIndex;
  }
  return b.latestIndex - a.latestIndex;
}

function storageFilterMatches(item) {
  if (storageFilterMode === "weapon") return item?.slot === "weapon";
  if (storageFilterMode === "armor") return item?.slot === "armor";
  if (storageFilterMode === "accessory") return item?.slot === "accessory";
  if (storageFilterMode === "artifact") return normalizeRarity(item?.rarity) === "artifact";
  return true;
}

function filteredStorageEntries(items) {
  return [
    ...items
      .map((rawItem, index) => ({ rawItem, storageIndex: index, item: storageItemFromEquipment(rawItem) }))
      .filter(({ item }) => item && storageFilterMatches(item)),
    ...equippedStorageEntries().filter(({ item }) => item && storageFilterMatches(item)),
  ];
}

function equippedStorageEntries() {
  const entries = [];
  for (const party of state.parties || []) {
    for (const member of party.members || []) {
      const equipment = ensureCharacterEquipment(member);
      for (const { key: slot } of EQUIPMENT_SLOTS) {
        const item = storageItemFromEquipmentId(equipment?.[slot]);
        if (!item) continue;
        entries.push({
          item,
          storageIndex: `equipped-${member.id}-${slot}`,
          equippedBy: member.name,
          equippedMemberId: member.id,
          equippedSlot: slot,
        });
      }
    }
  }
  return entries;
}

function storageCountHtml(items) {
  const lockedCount = items.filter((item) => !!item?.locked).length;
  return `<div class="storage-counts">
    <span>装備保管：${items.length}</span>
    <span>保護：${lockedCount}</span>
  </div>`;
}

function storageFilterButton(value, label) {
  return `<button type="button" class="storage-filter-btn ${storageFilterMode === value ? "active" : ""}" data-storage-filter="${value}">${label}</button>`;
}

function isStorageEntrySelectable(entry) {
  return typeof entry?.index === "number" && !entry?.locked && !entry?.equippedBy;
}

function storageGroupSelectionId(group) {
  return storageGroupKey(group?.item, group?.entries?.[0]?.index);
}

function selectedStorageSellCount(visibleGroups) {
  return visibleGroups
    .filter((group) => selectedStorageGroups.has(storageGroupSelectionId(group)))
    .reduce((sum, group) => sum + group.entries.filter(isStorageEntrySelectable).length, 0);
}

function syncSelectedStorageGroups(visibleGroups) {
  const validIds = new Set(
    visibleGroups
      .filter((group) => group.entries.some(isStorageEntrySelectable))
      .map(storageGroupSelectionId)
  );
  [...selectedStorageGroups].forEach((id) => {
    if (!validIds.has(id)) selectedStorageGroups.delete(id);
  });
}

function cancelStorageBulkSellMode() {
  storageBulkSellMode = false;
  selectedStorageGroups.clear();
}

function storageEntryIndex(entry) {
  return typeof entry?.storageIndex === "number" ? entry.storageIndex : entry?.index;
}

function storageEntryLocked(entry) {
  return !!entry?.rawItem?.locked || !!entry?.locked;
}

function storageFusionTargetEntry(visibleEntries) {
  return visibleEntries.find((entry) => String(storageEntryIndex(entry)) === String(selectedStorageFusionTargetIndex)) || null;
}

function currentStorageFusionTargetEntry() {
  return storageFusionTargetEntry(filteredStorageEntries(state.storage || []));
}

function isStorageFusionEntrySelectable(entry) {
  const item = entry?.item;
  return (
    typeof storageEntryIndex(entry) === "number" &&
    !entry?.equippedBy &&
    !Number(item?.enhance) &&
    normalizeRarity(item?.rarity) !== "artifact" &&
    Math.max(0, Number(item?.plus) || 0) < 20
  );
}

function isStorageFusionMaterialEntrySelectable(entry, itemId) {
  const item = entry?.item;
  return (
    typeof storageEntryIndex(entry) === "number" &&
    !storageEntryLocked(entry) &&
    !entry?.equippedBy &&
    item?.id === itemId &&
    !Number(item?.enhance) &&
    normalizeRarity(item?.rarity) !== "artifact"
  );
}

function hasOptionedStorageFusionMaterial(targetEntry) {
  const itemId = targetEntry?.item?.id;
  if (!itemId) return false;
  return filteredStorageEntries(state.storage || [])
    .some((entry) =>
      isStorageFusionMaterialEntrySelectable(entry, itemId) &&
      storageEntryIndex(entry) !== storageEntryIndex(targetEntry) &&
      Array.isArray(entry.item?.options) &&
      entry.item.options.length > 0
    );
}

function isStorageFusionTargetEntrySelectable(entry) {
  return isStorageFusionEntrySelectable(entry);
}

function storageFusionRequiredCount(targetEntry) {
  const plus = Math.max(0, Number(targetEntry?.item?.plus) || 0);
  return plus >= 10 ? 5 : 3;
}

function storageFusionGoldCost(targetEntry) {
  const nextPlus = Math.max(0, Number(targetEntry?.item?.plus) || 0) + 1;
  return nextPlus * 100;
}

function selectedStorageFusionMaterialCount(visibleEntries, targetEntry) {
  const targetItemId = targetEntry?.item?.id;
  if (!targetItemId) return 0;
  return visibleEntries.filter((entry) =>
    selectedStorageFusionMaterialGroupIds.has(String(storageEntryIndex(entry))) &&
    isStorageFusionMaterialEntrySelectable(entry, targetItemId) &&
    storageEntryIndex(entry) !== storageEntryIndex(targetEntry)
  ).length;
}

function syncSelectedStorageFusionMaterials(visibleEntries, targetEntry) {
  if (!targetEntry) {
    selectedStorageFusionMaterialGroupIds.clear();
    return;
  }
  const validIds = new Set(
    visibleEntries
      .filter((entry) =>
        isStorageFusionMaterialEntrySelectable(entry, targetEntry.item.id) &&
        storageEntryIndex(entry) !== storageEntryIndex(targetEntry)
      )
      .map((entry) => String(storageEntryIndex(entry)))
  );
  [...selectedStorageFusionMaterialGroupIds].forEach((id) => {
    if (!validIds.has(id)) selectedStorageFusionMaterialGroupIds.delete(id);
  });
}

function selectedStorageFusionUsesOptionedMaterials(visibleEntries, targetEntry) {
  const targetItemId = targetEntry?.item?.id;
  if (!targetItemId) return false;
  return visibleEntries.some((entry) =>
    selectedStorageFusionMaterialGroupIds.has(String(storageEntryIndex(entry))) &&
    isStorageFusionMaterialEntrySelectable(entry, targetItemId) &&
    storageEntryIndex(entry) !== storageEntryIndex(targetEntry) &&
    Array.isArray(entry.item?.options) &&
    entry.item.options.length > 0
  );
}

function canAffordStorageFusion(targetEntry) {
  const gold = ensureGuildStats().gold;
  return gold >= storageFusionGoldCost(targetEntry);
}

function isStorageFusionTargetReady(targetEntry, visibleEntries = []) {
  if (!isStorageFusionTargetEntrySelectable(targetEntry)) return false;
  const requiredCount = storageFusionRequiredCount(targetEntry);
  const materialCount = selectedStorageFusionMaterialCount(visibleEntries, targetEntry);
  return materialCount >= requiredCount && canAffordStorageFusion(targetEntry);
}

function cancelStorageFusionMode() {
  storageFusionMode = false;
  selectedStorageFusionTargetIndex = null;
  selectedStorageFusionMaterialGroupIds.clear();
}

function isEquipmentOptionMilestone(plus) {
  return [3, 6, 9].includes(Math.max(0, Number(plus) || 0));
}

function equipmentMilestoneOptionPool(item) {
  const excluded = new Set([
    ...((Array.isArray(item?.fixedOptions) ? item.fixedOptions : []).map((id) => String(id))),
    ...((Array.isArray(item?.optionCandidates) ? item.optionCandidates : []).map((id) => String(id))),
    ...((Array.isArray(item?.options) ? item.options : []).map((option) => String(option?.id)).filter(Boolean)),
  ]);
  return Object.keys(OPTION_MASTER || {}).filter((id) => !excluded.has(String(id)));
}

function rollEquipmentMilestoneCandidates(item, count = 3) {
  const pool = [...equipmentMilestoneOptionPool(item)];
  const results = [];
  const limit = Math.max(0, Number(count) || 0);
  while (pool.length > 0 && results.length < limit) {
    const index = roll(0, pool.length - 1);
    const [picked] = pool.splice(index, 1);
    if (picked) results.push(picked);
  }
  return results;
}

function handleEquipmentOptionMilestone(item) {
  const plus = Math.max(0, Number(item?.plus) || 0);
  if (!isEquipmentOptionMilestone(plus)) return;
  const usedSlots =
    (Array.isArray(item?.fixedOptions) ? item.fixedOptions.length : 0) +
    (Array.isArray(item?.options) ? item.options.length : 0);
  const remainingSlots = Math.max(0, 3 - usedSlots);
  if (remainingSlots <= 0) return;
  const nextCandidates = rollEquipmentMilestoneCandidates(item, remainingSlots);
  if (nextCandidates.length) {
    item.optionCandidates = [
      ...((Array.isArray(item?.optionCandidates) ? item.optionCandidates : []).map((id) => String(id))),
      ...nextCandidates,
    ];
  }
  console.log("[equipment-option-milestone]", {
    id: item?.id || null,
    plus,
    fixedOptions: Array.isArray(item?.fixedOptions) ? [...item.fixedOptions] : [],
    optionCandidates: Array.isArray(item?.optionCandidates) ? [...item.optionCandidates] : [],
  });
}

function fuseSelectedStorageGroup(visibleEntries) {
  const targetEntry = storageFusionTargetEntry(visibleEntries);
  if (!targetEntry || !isStorageFusionTargetReady(targetEntry, visibleEntries)) return;
  const requiredCount = storageFusionRequiredCount(targetEntry);
  const goldCost = storageFusionGoldCost(targetEntry);
  const guildStats = ensureGuildStats();
  const targetIndex = storageEntryIndex(targetEntry);
  if (typeof targetIndex !== "number") return;
  const materialIndices = visibleEntries
    .filter((entry) =>
      selectedStorageFusionMaterialGroupIds.has(String(storageEntryIndex(entry))) &&
      isStorageFusionMaterialEntrySelectable(entry, targetEntry.item.id) &&
      storageEntryIndex(entry) !== targetIndex
    )
    .map((entry) => storageEntryIndex(entry))
    .filter((index) => typeof index === "number")
    .slice(0, requiredCount);
  if (materialIndices.length < requiredCount) return;

  const baseItem = storageItemFromEquipment(state.storage[targetIndex]);
  if (!baseItem) return;
  if (Number(guildStats.gold) < goldCost) return;

  const nextPlus = Math.max(0, Number(baseItem.plus) || 0) + 1;
  state.storage[targetIndex] = storageItemFromEquipment({
    ...baseItem,
    plus: nextPlus,
    locked: !!baseItem.locked,
  });
  handleEquipmentOptionMilestone(state.storage[targetIndex]);
  materialIndices.sort((a, b) => b - a).forEach((index) => {
    state.storage.splice(index, 1);
  });
  guildStats.gold -= goldCost;
  storageFusionMessage = `${equipmentDisplayName({ ...baseItem, plus: nextPlus })} を作成した`;
  selectedStorageFusionTargetIndex = null;
  selectedStorageFusionMaterialGroupIds.clear();
  storageRenderCount = -1;
  saveGame();
  renderAll();
}

function sellSelectedStorageGroups(visibleGroups) {
  const selectedEntries = visibleGroups
    .filter((group) => selectedStorageGroups.has(storageGroupSelectionId(group)))
    .flatMap((group) => group.entries.filter(isStorageEntrySelectable));
  if (!selectedEntries.length) return;
  if (!confirm(`${selectedEntries.length}個売却しますか？`)) return;

  const indices = selectedEntries
    .map((entry) => entry.index)
    .filter((index) => typeof index === "number")
    .sort((a, b) => b - a);
  indices.forEach((index) => {
    sellStorageItemByIndex(index, { deferRender: true });
  });
  selectedStorageGroups.clear();
  storageRenderCount = -1;
  saveGame();
  renderAll();
}

function renderStorageLegacy() {
  const root = $("storage-root");
  if (!root) return;
  const items = state.storage || [];
  if (items.length === storageRenderCount) return;
  storageRenderCount = items.length;
  if (!items.length) {
    root.innerHTML = '<p class="log-empty">保管中の装備はありません</p>';
    return;
  }

  const groups = [];
  const groupByKey = new Map();
  items.forEach((rawItem, index) => {
    const item = storageItemFromEquipment(rawItem);
    if (!item) return;
    const locked = !!item.locked;
    const key = `${item.id || index}:${locked ? "locked" : "free"}`;
    let group = groupByKey.get(key);
    if (!group) {
      group = { item, index, count: 0, locked };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.count += 1;
  });

  root.innerHTML = `
    <ul class="storage-list">
      ${groups
        .map(({ item, index, count, locked }) => {
          const rarity = normalizeRarity(item?.rarity);
          const name = equipmentDisplayName(item);
          return `<li>
            <div class="storage-info">
              <div class="storage-head">
                <span class="storage-item ${rarityClassName(rarity)}">${name}${count > 1 ? ` ×${count}` : ""}</span>
                ${locked ? '<span class="storage-lock-label">★ 保護中</span>' : ""}
              </div>
              <div class="storage-effect">${equipmentStorageLine(item)}</div>
              ${equipmentOptionsStorageHtml(item, { storageIndex: index })}
            </div>
            <div class="storage-actions">
              <button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>
              <button type="button" class="storage-sell-btn" data-storage-index="${index}" ${locked ? "disabled" : ""}>売却</button>
            </div>
          </li>`;
        })
        .join("")}
    </ul>
  `;

  root.querySelectorAll(".storage-sell-btn").forEach((button) => {
    button.addEventListener("click", () => {
      sellStorageItem(Number(button.dataset.storageIndex));
    });
  });
  root.querySelectorAll(".storage-lock-btn").forEach((button) => {
    button.addEventListener("click", () => {
      toggleStorageLock(Number(button.dataset.storageIndex));
    });
  });
}

function storageSortOptionsHtml() {
  const autoSell = ensureAutoSellSettings();
  return `<div class="storage-controls">
    <button type="button" class="storage-organize-btn" data-storage-filter-toggle aria-expanded="${storageFilterOpen}">整理</button>
    <button type="button" class="storage-organize-btn" data-storage-auto-sell-toggle aria-expanded="${storageAutoSellOpen}">自動売却</button>
    <label>並び替え
      <select class="storage-sort-select">
        <option value="new" ${storageSortMode === "new" ? "selected" : ""}>新しい順</option>
        <option value="rarity" ${storageSortMode === "rarity" ? "selected" : ""}>rarity順</option>
        <option value="type" ${storageSortMode === "type" ? "selected" : ""}>種類順</option>
        <option value="name" ${storageSortMode === "name" ? "selected" : ""}>名前順</option>
      </select>
    </label>
    <div class="storage-popover storage-filters" ${storageFilterOpen ? "" : "hidden"} aria-label="フィルター">
        ${storageFilterButton("all", "すべて")}
        ${storageFilterButton("weapon", "武器")}
        ${storageFilterButton("armor", "防具")}
        ${storageFilterButton("accessory", "装飾")}
        ${storageFilterButton("artifact", "アーティファクト")}
    </div>
    <div class="storage-popover storage-auto-sell" ${storageAutoSellOpen ? "" : "hidden"} aria-label="自動売却設定">
      <label><input type="checkbox" data-auto-sell="common" ${autoSell.common ? "checked" : ""}> common</label>
      <label><input type="checkbox" data-auto-sell="uncommon" ${autoSell.uncommon ? "checked" : ""}> uncommon</label>
    </div>
  </div>`;
}

function storageBulkSellHtml(visibleGroups) {
  const count = selectedStorageSellCount(visibleGroups);
  if (storageFusionMode) return "";
  if (!storageBulkSellMode) {
    return '<button type="button" class="storage-bulk-sell-btn" data-storage-bulk-sell-toggle>選択売却</button>';
  }
  return `<div class="storage-bulk-sell-actions">
    <button type="button" class="storage-bulk-sell-btn" data-storage-bulk-sell ${count ? "" : "disabled"}>選択した装備を売却${count ? ` (${count})` : ""}</button>
    <button type="button" class="storage-bulk-cancel-btn" data-storage-bulk-cancel>キャンセル</button>
  </div>`;
}

function storageFusionHtml(visibleEntries) {
  if (storageBulkSellMode) return "";
  const selectedEntry = storageFusionTargetEntry(visibleEntries);
  if (!storageFusionMode) {
    return '<button type="button" class="storage-bulk-sell-btn" data-storage-fusion-toggle>装備合成</button>';
  }
  const requiredCount = selectedEntry ? storageFusionRequiredCount(selectedEntry) : 3;
  const goldCost = selectedEntry ? storageFusionGoldCost(selectedEntry) : 100;
  const selectedMaterialCount = selectedEntry ? selectedStorageFusionMaterialCount(visibleEntries, selectedEntry) : 0;
  const materialNote = selectedEntry && selectedStorageFusionUsesOptionedMaterials(visibleEntries, selectedEntry)
    ? '<span class="muted">※OP付き装備も素材になります</span>'
    : "";
  const targetNote = selectedEntry
    ? `<span class="muted">STEP2 素材を選択 (${selectedMaterialCount}/${requiredCount})</span><span class="muted"><span class="storage-fusion-badge">育成対象</span>${equipmentDisplayName(selectedEntry.item)} を育成対象に選択中</span>`
    : '<span class="muted">STEP1 強化したい装備を1本選択</span>';
  return `<div class="storage-bulk-sell-actions">
    <button type="button" class="storage-bulk-sell-btn" data-storage-fusion-run ${selectedEntry && isStorageFusionTargetReady(selectedEntry, visibleEntries) ? "" : "disabled"}>合成 (${selectedMaterialCount}/${requiredCount} / ${goldCost}G)</button>
    <button type="button" class="storage-bulk-cancel-btn" data-storage-fusion-cancel>キャンセル</button>
    ${targetNote}
    ${materialNote}
  </div>`;
}

function storageFusionTargetPreviewHtml(entry) {
  const item = entry?.item;
  if (!item) return "";
  const locked = storageEntryLocked(entry);
  const equippedBy = entry?.equippedBy;
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  return `<div class="storage-fusion-section">
    <div class="storage-fusion-section-title">育成対象</div>
    <ul class="storage-list">
      <li class="storage-fusion-target-preview">
        <div class="storage-info">
          <div class="storage-head">
            <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : ""}</span>
            ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
            <span class="storage-fusion-badge">育成対象</span>
          </div>
          <div class="storage-effect">${equipmentStorageLine(item)}</div>
          ${equipmentOptionsStorageHtml(item, { storageIndex: storageEntryIndex(entry) })}
        </div>
        <div class="storage-actions">
          <button type="button" class="storage-fusion-change-btn" data-storage-fusion-target-reset>変更</button>
        </div>
      </li>
    </ul>
  </div>`;
}

function storageHeaderHtml(items, visibleGroups = [], visibleEntries = []) {
  const messageHtml = storageFusionMessage ? `<span class="muted">${storageFusionMessage}</span>` : "";
  return `<div class="storage-toolbar">${storageCountHtml(items)}${storageSortOptionsHtml()}${storageBulkSellHtml(visibleGroups)}${storageFusionHtml(visibleEntries)}${messageHtml}</div>`;
}

function storageGroups(entries) {
  const groups = [];
  const groupByKey = new Map();
  entries.forEach(({ item, storageIndex, equippedBy, equippedMemberId, equippedSlot }) => {
    if (!item) return;
    const key = storageGroupKey(item, storageIndex);
    let group = groupByKey.get(key);
    if (!group) {
      group = { item, count: 0, entries: [], latestIndex: typeof storageIndex === "number" ? storageIndex : -1 };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.count += 1;
    if (typeof storageIndex === "number") group.latestIndex = Math.max(group.latestIndex, storageIndex);
    group.entries.push({ item, index: storageIndex, locked: !!item.locked, equippedBy, equippedMemberId, equippedSlot });
  });
  return groups.sort(compareStorageGroups);
}

function storageGroupHtml(group) {
  const { item, count, entries } = group;
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  const index = entries[0]?.index;
  const locked = !!entries[0]?.locked;
  const equippedEntry = entries.find((entry) => entry.equippedBy);
  const equippedBy = equippedEntry?.equippedBy;
  const canSell = typeof index === "number" && !equippedBy && !locked;
  const selectableEntries = entries.filter(isStorageEntrySelectable);
  const selectionId = storageGroupSelectionId(group);
  const selectable = selectableEntries.length > 0;
  const checked = selectable && selectedStorageGroups.has(selectionId);
  const checkboxHtml = storageBulkSellMode
    ? `<label class="storage-select">
      <input type="checkbox" class="storage-select-checkbox" data-storage-select="${selectionId}" ${checked ? "checked" : ""} ${selectable ? "" : "disabled"}>
    </label>`
    : "";
  return `<li>
    ${checkboxHtml}
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : count > 1 ? ` ×${count}` : ""}</span>
        ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
      </div>
      <div class="storage-effect">${equipmentStorageLine(item)}</div>
      ${equipmentOptionsStorageHtml(item, { storageIndex: index })}
    </div>
    <div class="storage-actions">
      ${typeof index === "number" ? `<button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>` : ""}
      ${equippedEntry ? `<button type="button" class="storage-unequip-btn" data-member-id="${equippedEntry.equippedMemberId}" data-slot="${equippedEntry.equippedSlot}">装備解除</button>` : ""}
      <button type="button" class="storage-sell-btn" data-storage-index="${index}" ${canSell ? "" : "disabled"}>売却</button>
    </div>
  </li>`;
}

function storageFusionEntryHtml(entry) {
  const item = entry?.item;
  if (!item) return "";
  const index = storageEntryIndex(entry);
  const locked = storageEntryLocked(entry);
  const equippedBy = entry?.equippedBy;
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  const selectionId = String(index);
  const targetEntry = currentStorageFusionTargetEntry();
  const targetChecked = selectedStorageFusionTargetIndex === selectionId;
  const materialSelectable = !!targetEntry &&
    isStorageFusionMaterialEntrySelectable(entry, targetEntry.item.id) &&
    index !== storageEntryIndex(targetEntry);
  const materialChecked = materialSelectable && selectedStorageFusionMaterialGroupIds.has(selectionId);
  const checkboxHtml = targetEntry
    ? `<label class="storage-select">
      <input type="checkbox" class="storage-select-checkbox" data-storage-fusion-material="${selectionId}" ${materialChecked ? "checked" : ""} ${materialSelectable ? "" : "disabled"}>
    </label>`
    : `<label class="storage-select">
      <input type="checkbox" class="storage-select-checkbox" data-storage-fusion-target="${selectionId}" ${targetChecked ? "checked" : ""} ${isStorageFusionTargetEntrySelectable(entry) ? "" : "disabled"}>
    </label>`;
  const fusionLabel = targetChecked
    ? '<span class="storage-fusion-badge">育成対象</span>'
    : materialChecked
      ? '<span class="storage-fusion-badge">素材</span>'
      : "";
  const canSell = typeof index === "number" && !equippedBy && !locked;
  return `<li>
    ${checkboxHtml}
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : ""}</span>
        ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
        ${fusionLabel}
      </div>
      <div class="storage-effect">${equipmentStorageLine(item)}</div>
      ${equipmentOptionsStorageHtml(item, { storageIndex: index })}
    </div>
    <div class="storage-actions">
      ${typeof index === "number" ? `<button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>` : ""}
      ${entry?.equippedMemberId ? `<button type="button" class="storage-unequip-btn" data-member-id="${entry.equippedMemberId}" data-slot="${entry.equippedSlot}">装備解除</button>` : ""}
      <button type="button" class="storage-sell-btn" data-storage-index="${index}" ${canSell ? "" : "disabled"}>売却</button>
    </div>
  </li>`;
}

function bindStorageEvents(root) {
  root.querySelector("[data-storage-filter-toggle]")?.addEventListener("click", () => {
    storageFilterOpen = !storageFilterOpen;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-auto-sell-toggle]")?.addEventListener("click", () => {
    storageAutoSellOpen = !storageAutoSellOpen;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll(".storage-filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      storageFilterMode = button.dataset.storageFilter || "all";
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelector(".storage-sort-select")?.addEventListener("change", (e) => {
    storageSortMode = e.target.value;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll("[data-auto-sell]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.autoSell;
      if (!["common", "uncommon"].includes(key)) return;
      ensureAutoSellSettings()[key] = input.checked;
      storageRenderCount = -1;
      saveGame();
      renderStorage();
    });
  });
  root.querySelectorAll("[data-storage-option-fix]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.storageOptionFix);
      const optionId = button.dataset.optionId;
      if (!optionId) return;
      fixStorageItemOptionCandidate(index, optionId);
    });
  });
  root.querySelectorAll(".storage-select-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      if (storageFusionMode) {
        const targetId = input.dataset.storageFusionTarget;
        if (targetId) {
          selectedStorageFusionTargetIndex = input.checked ? Number(targetId) : null;
          selectedStorageFusionMaterialGroupIds.clear();
          storageRenderCount = -1;
          renderStorage();
          return;
        }
        const materialId = input.dataset.storageFusionMaterial;
        if (!materialId) return;
        if (input.checked) selectedStorageFusionMaterialGroupIds.add(String(materialId));
        else selectedStorageFusionMaterialGroupIds.delete(String(materialId));
        storageRenderCount = -1;
        renderStorage();
        return;
      }
      const selectionId = input.dataset.storageSelect;
      if (!selectionId) return;
      if (input.checked) selectedStorageGroups.add(selectionId);
      else selectedStorageGroups.delete(selectionId);
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelector("[data-storage-bulk-sell-toggle]")?.addEventListener("click", () => {
    storageBulkSellMode = true;
    cancelStorageFusionMode();
    selectedStorageGroups.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-bulk-sell]")?.addEventListener("click", () => {
    const visibleGroups = storageGroups(filteredStorageEntries(state.storage || []));
    sellSelectedStorageGroups(visibleGroups);
  });
  root.querySelector("[data-storage-bulk-cancel]")?.addEventListener("click", () => {
    cancelStorageBulkSellMode();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-fusion-toggle]")?.addEventListener("click", () => {
    storageFusionMode = true;
    cancelStorageBulkSellMode();
    selectedStorageFusionTargetIndex = null;
    selectedStorageFusionMaterialGroupIds.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-fusion-run]")?.addEventListener("click", () => {
    const visibleEntries = filteredStorageEntries(state.storage || []);
    fuseSelectedStorageGroup(visibleEntries);
  });
  root.querySelector("[data-storage-fusion-target-reset]")?.addEventListener("click", () => {
    selectedStorageFusionTargetIndex = null;
    selectedStorageFusionMaterialGroupIds.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-fusion-cancel]")?.addEventListener("click", () => {
    cancelStorageFusionMode();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll(".storage-sell-btn").forEach((button) => {
    button.addEventListener("click", () => {
      sellStorageItem(Number(button.dataset.storageIndex));
    });
  });
  root.querySelectorAll(".storage-unequip-btn").forEach((button) => {
    button.addEventListener("click", () => {
      unequipMemberItem(button.dataset.memberId, button.dataset.slot);
    });
  });
  root.querySelectorAll(".storage-lock-btn").forEach((button) => {
    button.addEventListener("click", () => {
      toggleStorageLock(Number(button.dataset.storageIndex));
    });
  });
}

function renderStorage() {
  const root = $("storage-root");
  if (!root) return;
  const items = state.storage || [];
  const autoSell = ensureAutoSellSettings();
  const equippedKey = equippedStorageEntries().map(({ storageIndex, item }) => `${storageIndex}:${item.id}`).join(",");
  const visibleEntries = filteredStorageEntries(items);
  const visibleGroups = storageGroups(visibleEntries);
  const fusionTargetEntry = storageFusionTargetEntry(visibleEntries);
  syncSelectedStorageGroups(visibleGroups);
  syncSelectedStorageFusionMaterials(visibleEntries, fusionTargetEntry);
  const fusionDisplayEntries = storageFusionMode
    ? fusionTargetEntry
      ? visibleEntries.filter((entry) =>
          isStorageFusionMaterialEntrySelectable(entry, fusionTargetEntry.item.id) &&
          storageEntryIndex(entry) !== storageEntryIndex(fusionTargetEntry)
        )
      : visibleEntries.filter(isStorageFusionTargetEntrySelectable)
    : [];
  const selectedKey = [...selectedStorageGroups].sort().join(",");
  const fusionMaterialKey = [...selectedStorageFusionMaterialGroupIds].sort().join(",");
  const renderKey = `${items.length}:${storageSortMode}:${storageFilterMode}:${autoSell.common}:${autoSell.uncommon}:${storageFilterOpen}:${storageAutoSellOpen}:${equippedKey}:${storageBulkSellMode}:${storageFusionMode}:${selectedKey}:${selectedStorageFusionTargetIndex ?? ""}:${fusionMaterialKey}`;
  if (renderKey === storageRenderCount) return;
  storageRenderCount = renderKey;

  if ((storageFusionMode ? fusionDisplayEntries : visibleGroups).length === 0) {
    const emptyText = storageFusionMode && fusionTargetEntry
      ? "素材候補はありません"
      : items.length
        ? "条件に合う装備はありません"
        : "保管中の装備はありません";
    const fusionTargetHtml = storageFusionMode && fusionTargetEntry
      ? `${storageFusionTargetPreviewHtml(fusionTargetEntry)}<div class="storage-fusion-section-title">素材候補</div>`
      : "";
    root.innerHTML = `${storageHeaderHtml(items, visibleGroups, visibleEntries)}${fusionTargetHtml}<p class="log-empty">${emptyText}</p>`;
    bindStorageEvents(root);
    return;
  }

  const fusionListHtml = storageFusionMode
    ? `${fusionTargetEntry ? `${storageFusionTargetPreviewHtml(fusionTargetEntry)}<div class="storage-fusion-section-title">素材候補</div>` : ""}<ul class="storage-list">${fusionDisplayEntries.map(storageFusionEntryHtml).join("")}</ul>`
    : `<ul class="storage-list">${visibleGroups.map(storageGroupHtml).join("")}</ul>`;
  root.innerHTML = `${storageHeaderHtml(items, visibleGroups, visibleEntries)}${fusionListHtml}`;
  bindStorageEvents(root);
}

function renderItemSection() {
  renderStorage();
}

function equipmentRecordInfoValue(value, lookup = null) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const labels = values
    .filter(Boolean)
    .map((item) => lookup?.[item]?.name || item);
  return labels.join("、") || "？？？";
}

function equipmentRecordDropEnemyIds(item) {
  if (item?.dropEnemies) return Array.isArray(item.dropEnemies) ? item.dropEnemies : [item.dropEnemies];
  if (!item?.id) return [];
  return Object.values(MONSTERS || {})
    .filter((enemy) =>
      (enemy?.drops || []).some((drop) => (typeof drop === "string" ? drop : drop?.id) === item.id)
    )
    .map((enemy) => enemy.id)
    .filter(Boolean);
}

function equipmentRecordDropAreaIds(item, enemyIds) {
  if (item?.dropAreas) return Array.isArray(item.dropAreas) ? item.dropAreas : [item.dropAreas];
  const enemies = new Set(enemyIds);
  if (!enemies.size) return [];
  return Object.values(AREAS || {})
    .filter((area) => enemies.has(area?.boss) || (area?.monsters || []).some((enemyId) => enemies.has(enemyId)))
    .map((area) => area.id)
    .filter(Boolean);
}

function equipmentRecordKindLabel(slot) {
  return {
    weapon: "武器",
    armor: "防具",
    accessory: "装飾",
    accessory1: "装飾",
    accessory2: "装飾",
    装飾1: "装飾",
    装飾2: "装飾",
    relic: "遺物",
  }[slot] || slot || "？？？";
}

function equipmentRecordSortText(item) {
  return `${item?.id || ""} ${item?.name || ""}`.toLowerCase();
}

function equipmentRecordTypeRank(item) {
  const slot = item?.slot || "";
  const text = equipmentRecordSortText(item);
  if (slot === "weapon") {
    if (text.includes("sword") || text.includes("blade") || text.includes("剣")) return 0;
    if (text.includes("dagger") || text.includes("短剣")) return 1;
    if (text.includes("staff") || text.includes("杖")) return 2;
    return 3;
  }
  if (slot === "armor") {
    if (text.includes("armor") || text.includes("mail") || text.includes("breastplate") || text.includes("鎧")) return 4;
    if (text.includes("robe") || text.includes("wear") || text.includes("法衣") || text.includes("服")) return 5;
    if (text.includes("cloak") || text.includes("外套")) return 6;
    return 7;
  }
  if (slot === "accessory") return 8;
  if (slot === "relic") return 9;
  return 10 + storageSlotRank(slot);
}

function compareEquipmentRecords(a, b) {
  return (
    equipmentRecordTypeRank(a) - equipmentRecordTypeRank(b) ||
    rarityRank(b?.rarity) - rarityRank(a?.rarity) ||
    (a?.name || "").localeCompare(b?.name || "", "ja")
  );
}

function equipmentRecordHtml(item) {
  const rarity = normalizeRarity(item?.rarity);
  const slot = item?.slot || "unknown";
  const slotKind = EQUIPMENT_SLOTS.find(({ key, kind }) => key === slot || kind === slot)?.kind || slot;
  const slotLabel = equipmentRecordKindLabel(slotKind);
  const dropEnemyIds = equipmentRecordDropEnemyIds(item);
  const dropAreaIds = equipmentRecordDropAreaIds(item, dropEnemyIds);
  const flavor = item?.flavor || item?.description || "未記録";
  return `<li>
    <div class="records-info">
      <div class="records-head">
        <span class="records-item ${rarityClassName(rarity)}">${item?.name || "名称不明の装備"}</span>
        <span class="records-meta">${rarity} / ${slotLabel}</span>
      </div>
      <div class="records-effect">ドロップ：${equipmentRecordInfoValue(dropEnemyIds, MONSTERS)}</div>
      <div class="records-effect">出現：${equipmentRecordInfoValue(dropAreaIds, AREAS)}</div>
      <div class="records-effect">性能：${equipmentStatLine(item)}</div>
      <p class="records-flavor">説明：${flavor}</p>
    </div>
  </li>`;
}

function enemyRecordInfoValue(value, lookup = null) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const labels = values
    .filter(Boolean)
    .map((item) => lookup?.[item]?.name || item);
  return labels.join("、") || "？？？";
}

function enemyRecordDropItemId(drop) {
  return typeof drop === "string" ? drop : drop?.id || drop?.itemId || null;
}

function enemyRecordDropItemIds(enemyId, enemy) {
  const explicit = enemy?.dropItems || enemy?.drops || enemy?.dropTable;
  if (explicit?.length) return explicit.map(enemyRecordDropItemId).filter(Boolean);

  return Object.values(EQUIPMENT_ITEMS || {})
    .filter((item) => {
      const enemyIds = Array.isArray(item?.dropEnemies)
        ? item.dropEnemies
        : item?.dropEnemies
          ? [item.dropEnemies]
          : [];
      return enemyIds.includes(enemyId);
    })
    .map((item) => item.id)
    .filter(Boolean);
}

function enemyRecordDropItemsValue(enemyId, enemy) {
  const itemIds = enemyRecordDropItemIds(enemyId, enemy);
  const names = itemIds.map((itemId) => EQUIPMENT_ITEMS?.[itemId]?.name || itemId);
  return [...new Set(names)].join("、") || "？？？";
}

function enemyRecordAreaIds(enemyId) {
  return Object.values(AREAS || {})
    .filter((area) => area?.boss === enemyId || (area?.monsters || []).includes(enemyId))
    .map((area) => area.id)
    .filter(Boolean);
}

function enemyRecordHtml(enemyId, record) {
  const enemy = MONSTERS?.[enemyId];
  const kills = Math.max(0, Number(record?.kills) || 0);
  const unlockedName = kills >= 1;
  const unlockedHp = kills >= 5;
  const unlockedAtk = kills >= 10;
  const unlockedDef = kills >= 15;
  const def = enemy?.def ?? 0;
  const tag = enemy?.boss
    ? '<span class="enemy-tag boss-tag">[BOSS]</span>'
    : enemy?.rare
      ? '<span class="enemy-tag rare-tag">[RARE]</span>'
      : "";
  const info = enemy?.recordInfo || {};
  return `<li>
    <div class="records-info">
      <div class="records-head">
        <span class="records-item">${unlockedName ? enemy?.name || "名称不明の敵" : "？？？"}</span>${tag}
      </div>
      <div class="records-effect">出現：${enemyRecordInfoValue(info.appearance || enemyRecordAreaIds(enemyId), AREAS)}</div>
      <div class="records-effect">ドロップ：${enemyRecordDropItemsValue(enemyId, enemy)}</div>
      <div class="records-effect">討伐数：${kills}回</div>
      <div class="records-effect">HP：${unlockedHp ? enemy?.hp ?? "？？？" : "？？？"}</div>
      <div class="records-effect">ATK：${unlockedAtk ? enemy?.atk ?? "？？？" : "？？？"}</div>
      <div class="records-effect">DEF：${unlockedDef ? def : "？？？"}</div>
    </div>
  </li>`;
}

function enemyRecordEntries(records) {
  return Object.entries(records.enemies || {})
    .filter(([enemyId, record]) => MONSTERS?.[enemyId] && (record?.kills || 0) > 0)
    .sort((a, b) => {
      const nameA = MONSTERS[a[0]]?.name || a[0];
      const nameB = MONSTERS[b[0]]?.name || b[0];
      return nameA.localeCompare(nameB, "ja");
    });
}

function renderRecords() {
  const root = $("records-root");
  if (!root) return;
  const records = ensureRecords();
  const ids = records.equipment;
  const equipmentTotal = Object.keys(EQUIPMENT_ITEMS || {}).length;
  const enemyTotal = Object.keys(MONSTERS || {}).length;
  const items = ids.map((id) => EQUIPMENT_ITEMS[id]).filter(Boolean).sort(compareEquipmentRecords);
  const enemies = enemyRecordEntries(records);

  root.innerHTML = `
    <div class="records-section">
      <p class="records-count">装備図録 ${items.length} / ${equipmentTotal}</p>
      ${
        items.length
          ? `<ul class="records-list">${items.map(equipmentRecordHtml).join("")}</ul>`
          : '<p class="log-empty">記録された装備はありません</p>'
      }
    </div>
    <div class="records-section">
      <p class="records-count">敵図録 ${enemies.length} / ${enemyTotal}</p>
      ${
        enemies.length
          ? `<ul class="records-list">${enemies.map(([enemyId, record]) => enemyRecordHtml(enemyId, record)).join("")}</ul>`
          : '<p class="log-empty">記録された敵はありません</p>'
      }
    </div>
  `;
}

function renderRecordsSection() {
  renderRecords();
}

function renderStages() {
  const root = $("stages-root");
  if (!root) return;
  root.innerHTML = AREA_ORDER.map((id) => {
    const a = AREAS[id];
    const unlocked = isAreaUnlocked(id);
    const clears = state.areaClears[id] || 0;
    let cls = "stage-chip";
    if (clears > 0) cls += " cleared";
    else if (unlocked) cls += " unlocked";
    else cls += " locked";
    const hint = unlocked ? (clears > 0 ? `クリア ${clears}回` : "解放済") : getUnlockHint(id);
    return `<span class="${cls}" title="${hint}">${a.name}</span>`;
  }).join("");
}

function renderWorldSituation() {
  const totalClears = Object.values(state.areaClears).reduce((sum, v) => sum + v, 0);
  const progress = clamp(totalClears * 12, 4, 100);
  const bossAreas = AREA_ORDER.map((id) => AREAS[id]).filter((a) => isAreaUnlocked(a.id) && shouldBossAppear(a));
  const root = $("world-root");
  if (!root) return;
  root.innerHTML = `
    <p>${totalClears ? `ギルドの街道安全度は ${progress}% まで回復。` : "街道にはまだ魔物の気配が濃い。"}</p>
    <div class="world-meter"><span style="width:${progress}%"></span></div>
    ${
      bossAreas.length
        ? bossAreas.map((a) => `<p class="boss-alert">${a.name}で強敵の目撃報告。次回派遣は警戒推奨。</p>`).join("")
        : '<p class="muted">大きな脅威の報告はありません。</p>'
    }
  `;
}

function renderLogs() {
  const root = $("logs-root");
  if (!root) return;
  root.innerHTML = "";
  for (const party of state.parties) {
    const panel = document.createElement("div");
    panel.className = "log-panel";
    panel.innerHTML = `<h3>${party.name}</h3>`;

    const current = document.createElement("div");
    renderCurrentDispatchLog(current, party);
    panel.appendChild(current);

    const pastTitle = document.createElement("h3");
    pastTitle.textContent = "過去の派遣";
    pastTitle.style.marginTop = "14px";
    panel.appendChild(pastTitle);

    const past = document.createElement("div");
    renderPastDispatchLog(past, party);
    panel.appendChild(past);
    root.appendChild(panel);
  }
}

function renderExpeditionOverviewSection() {
  renderStages();
  renderWorldSituation();
}

function renderInboxSection() {
  renderLogs();
}

function renderAll() {
  state.parties.forEach((p) => {
    ensurePartyShape(p);
    ensureValidSelectedArea(p);
    recordEquippedEquipment(p);
  });
  renderPartySection();
  renderReportSection();
  renderExpeditionOverviewSection();
  renderItemSection();
  renderRecordsSection();
  renderStatsSection();
  renderInboxSection();
}

function ensurePartyShape(party) {
  if (!party.stats) party.stats = defaultStats();
  if (!party.dispatches) party.dispatches = [];
  if (!party.expandedDispatchIds) party.expandedDispatchIds = [];
  const template = party.id === "pt2" ? PARTY_TEMPLATES.pt2 : PARTY_TEMPLATES.pt1;
  if (!party.members) {
    const leaderName = party.hero?.name || (party.id === "pt2" ? "リナ" : "アレン");
    party.members = template.map((m, i) => createMember({ ...m, name: i === 0 ? leaderName : m.name }, party.hero?.level || 1));
  }
  for (const templateMember of template) {
    if (!party.members.some((member) => member.id === templateMember.id)) {
      party.members.push(createMember(templateMember, party.hero?.level || 1));
    }
  }
  party.members = party.members.map((member, index) => {
    const normalized = normalizeMember(member);
    const templateMember = template.find((m) => m.id === member.id) || template[index];
    normalized.formation = member.formation || templateMember?.formation || "中衛";
    return normalized;
  });
  const order = new Map(template.map((member, index) => [member.id, index]));
  party.members.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  party.hero = party.members[0];
}

function migrate(data) {
  if (!data.parties) return data;
  if (!data.storage) data.storage = [];
  ensureAutoSellSettings(data);
  ensureRecords(data);
  ensureDeveloperMode(data);
  ensureGuildStats(data);
  for (const rawItem of data.storage || []) {
    const item = storageItemFromEquipment(rawItem);
    recordEquipment(item, data);
  }

  for (const p of data.parties) {
    ensurePartyShape(p);
    recordEquippedEquipment(p, data);
    if (p.adventureLog?.length && !p.dispatches.length) {
      p.dispatches.push({
        id: uid("dispatch"),
        areaName: "過去の記録",
        startedAt: 0,
        endsAt: 0,
        status: "complete",
        entries: p.adventureLog,
        summary: "移行データ",
      });
      delete p.adventureLog;
    }
  }

  data.stats.gold += data.parties.reduce((sum, p) => sum + Math.max(0, Number(p?.stats?.gold) || 0), 0);
  data.parties.forEach((p) => {
    if (p?.stats) p.stats.gold = 0;
  });

  if (data.gold != null && data.parties[0]) {
    const p0 = data.parties[0].stats;
    data.stats.gold += data.gold || 0;
    p0.kills += data.totalKills || 0;
    p0.missionsStarted += data.missionsStarted || 0;
    p0.missionsCleared += data.missionsCleared || 0;
  }

  if (!data.areaClears) data.areaClears = {};
  return data;
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    $("save-hint").textContent = `保存済 ${formatClock(Date.now())}`;
  } catch {
    $("save-hint").textContent = "保存失敗";
  }
}

function loadGame() {
  try {
    const raw =
      localStorage.getItem(SAVE_KEY) ||
      localStorage.getItem("dispatch-hero-save-v7") ||
      localStorage.getItem("dispatch-hero-save-v6") ||
      localStorage.getItem("dispatch-hero-save-v5");
    if (!raw) return;
    const data = migrate(JSON.parse(raw));
    if (data.parties) {
      state = {
        parties: data.parties,
        stats: data.stats || defaultGuildStats(),
        areaClears: data.areaClears || {},
        storage: data.storage || [],
        autoSell: data.autoSell || defaultAutoSellSettings(),
        records: data.records || defaultRecords(),
        developerMode: data.developerMode === true,
      };
      ensureGuildStats();
      ensureAutoSellSettings();
      ensureRecords();
      ensureDeveloperMode();
      state.parties.forEach(trimDispatches);
    }
  } catch (e) {
    console.warn(e);
  }
}

function resetGame() {
  if (!confirm("セーブを消して最初からやり直しますか？")) return;
  ["dispatch-hero-save-v8", "dispatch-hero-save-v7", "dispatch-hero-save-v6", "dispatch-hero-save-v5"].forEach((k) =>
    localStorage.removeItem(k)
  );
  state = {
    parties: [defaultParty("pt1", "第一小隊"), defaultParty("pt2", "第二小隊")],
    stats: defaultGuildStats(),
    areaClears: {},
    storage: [],
    autoSell: defaultAutoSellSettings(),
    records: defaultRecords(),
    developerMode: false,
  };
  nextId = 1;
  storageRenderCount = -1;
  stopTick();
  saveGame();
  updateDeveloperButton();
  renderAll();
}

function ensureTick() {
  if (tickId) return;
  tickId = setInterval(processMissions, 250);
}

function stopTick() {
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

function ensureWorldSituationTick() {
  if (worldTickId) return;
  worldTickId = setInterval(renderWorldSituation, 3000);
}

function setupQuickNav() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = $(button.dataset.scrollTarget);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

$("reset-btn").addEventListener("click", resetGame);
$("developer-btn")?.addEventListener("click", toggleDeveloperMode);
setupQuickNav();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    processMissions();
    updateProgressBars();
  }
});

loadGame();
for (const p of state.parties) {
  ensurePartyShape(p);
  if (p.mission) {
    const area = getArea(p.mission.areaId);
    const d = p.dispatches.find((x) => x.id === p.mission.dispatchId);
    if (!d) {
      p.dispatches.unshift({
        id: p.mission.dispatchId || uid("dispatch"),
        areaId: area.id,
        areaName: area.name,
        startedAt: p.mission.startedAt,
        endsAt: p.mission.endsAt,
        status: "active",
        entries: [],
      });
    }
    if (!p.mission.journal && p.mission.rewards) {
      p.mission.journal = buildScheduledJournalV2(p, area, p.mission.rewards, p.mission.startedAt, p.mission.endsAt);
    }
    revealDueEntries(p);
  }
}
processMissions();
renderAll();
updateDeveloperButton();
ensureWorldSituationTick();
if (state.parties.some((p) => p.mission)) ensureTick();
