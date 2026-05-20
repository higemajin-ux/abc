"use strict";

let nextId = 1;
let tickId = null;
let worldTickId = null;
let state = {
  parties: [defaultParty("pt1", "第一小隊"), defaultParty("pt2", "第二小隊")],
  areaClears: {},
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
  renderParties();
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
  renderAll();
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
  if (partyDirty) renderParties();
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
    detail.innerHTML += entry.battleDetail.map((ev) => `<p class="${battleEventClass(ev)}">${ev.text}</p>`).join("");
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

function battleEventClass(event) {
  const kind = event.kind || "";
  if (kind === "turn-separator" || kind === "action-break") return kind;
  if (kind === "enemy-action") return kind;
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

function renderParties() {
  const root = $("parties-root");
  root.innerHTML = "";

  for (const party of state.parties) {
    const on = !!party.mission;
    const area = on ? getArea(party.mission.areaId) : getArea(party.selectedArea);
    const leader = party.members[0];
    const card = document.createElement("div");
    card.className = "party-card" + (on ? " on-mission-card" : "");
    card.innerHTML = `
      <div class="party-card-head">
        <h3>${party.name}</h3>
        <button type="button" class="detail-toggle" aria-expanded="false">詳細</button>
      </div>
      <div class="row"><span>隊長 ${leader.name}</span><span class="muted">Lv.${leader.level}</span></div>
      <div class="row">
        <span class="${on ? "status-mission" : "status-idle"}">${on ? `${area.name}で戦闘中` : "派遣待機中"}</span>
        <span class="muted">HP ${leader.hp}/${leader.maxHp}</span>
      </div>
      <div class="member-list">${memberChips(party)}</div>
      <div class="member-details" hidden>${memberDetails(party)}</div>
      ${on ? `<div class="eta">${formatClock(party.mission.endsAt)} に帰還予定</div>` : ""}
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
    detailToggle.addEventListener("click", () => {
      const open = memberDetailsRoot.hasAttribute("hidden");
      memberDetailsRoot.toggleAttribute("hidden", !open);
      detailToggle.setAttribute("aria-expanded", String(open));
      detailToggle.textContent = open ? "閉じる" : "詳細";
    });
    card.querySelector(".dispatch-btn").addEventListener("click", () => startMission(party.id));
    root.appendChild(card);
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
      state = { parties: data.parties, areaClears: data.areaClears || {} };
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
  };
  nextId = 1;
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
    renderParties();
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
