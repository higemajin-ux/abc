"use strict";

let nextId = 1;
let tickId = null;
let worldTickId = null;
let storageRenderCount = -1;
let storageSortMode = "new";
let storageFilterMode = "all";
let storageFilterOpen = false;
let storageAutoSellOpen = false;
const openDetailPartyIds = new Set();
registerDropEquipmentItems();
let state = {
  parties: [defaultParty("pt1", "第一小隊"), defaultParty("pt2", "第二小隊")],
  areaClears: {},
  storage: [],
  autoSell: { common: true, uncommon: false },
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

function registerEquipmentItem(item) {
  if (!item?.id) return null;
  const base = EQUIPMENT_ITEMS[item.id] || EQUIPMENT_DROPS.find((drop) => drop.id === item.id) || {};
  const normalized = {
    ...base,
    ...item,
    rarity: normalizeRarity(item.rarity || base.rarity),
    sellGold: item.sellGold || base.sellGold || 0,
  };
  EQUIPMENT_ITEMS[normalized.id] = normalized;
  return normalized;
}

function registerDropEquipmentItems() {
  (EQUIPMENT_DROPS || []).forEach(registerEquipmentItem);
}

function storageItemFromEquipment(item) {
  const normalized = registerEquipmentItem(item);
  if (!normalized) return null;
  return {
    ...normalized,
    rarity: normalizeRarity(normalized.rarity),
    sellGold: normalized.sellGold || 0,
    locked: !!item.locked,
    storedAt: Date.now(),
  };
}

function storageItemFromEquipmentId(itemId) {
  if (!itemId) return null;
  return storageItemFromEquipment(EQUIPMENT_ITEMS[itemId] || EQUIPMENT_DROPS.find((drop) => drop.id === itemId));
}

function equipmentStatLine(item) {
  if (!item) return "";
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  const parts = ["maxHp", "atk", "def", "dex", "luc"]
    .filter((key) => item[key])
    .map((key) => `${labels[key]}${item[key] > 0 ? "+" : ""}${item[key]}`);
  return parts.length ? parts.join(" / ") : "性能なし";
}

function equipmentStorageLine(item) {
  const sellGold = item?.sellGold || 0;
  return `${equipmentStatLine(item)} / 売却 ${sellGold}G`;
}

function defaultAutoSellSettings() {
  return { common: true, uncommon: false };
}

function ensureAutoSellSettings(target = state) {
  const defaults = defaultAutoSellSettings();
  target.autoSell = { ...defaults, ...(target.autoSell || {}) };
  target.autoSell.common = !!target.autoSell.common;
  target.autoSell.uncommon = !!target.autoSell.uncommon;
  return target.autoSell;
}

function shouldAutoSellDrop(item) {
  const rarity = normalizeRarity(item?.rarity);
  const settings = ensureAutoSellSettings();
  const autoSold = rarity === "common" || rarity === "uncommon" ? !!settings[rarity] : false;
  if (item && typeof item === "object") item.autoSold = autoSold;
  return autoSold;
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

  for (let i = 0; i < normalCount; i += 1) {
    encounters.push(runEncounter(party.members, MONSTERS[pick(area.monsters)], area, speechState));
    if (party.members.every((member) => member.hp <= 0)) break;
  }

  const failedBeforeBoss =
    party.members.every((member) => member.hp <= 0) || encounters.some((encounter) => !encounter.victory);
  if (!failedBeforeBoss) {
    encounters.push(runEncounter(party.members, chooseBoss(area), area, speechState));
  }

  const failed = failedBeforeBoss || encounters.some((encounter) => !encounter.victory);

  return {
    encounters,
    kills: encounters.reduce((sum, e) => sum + e.kills, 0),
    xp: encounters.reduce((sum, e) => sum + e.xp, 0),
    gold: encounters.reduce((sum, e) => sum + e.gold, 0),
    failed,
    forcedReturn: failed && party.members.every((member) => member.hp <= 0),
  };
}

function battleSummary(encounter) {
  const result = encounter.victory ? "討伐成功" : "撤退";
  return `${encounter.monster.name}: ${result} / ${encounter.xp}XP / ${encounter.gold}G`;
}

function buildRewardJournalEntries(rewards) {
  const names = (rewards?.encounters || [])
    .map((encounter) => encounter?.equipmentDrop)
    .filter(Boolean)
    .map((drop) => {
      const item = storageItemFromEquipment(drop) || drop;
      const name = item?.name || "装備";
      const suffix = wasAutoSoldDrop(drop) ? "（売却）" : "";
      return `<span class="${rarityClassName(item?.rarity)}">${name}</span>${suffix}`;
    });
  if (!names.length) return [];
  return [{
    id: uid("entry"),
    type: "flavor",
    title: `今回の冒険で装備を持ち帰った。<br>装備箱：<br>${names.map((name) => `・${name}`).join("<br>")}`,
    shown: false,
  }];
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

  area.flavor.forEach((text, index) => {
    entries.push({
      id: uid("entry"),
      timestamp: startedAt + Math.floor(span * (0.18 + index * 0.14)),
      type: "flavor",
      title: text,
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
    (encounter.explorationEvents || []).forEach((event, eventIndex) => {
      entries.push({
        id: uid("entry"),
        timestamp: Math.max(startedAt, battleTime - encounter.explorationEvents.length + eventIndex),
        type: "flavor",
        title: event.text,
        membersSnapshot: encounter.startMembersSnapshot,
        shown: false,
      });
    });
    entries.push({
      id: uid("entry"),
      timestamp: battleTime,
      type: "battle",
      title: `${encounter.monster.name}との戦闘記録（${encounter.victory ? "勝利" : "撤退"}）`,
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
    title: `帰還報告（全戦闘記録▼）`,
    battleDetail: rewards.encounters.flatMap((e) => e.events),
    summary: `${rewards.kills}体討伐、${rewards.gold}G、${rewards.xp}XPを獲得`,
    mvpLine: buildMvpLine(party, rewards),
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
    (encounter.explorationEvents || []).forEach((event, eventIndex) => {
      entries.push({
        id: uid("entry"),
        timestamp: Math.max(startedAt, battleTime - encounter.explorationEvents.length + eventIndex),
        type: "flavor",
        title: event.text,
        membersSnapshot: encounter.startMembersSnapshot,
        shown: false,
      });
    });
    entries.push({
      id: uid("entry"),
      timestamp: battleTime,
      type: "battle",
      title: `${encounter.monster.name}との戦闘記録（${encounter.victory ? "勝利" : "撤退"}）`,
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
  const rewardEntries = buildRewardJournalEntries(rewards);
  const reportAuthor = reportAuthorName(party, mvpLine, returnEvents);
  returnEvents.forEach((event, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: Math.max(startedAt, returnTime - rewardEntries.length - returnEvents.length + eventIndex),
      type: "flavor",
      title: event.text,
      membersSnapshot: returnMembersSnapshot,
      shown: false,
    });
  });
  rewardEntries.forEach((entry, entryIndex) => {
    entries.push({
      ...entry,
      timestamp: Math.max(startedAt, returnTime - entryIndex - 1),
      membersSnapshot: returnMembersSnapshot,
    });
  });

  entries.push({
    id: uid("entry"),
    timestamp: returnTime,
    type: "return",
    title: rewards.forcedReturn ? "全滅により強制帰還（全戦闘記録▼）" : "帰還報告（全戦闘記録▼）",
    battleDetail: rewards.encounters.flatMap((e) => e.events),
    reportAuthor,
    summary: rewards.forcedReturn
      ? `全滅により強制帰還 / ${rewards.kills}体討伐 / ${rewards.gold}G / ${rewards.xp}XP`
      : `${rewards.kills}体討伐、${rewards.gold}G、${rewards.xp}XPを獲得`,
    mvpLine,
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
  s.gold += rewards.gold;
  s.kills += rewards.kills;
  s.missionsCleared += 1;
  storeEquipmentDrops(rewards);

  const levelUps = [];
  const xpEach = Math.max(1, Math.floor(rewards.xp / party.members.length));
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

function storeEquipmentDrops(rewards) {
  if (!state.storage) state.storage = [];
  for (const encounter of rewards.encounters || []) {
    const item = encounter.equipmentDrop;
    const storedItem = storageItemFromEquipment(item);
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
  equipment[slot] = storedItem.id;
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
  if (!state.storage?.length) return;
  const storedItem = storageItemFromEquipment(state.storage[index]);
  if (!storedItem || storedItem.locked) return;

  const sellGold = Number(storedItem.sellGold) || 0;
  const stats = state.parties[0]?.stats;
  if (stats) stats.gold += sellGold;
  state.storage.splice(index, 1);
  storageRenderCount = -1;
  saveGame();
  renderAll();
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
  const endsAt = now + area.durationMs;
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
    plannedEndsAt: endsAt,
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

  if (!missionFailed) {
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
  let title = entry.title;
  if (entry.type === "return") {
    title = title.replace(/（全戦闘記録[▼▲]）$/, "");
    title += open ? "（全戦闘記録▲）" : "（全戦闘記録▼）";
  } else if (entry.battleDetail?.length) {
    title += open ? " ▲" : " ▼";
  }
  return `<span class="time">${formatClock(entry.timestamp)}</span>${title}${monsterTag}`;
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
    detail.innerHTML += entry.battleDetail
      .map((ev, index, events) => `<p class="${battleEventClass(ev, events[index - 1])}">${ev.text}</p>`)
      .join("");
    if (entry.summary && entry.type === "return") {
      detail.innerHTML += `<p><strong>合計:</strong> ${entry.summary}</p>`;
    }
    if (entry.mvpLine && entry.type === "return") {
      detail.innerHTML += `<p>${entry.mvpLine}</p>`;
    }
    li.appendChild(detail);
    btn.addEventListener("click", () => {
      const open = detail.classList.toggle("open");
      btn.innerHTML = entryButtonHtml(entry, open);
    });
  }

  return li;
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
  const hasItem = !!EQUIPMENT_ITEMS[equipment[slot]];
  const candidates = (state.storage || [])
    .map((rawItem, index) => ({ item: storageItemFromEquipment(rawItem), index }))
    .filter(({ item }) => item?.slot === kind);

  const removeChoice = hasItem
    ? `<button type="button" class="equip-choice-btn unequip-choice-btn" data-unequip="true" data-member-id="${member.id}" data-slot="${slot}">
        <span class="equip-choice-head"><strong>なし</strong><span>解除</span></span>
        <span class="equip-choice-meta">装備を外す</span>
      </button>`
    : "";

  if (!removeChoice && !candidates.length) {
    return '<p class="equipment-empty">保管庫に候補はありません</p>';
  }

  return removeChoice + candidates
    .map(({ item, index }) => {
      const rarity = normalizeRarity(item.rarity);
      return `<button type="button" class="equip-choice-btn ${rarityClassName(rarity)}" data-storage-index="${index}" data-member-id="${member.id}" data-slot="${slot}">
        <span class="equip-choice-head"><strong>${item.name}</strong><span>${rarity}</span></span>
        <span class="equip-choice-meta">${equipmentStorageLine(item)}</span>
      </button>`;
    })
    .join("");
}

function equipmentSlotHtml(member, slot) {
  const equipment = ensureCharacterEquipment(member);
  const item = EQUIPMENT_ITEMS[equipment[slot]];
  const rarity = normalizeRarity(item?.rarity);
  const name = item ? formatEquipmentLine(item) : "なし";
  return `<div class="member-equipment-slot">
    <button type="button" class="equip-slot-btn" data-member-id="${member.id}" data-slot="${slot}">
      <span>${equipmentSlotLabel(slot)}</span>
      <strong class="${rarityClassName(rarity)}">${name}</strong>
    </button>
    <div class="equipment-candidates" hidden>${equipmentCandidateList(member, slot)}</div>
  </div>`;
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
          <div class="member-stat-row"><span>HP</span><strong>${m.hp} / ${m.maxHp}</strong></div>
          <div class="member-stat-row"><span>ATK</span><strong>${memberStatValue(m.atk)}</strong></div>
          <div class="member-stat-row"><span>DEF</span><strong>${memberStatValue(m.def)}</strong></div>
          <div class="member-stat-row"><span>DEX</span><strong>${memberStatValue(m.dex)}</strong></div>
          <div class="member-stat-row"><span>LUC</span><strong>${memberStatValue(m.luc)}</strong></div>
        </div>
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
    const label = unlocked ? `${a.name}（${a.durationMs / 1000}秒）` : `${a.name}（${getUnlockHint(id)}）`;
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
  const leader = party.members[0];
  const card = document.createElement("div");
  card.className = "party-card" + (on ? " on-mission-card" : "");
  card.dataset.partyCard = party.id;
  card.innerHTML = `
      <div class="party-card-head">
        <h3>${party.name}</h3>
        <button type="button" class="detail-toggle" aria-expanded="false">詳細</button>
      </div>
      <div class="row"><span>隊長 ${leader.name}</span><span class="muted">Lv.${leader.level}</span></div>
      <div class="row">
        <span class="${on ? "status-mission" : "status-idle"}">${on ? `${area.name}で戦闘中` : "派遣待機中"}</span>
        <span class="muted leader-hp">HP ${leader.hp}/${leader.maxHp}</span>
      </div>
      <div class="member-list">${memberChips(party)}</div>
      <div class="member-details" hidden>${memberDetails(party)}</div>
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

  if (!on) {
    card.querySelector(".area-select").addEventListener("change", (e) => {
      party.selectedArea = e.target.value;
      saveGame();
    });
  }
  const detailToggle = card.querySelector(".detail-toggle");
  const memberDetailsRoot = card.querySelector(".member-details");
  if (openDetailPartyIds.has(party.id)) {
    memberDetailsRoot.removeAttribute("hidden");
    detailToggle.setAttribute("aria-expanded", "true");
    detailToggle.textContent = "閉じる";
  }
  detailToggle.addEventListener("click", () => {
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
  card.querySelector(".dispatch-btn").addEventListener("click", () => startMission(party.id));
  return card;
}

function renderPartyCard(party) {
  const current = document.querySelector(`[data-party-card="${party.id}"]`);
  const next = createPartyCard(party);
  if (current) current.replaceWith(next);
  else $("parties-root").appendChild(next);
}

function renderParties() {
  const root = $("parties-root");
  root.innerHTML = "";

  for (const party of state.parties) {
    root.appendChild(createPartyCard(party));
  }
}

function renderReports() {
  $("reports-root").innerHTML = state.parties
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

function renderStats() {
  $("stats-root").innerHTML = state.parties
    .map((p) => {
      const s = p.stats;
      return `<div class="sub-panel"><h3>${p.name}</h3>
        <div class="stats">
          <div class="stat-cell"><div class="label">ゴールド</div>${s.gold} G</div>
          <div class="stat-cell"><div class="label">討伐</div>${s.kills} 体</div>
          <div class="stat-cell"><div class="label">派遣</div>${s.missionsStarted} 回</div>
          <div class="stat-cell"><div class="label">完了</div>${s.missionsCleared} 回</div>
        </div></div>`;
    })
    .join("");
}

function storageGroupKey(item, fallback) {
  if (typeof fallback === "string" && fallback.startsWith("equipped-")) return fallback;
  if (item?.locked) return `locked-${fallback}`;
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
          const name = item?.name || "名称不明の装備";
          return `<li>
            <div class="storage-info">
              <div class="storage-head">
                <span class="storage-item ${rarityClassName(rarity)}">${name}${count > 1 ? ` ×${count}` : ""}</span>
                ${locked ? '<span class="storage-lock-label">★ 保護中</span>' : ""}
              </div>
              <div class="storage-effect">${equipmentStorageLine(item)}</div>
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

function storageHeaderHtml(items) {
  return `<div class="storage-toolbar">${storageCountHtml(items)}${storageSortOptionsHtml()}</div>`;
}

function storageGroups(entries) {
  const groups = [];
  const groupByKey = new Map();
  entries.forEach(({ item, storageIndex, equippedBy, equippedSlot }) => {
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
    group.entries.push({ item, index: storageIndex, locked: !!item.locked, equippedBy, equippedSlot });
  });
  return groups.sort(compareStorageGroups);
}

function storageGroupHtml(group) {
  const { item, count, entries } = group;
  const rarity = normalizeRarity(item?.rarity);
  const name = item?.name || "名称不明の装備";
  const index = entries[0]?.index;
  const locked = !!entries[0]?.locked;
  const equippedBy = entries.find((entry) => entry.equippedBy)?.equippedBy;
  const canSell = typeof index === "number" && !equippedBy && !locked;
  return `<li>
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : count > 1 ? ` ×${count}` : ""}</span>
        ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
      </div>
      <div class="storage-effect">${equipmentStorageLine(item)}</div>
    </div>
    <div class="storage-actions">
      ${typeof index === "number" ? `<button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>` : ""}
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

function renderStorage() {
  const root = $("storage-root");
  if (!root) return;
  const items = state.storage || [];
  const autoSell = ensureAutoSellSettings();
  const equippedKey = equippedStorageEntries().map(({ storageIndex, item }) => `${storageIndex}:${item.id}`).join(",");
  const renderKey = `${items.length}:${storageSortMode}:${storageFilterMode}:${autoSell.common}:${autoSell.uncommon}:${storageFilterOpen}:${storageAutoSellOpen}:${equippedKey}`;
  if (renderKey === storageRenderCount) return;
  storageRenderCount = renderKey;
  const visibleEntries = filteredStorageEntries(items);

  if (!visibleEntries.length) {
    root.innerHTML = `${storageHeaderHtml(items)}<p class="log-empty">${items.length ? "条件に合う装備はありません" : "保管中の装備はありません"}</p>`;
    bindStorageEvents(root);
    return;
  }

  root.innerHTML = `${storageHeaderHtml(items)}
    <ul class="storage-list">${storageGroups(visibleEntries).map(storageGroupHtml).join("")}</ul>`;
  bindStorageEvents(root);
}

function renderStages() {
  $("stages-root").innerHTML = AREA_ORDER.map((id) => {
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
  $("world-root").innerHTML = `
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

function renderAll() {
  state.parties.forEach((p) => {
    ensurePartyShape(p);
    ensureValidSelectedArea(p);
  });
  renderParties();
  renderReports();
  renderStages();
  renderWorldSituation();
  renderStorage();
  renderStats();
  renderLogs();
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

  for (const p of data.parties) {
    ensurePartyShape(p);
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

  if (data.gold != null && data.parties[0]) {
    const p0 = data.parties[0].stats;
    p0.gold += data.gold || 0;
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
        areaClears: data.areaClears || {},
        storage: data.storage || [],
        autoSell: data.autoSell || defaultAutoSellSettings(),
      };
      ensureAutoSellSettings();
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
    areaClears: {},
    storage: [],
    autoSell: defaultAutoSellSettings(),
  };
  nextId = 1;
  storageRenderCount = -1;
  stopTick();
  saveGame();
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

$("reset-btn").addEventListener("click", resetGame);
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
ensureWorldSituationTick();
if (state.parties.some((p) => p.mission)) ensureTick();
