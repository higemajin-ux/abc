"use strict";

const STATUS_EFFECTS = {
  poison: {
    turnKey: "poisonTurns",
    label: "毒",
  },
  curse: {
    turnKey: "curseTurns",
    label: "呪い",
  },
  burn: {
    turnKey: "burnTurns",
    label: "火傷",
  },
  paralyze: {
    turnKey: "paralyzeTurns",
    label: "麻痺",
  },
  blind: {
    turnKey: "blindTurns",
    label: "盲目",
  },
  slow: {
    turnKey: "slowTurns",
    label: "鈍化",
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickWeightedMonster(area, rareWeight = 1) {
  const options = area.monsters
    .map((id) => MONSTERS[id])
    .filter(Boolean)
    .map((monster) => ({
      monster,
      weight: monster.rare ? rareWeight : 1,
    }));
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let rollValue = Math.random() * total;
  for (const option of options) {
    rollValue -= option.weight;
    if (rollValue <= 0) return option.monster;
  }
  return options.at(-1)?.monster || MONSTERS[pick(area.monsters)];
}

function defaultSkillSettings(job) {
  return Object.fromEntries((JOB_SKILLS?.[job] || []).map((skill) => [skill.id, true]));
}

function skillRequiredLevel(skill) {
  return Math.max(1, Number(skill?.requiredLevel) || 1);
}

function isSkillLearned(member, skillOrId) {
  const skill = typeof skillOrId === "string"
    ? getSkillDefinition(member, skillOrId)
    : skillOrId;
  if (!skill) return false;
  return (Number(member?.level) || 1) >= skillRequiredLevel(skill);
}

function normalizeSkillSettings(member) {
  const defaults = defaultSkillSettings(member?.job);
  const settings = { ...(member?.skillSettings || {}) };
  if (member?.job === "scout" && settings.focus != null && settings.rogueFocus == null) {
    settings.rogueFocus = settings.focus;
  }
  if (member?.job === "mage" && settings.focus != null && settings.magicFocus == null) {
    settings.magicFocus = settings.focus;
  }
  return { ...defaults, ...settings };
}

function isSkillEnabled(member, skillId) {
  if (!isSkillLearned(member, skillId)) return false;
  return normalizeSkillSettings(member)[skillId] !== false;
}

function getSkillDefinition(member, skillId) {
  return (JOB_SKILLS?.[member?.job] || []).find((skill) => skill.id === skillId) || null;
}

function tryMageMagicSense(members, monster, area) {
  if (monster.boss || !area.monsters?.length) return { monster, explorationEvents: [] };
  const mages = livingMembers(members).filter((member) => member.job === "mage" && isSkillEnabled(member, "magicSense"));
  if (!mages.length || Math.random() >= 0.1) return { monster, explorationEvents: [] };

  const detector = pick(mages);
  const detectedMonster = pickWeightedMonster(area, 3);
  return {
    monster: detectedMonster,
    detector,
    foundRare: detectedMonster.rare && !detectedMonster.boss,
    explorationEvents: [
      { kind: "spell", text: `${detector.name}は魔力探知を使った。<br>「……珍しいやつがいるな」` },
    ],
  };
}

function createMember(template, level = 1) {
  const equipment = ensureCharacterEquipment(template);
  const base = JOB_STATS[template.job];
  const baseAtk = base.atk + Math.floor((level - 1) * 1.5);
  const bonus = getEquipmentBonus({ ...template, level }, baseAtk);
  const maxHp = base.maxHp + (level - 1) * 5 + bonus.maxHp;
  const baseDex = template.baseDex ?? template.dex ?? base.dex;
  const baseLuc = template.baseLuc ?? template.luc ?? base.luc;
  return {
    ...template,
    equipment: { ...equipment },
    level,
    xp: template.xp || 0,
    xpToNext: template.xpToNext || 40,
    maxHp,
    hp: template.hp == null ? maxHp : clamp(template.hp, 0, maxHp),
    atk: baseAtk + bonus.atk,
    def: base.def + Math.floor((level - 1) * 0.8) + bonus.def,
    baseDex,
    baseLuc,
    dex: baseDex + bonus.dex,
    luc: baseLuc + bonus.luc,
    criticalRate: bonus.criticalRate || 0,
    skillSettings: normalizeSkillSettings(template),
  };
}

function normalizeMember(member) {
  const currentBonus = member.equipment ? getEquipmentBonus(member) : { dex: 0, luc: 0 };
  const template = {
    id: member.id,
    name: member.name,
    job: member.job || "warrior",
    equipment: member.equipment,
    skillSettings: member.skillSettings,
    baseDex: member.baseDex ?? (member.dex == null ? undefined : member.dex - currentBonus.dex),
    baseLuc: member.baseLuc ?? (member.luc == null ? undefined : member.luc - currentBonus.luc),
  };
  const normalized = createMember(template, member.level || 1);
  normalized.xp = member.xp || 0;
  normalized.xpToNext = member.xpToNext || 40;
  normalized.hp = member.hp == null ? normalized.maxHp : clamp(member.hp, 0, normalized.maxHp);
  return normalized;
}

function syncMemberStats(member) {
  const normalized = normalizeMember(member);
  Object.assign(member, normalized);
}

function createEnemy(monster, area, heroLevel, nameOverride = null) {
  const scale = Math.max(0, area.difficulty - 1) + Math.floor(heroLevel / 3);
  const hpScale = monster.boss ? 14 : 8;
  return {
    id: monster.id,
    name: nameOverride || monster.name,
    maxHp: monster.hp + scale * hpScale,
    hp: monster.hp + scale * hpScale,
    atk: monster.atk + Math.floor(scale * 1.8),
    def: (monster.def || Math.max(0, area.difficulty - 1)) + Math.floor(scale / 2),
    baseDex: monster.dex || area.difficulty + 4,
    dex: monster.dex || area.difficulty + 4,
    xp: monster.xp + scale * 4,
    gold: monster.gold + scale * 3,
    rare: !!monster.rare,
    boss: !!monster.boss,
    special: monster.special || null,
  };
}

function livingMembers(party) {
  return party.filter((m) => m.hp > 0);
}

function livingEnemies(enemies) {
  return (Array.isArray(enemies) ? enemies : [enemies]).filter((enemy) => enemy && enemy.hp > 0);
}

function pickLivingEnemy(enemies) {
  const candidates = livingEnemies(enemies);
  return candidates.length ? pick(candidates) : null;
}

function monsterGroupLabel(monsters) {
  const list = Array.isArray(monsters) ? monsters : [monsters];
  return list.map((monster) => monster?.name).filter(Boolean).join("、");
}

function enemyGroupLabel(enemies) {
  const list = Array.isArray(enemies) ? enemies : [enemies];
  return list.map((enemy) => enemy?.name).filter(Boolean).join("、");
}

function pickWeightedCount(weights, fallback = 1) {
  const entries = Object.entries(weights || {})
    .map(([count, weight]) => [Number(count), Number(weight)])
    .filter(([count, weight]) => Number.isFinite(count) && count > 0 && Number.isFinite(weight) && weight > 0);
  if (!entries.length) return fallback;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let rollValue = Math.random() * total;
  for (const [count, weight] of entries) {
    rollValue -= weight;
    if (rollValue <= 0) return count;
  }
  return entries.at(-1)?.[0] || fallback;
}

function normalEncounterEnemyCount(area, leadMonster) {
  if (leadMonster?.boss || leadMonster?.rare) return 1;
  return clamp(pickWeightedCount(area?.normalEncounterGroupWeights, 1), 1, 3);
}

function buildEncounterMonsters(area, leadMonster) {
  const count = normalEncounterEnemyCount(area, leadMonster);
  const monsters = [leadMonster];
  for (let i = 1; i < count; i += 1) {
    monsters.push(pickWeightedMonster(area));
  }
  return monsters;
}

function withIndexedEnemyNames(monsters) {
  const counts = new Map();
  monsters.forEach((monster) => {
    counts.set(monster.name, (counts.get(monster.name) || 0) + 1);
  });
  const current = new Map();
  return monsters.map((monster) => {
    const total = counts.get(monster.name) || 0;
    if (total <= 1) return { monster, displayName: monster.name };
    const index = (current.get(monster.name) || 0) + 1;
    current.set(monster.name, index);
    return {
      monster,
      displayName: `${monster.name}${String.fromCharCode(64 + index)}`,
    };
  });
}

function livingScouts(party) {
  return livingMembers(party).filter((member) => member.job === "scout" || member.job === "rogue");
}

function formationTargetWeight(member, enemy = null) {
  if (enemy?.targeting === "backlineBias") {
    if (member.formation === "前衛") return 3;
    if (member.formation === "後衛") return 5;
    return 4;
  }
  if (member.formation === "前衛") return 6;
  if (member.formation === "後衛") return 1;
  return 3;
}

function pickEnemyTarget(party, enemy = null) {
  const candidates = livingMembers(party);
  if (!candidates.length) return null;
  const taunting = candidates.filter((member) => member.tauntTurns > 0);
  if (taunting.length) return pick(taunting);

  const total = candidates.reduce((sum, member) => sum + formationTargetWeight(member, enemy), 0);
  let rollValue = Math.random() * total;
  for (const member of candidates) {
    rollValue -= formationTargetWeight(member, enemy);
    if (rollValue <= 0) return member;
  }
  return candidates.at(-1);
}

function damageFor(attackerAtk, defenderDef = 0) {
  return Math.max(1, attackerAtk - defenderDef);
}

function effectiveDex(unit) {
  const baseDex = unit.baseDex || unit.dex || 0;
  return unit.slowTurns > 0 ? Math.max(1, Math.floor(baseDex * 0.5)) : baseDex;
}

function physicalCriticalChance(attacker, focused = false) {
  const dex = effectiveDex(attacker);
  const luc = attacker.luc || 0;
  const baseChance = (5 + dex * 0.3 + luc * 0.5) / 100;
  const equipmentBonus = Math.max(0, Number(attacker?.criticalRate) || 0);
  const focusBonus = focused ? 0.25 : 0;
  return Math.min(0.5, baseChance + equipmentBonus + focusBonus);
}

function rollPhysicalHit(damage, attacker, focused = false) {
  const critical = Math.random() < physicalCriticalChance(attacker, focused);
  return {
    damage: critical ? Math.max(1, Math.floor(damage * 1.5)) : damage,
    critical,
  };
}

function damageResultText(target, damage, critical = false) {
  return `${critical ? "クリティカル！" : ""}${target.name}に${damage}ダメージ`;
}

function formationPriority(member) {
  if (member.formation === "前衛") return 0;
  if (member.formation === "中衛") return 1;
  if (member.formation === "後衛") return 2;
  return 1;
}

function hpClass(unit) {
  const hpRate = unit.maxHp > 0 ? (unit.hp / unit.maxHp) * 100 : 0;
  if (unit.hp <= 0) return "hp-down";
  if (hpRate < 30) return "hp-danger";
  if (hpRate < 50) return "hp-caution";
  if (hpRate < 70) return "hp-warn";
  return "hp-safe";
}

function statusLabels(unit) {
  const labels = [];
  const poisonTurns = unit[STATUS_EFFECTS.poison.turnKey] || 0;
  if (poisonTurns > 0 && unit.poisonTier !== "venom") labels.push(`${STATUS_EFFECTS.poison.label}${poisonTurns}`);
  if (poisonTurns > 0 && unit.poisonTier === "venom") labels.push(`猛毒${poisonTurns}`);
  if (unit[STATUS_EFFECTS.curse.turnKey] > 0) labels.push(`${STATUS_EFFECTS.curse.label}${unit[STATUS_EFFECTS.curse.turnKey]}`);
  if (unit[STATUS_EFFECTS.burn.turnKey] > 0) labels.push(`${STATUS_EFFECTS.burn.label}${unit[STATUS_EFFECTS.burn.turnKey]}`);
  if (unit[STATUS_EFFECTS.paralyze.turnKey] > 0) labels.push(`${STATUS_EFFECTS.paralyze.label}${unit[STATUS_EFFECTS.paralyze.turnKey]}`);
  if (unit[STATUS_EFFECTS.blind.turnKey] > 0) labels.push(`${STATUS_EFFECTS.blind.label}${unit[STATUS_EFFECTS.blind.turnKey]}`);
  if (unit[STATUS_EFFECTS.slow.turnKey] > 0) labels.push(`スロー${unit[STATUS_EFFECTS.slow.turnKey]}`);
  return labels;
}

function hpLabel(unit) {
  const statuses = statusLabels(unit);
  const statusText = statuses.length ? `<span class="status-tags">【${statuses.join(" ")}】</span>` : "";
  const tempText = unit.tempHp > 0 ? `<span class="temp-hp">＋${unit.tempHp}</span>` : "";
  return `<span class="hp-text ${hpClass(unit)}"><span class="hp-name">${unit.name}</span>（<span class="hp-value">${unit.hp}${tempText}/${unit.maxHp}</span>）${statusText}</span>`;
}

function pushHp(events, unit, kind = "") {
  events.push({ kind, text: hpLabel(unit) });
}

function pushInitialHp(events, unit, kind = "") {
  events.push({ kind: `initial-hp ${kind}`.trim(), text: hpLabel(unit) });
}

function pushActionBreak(events) {
  events.push({ kind: "action-break", text: "" });
}

function pushPartyHp(events, party) {
  for (const member of party) {
    pushInitialHp(events, member, member.hp <= 0 ? "down" : "");
  }
}

function snapshotPartyHp(party) {
  return party.map((member) => ({
    id: member.id,
    hp: member.hp,
    maxHp: member.maxHp,
  }));
}

function bossLinesFor(member) {
  return MEMBER_BOSS_LINES[member.name] || JOB_BOSS_LINES[member.job] || null;
}

function returnLinesFor(member) {
  return MEMBER_RETURN_LINES[member.name] || JOB_RETURN_LINES[member.job] || null;
}

function pickBossLine(member, hpSnapshot) {
  const lines = bossLinesFor(member);
  if (!lines) return "来るぞ。構えろ";
  const hpRate = hpSnapshot.maxHp > 0 ? (hpSnapshot.hp / hpSnapshot.maxHp) * 100 : 0;
  const pool = hpRate <= 30 && lines.critical?.length ? lines.critical : lines.normal;
  return pool?.length ? pick(pool) : "来るぞ。構えろ";
}

function pickReturnLine(member, hpSnapshot) {
  const lines = returnLinesFor(member);
  if (!lines) return "戻りました。報告します";
  const hpRate = hpSnapshot.maxHp > 0 ? (hpSnapshot.hp / hpSnapshot.maxHp) * 100 : 0;
  const pool = hpRate <= 30 && lines.wounded?.length ? lines.wounded : lines.normal;
  return pool?.length ? pick(pool) : "戻りました。報告します";
}

function buildBossPreludeEvents(members, hpSnapshot) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const hpSource = hpSnapshot?.length ? hpSnapshot : snapshotPartyHp(members);
  const candidates = hpSource
    .filter((hp) => hp.hp > 0)
    .map((hp) => ({ member: memberById.get(hp.id), hp }))
    .filter(({ member }) => member);
  if (!candidates.length) return [];

  const speakers = candidates.sort(() => Math.random() - 0.5).slice(0, 2);
  return speakers
    .map(({ member, hp }) => {
      const line = pickBossLine(member, hp);
      return line ? { kind: "voice", text: `${member.name}「${line}」` } : null;
    })
    .filter(Boolean);
}

function buildReturnEvents(members, hpSnapshot, mvpLine = null) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const hpSource = hpSnapshot?.length ? hpSnapshot : snapshotPartyHp(members);
  const candidates = hpSource
    .filter((hp) => hp.hp > 0)
    .map((hp) => ({ member: memberById.get(hp.id), hp }))
    .filter(({ member }) => member);
  if (!candidates.length) return [];

  const mvpName = mvpLine?.match(/^今回もっとも活躍したのは(.+)だったようだ。$/)?.[1];
  if (!mvpName) return [];

  const mvp = candidates.find(({ member }) => member.name === mvpName);
  if (!mvp) return [];

  return [
    {
      kind: "voice",
      text: `${mvp.member.name}「${pickReturnLine(mvp.member, mvp.hp)}」`,
    },
  ];
}

function memberBattleLines(member) {
  return MEMBER_BATTLE_LINES[member.name] || JOB_BATTLE_LINES[member.job] || null;
}

function pushMemberLine(member, stage, events, speechState, chance = 1) {
  const lines = memberBattleLines(member);
  if (!lines?.[stage]) return;
  if (!speechState[member.id]) speechState[member.id] = {};
  if (speechState[member.id][stage]) return;
  if (Math.random() > chance) return;

  speechState[member.id][stage] = true;
  events.push({
    kind: stage === "down" ? "down" : "voice",
    text: `${member.name}「${lines[stage]}」`,
  });
}

function reactToHpDrop(member, beforeHp, events, speechState) {
  if (beforeHp <= member.hp) return;
  if (member.hp <= 0) return;
  const hpRate = member.maxHp > 0 ? (member.hp / member.maxHp) * 100 : 0;
  if (hpRate <= 30) {
    pushMemberLine(member, "critical", events, speechState, 0.55);
  } else if (hpRate <= 50) {
    pushMemberLine(member, "wounded", events, speechState, 0.35);
  }
}

function hpRate(unit) {
  return unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
}

function lowestHpLivingMember(party) {
  return livingMembers(party).sort((a, b) => hpRate(a) - hpRate(b))[0] || null;
}

function magicBarrierTarget(party) {
  return livingMembers(party)
    .filter((member) => !member.magicBarrier && hpRate(member) <= 0.65)
    .sort((a, b) => {
      const formationDiff = formationPriority(a) - formationPriority(b);
      if (formationDiff) return formationDiff;
      return hpRate(a) - hpRate(b);
    })[0] || null;
}

function recoverHp(target, amount) {
  const before = target.hp;
  target.hp = clamp(target.hp + amount, 0, target.maxHp);
  return target.hp - before;
}

function getHealingPower(actor) {
  return Math.max(0, Number(actor?.atk) || 0);
}

function healingAmount(actor, min, max, levelScale, atkScale = 0) {
  return roll(min, max) + Math.floor(actor.level * levelScale) + Math.floor(getHealingPower(actor) * atkScale);
}

function grantTempHp(target, amount) {
  target.tempHp = (target.tempHp || 0) + amount;
  return amount;
}

function applyDamageToMember(target, damage) {
  const adjustedDamage = target?.[STATUS_EFFECTS.curse.turnKey] > 0
    ? Math.max(1, Math.floor(damage * 1.2))
    : damage;
  const absorbed = Math.min(target.tempHp || 0, adjustedDamage);
  if (absorbed > 0) target.tempHp -= absorbed;
  const hpDamage = adjustedDamage - absorbed;
  target.hp = clamp(target.hp - hpDamage, 0, target.maxHp);
}

function clearTempHp(party) {
  party.forEach((member) => {
    member.tempHp = 0;
  });
}

function hasBadStatus(member) {
  return (
    member[STATUS_EFFECTS.poison.turnKey] > 0 ||
    member[STATUS_EFFECTS.curse.turnKey] > 0 ||
    member.poisonTier === "venom" ||
    member[STATUS_EFFECTS.paralyze.turnKey] > 0 ||
    member[STATUS_EFFECTS.burn.turnKey] > 0 ||
    member[STATUS_EFFECTS.blind.turnKey] > 0 ||
    member[STATUS_EFFECTS.slow.turnKey] > 0
  );
}

function clearBadStatus(member) {
  member[STATUS_EFFECTS.poison.turnKey] = 0;
  member[STATUS_EFFECTS.curse.turnKey] = 0;
  member.poisonTier = null;
  member[STATUS_EFFECTS.paralyze.turnKey] = 0;
  member[STATUS_EFFECTS.burn.turnKey] = 0;
  member[STATUS_EFFECTS.blind.turnKey] = 0;
  member[STATUS_EFFECTS.slow.turnKey] = 0;
}

function consumeReviveEquipment(member) {
  if (member.reviveEquipmentUsed) return false;
  if (!member.reviveEquipment && !member.hasReviveEquipment) return false;
  member.reviveEquipmentUsed = true;
  return true;
}

function trySurviveFatalDamage(member, events, party = null, canUsePriestBlessing = false) {
  if (member.hp > 0) return true;

  if (canUsePriestBlessing && member && !member.divineGraceUsed) {
    member.divineGraceUsed = true;
    member.hp = 1;
    member.pendingDownConfirm = false;
    events.push({ kind: "heal", text: `${member.name}は神の加護に守られた。` });
    if (Math.random() < 0.15) {
      events.push({ kind: "voice", text: `${member.name}<br>「……まだ終われません」` });
    }
    pushHp(events, member, "heal");
    return true;
  }

  if (member.divineBlessing || member.godBlessing || member.blessingTurns > 0) {
    member.hp = Math.max(1, Math.floor(member.maxHp * 0.3));
    member.pendingDownConfirm = false;
    member.divineBlessing = false;
    member.godBlessing = false;
    member.blessingTurns = 0;
    events.push({ kind: "heal", text: `${member.name}は神の祝福で踏みとどまった。` });
    pushHp(events, member, "heal");
    return true;
  }

  if (consumeReviveEquipment(member)) {
    member.hp = Math.max(1, Math.floor(member.maxHp * 0.25));
    member.pendingDownConfirm = false;
    events.push({ kind: "heal", text: `${member.name}は復活装備で踏みとどまった。` });
    pushHp(events, member, "heal");
    return true;
  }

  if ((member.guts || member.hasGuts) && !member.gutsUsed) {
    member.gutsUsed = true;
    member.hp = 1;
    member.pendingDownConfirm = false;
    events.push({ kind: "heal", text: `${member.name}は根性で踏みとどまった。` });
    pushHp(events, member, "heal");
    return true;
  }

  return false;
}

function canPartyReviveDownedMember(party, downedMember) {
  return party.some(
    (member) => member.job === "priest" && member.hp > 0 && member.id !== downedMember.id
  );
}

function pickFinalDownSpeaker(party) {
  const downed = party.filter((member) => member.hp <= 0 && member.pendingDownConfirm);
  if (!downed.length) return null;
  const downedPriest = downed.find((member) => member.job === "priest");
  if (downedPriest) return downedPriest;
  return downed.sort((a, b) => (b.downOrder || 0) - (a.downOrder || 0))[0];
}

function confirmMemberDown(member, events, speechState) {
  member.guard = false;
  member.ironWall = false;
  member.actionConsumed = false;
  member.desperateVulnerable = false;
  if (!member.pendingDownConfirm) {
    events.push({ kind: "enemy-action down", text: `${member.name}は戦闘不能になった。` });
    speechState.downOrderCounter = (speechState.downOrderCounter || 0) + 1;
    member.downOrder = speechState.downOrderCounter;
  }
  member.pendingDownConfirm = true;
}

function confirmRemainingDownMembers(party, events, speechState, allowFinalLine = true) {
  const finalSpeaker = pickFinalDownSpeaker(party);
  if (
    allowFinalLine &&
    finalSpeaker &&
    !canPartyReviveDownedMember(party, finalSpeaker) &&
    !speechState.finalDownLineSpoken
  ) {
    pushMemberLine(finalSpeaker, "down", events, speechState, 1);
    speechState.finalDownLineSpoken = true;
  }

  for (const member of party) {
    if (member.hp > 0 || !member.pendingDownConfirm) continue;
    member.pendingDownConfirm = false;
  }
}

function performPriestAction(actor, party, enemy, events) {
  const fallen = party.filter((m) => m.hp <= 0);
  const canResurrect = isSkillEnabled(actor, "resurrect");
  const canResura = isSkillEnabled(actor, "resura");
  if (fallen.length && ((canResurrect && !actor.sureReviveUsed) || canResura)) {
    const target = pick(fallen);
    const sureRevive = canResurrect && !actor.sureReviveUsed;
    if (!sureRevive && !canResura) return;
    events.push({ kind: "heal", text: `${actor.name}は${sureRevive ? "リザレクト" : "リザラ"}を唱えた。` });
    if (sureRevive || Math.random() < 0.5) {
      actor.sureReviveUsed = actor.sureReviveUsed || sureRevive;
      target.hp = Math.max(1, Math.floor(target.maxHp * (sureRevive ? 0.35 : 0.25)));
      target.tempHp = 0;
      clearBadStatus(target);
      target.pendingDownConfirm = false;
      events.push({ kind: "heal", text: sureRevive ? `${target.name}は再び立ち上がった。` : `${target.name}が立ち上がった。` });
      pushHp(events, target, "heal");
    } else {
      events.push({ kind: "heal", text: "祈りは届かなかった。" });
    }
    return;
  }

  const statusTarget = livingMembers(party).find(hasBadStatus);
  if (statusTarget && isSkillEnabled(actor, "prayer")) {
    clearBadStatus(statusTarget);
    events.push({ kind: "heal", text: `${actor.name}は祈りを捧げた。` });
    events.push({ kind: "heal", text: `${statusTarget.name}の状態が安定した。` });
    return;
  }

  const lowest = lowestHpLivingMember(party);
  if (lowest && hpRate(lowest) <= 0.3 && isSkillEnabled(actor, "middleHeal")) {
    const amount = healingAmount(actor, 15, 22, 2, 0.65);
    const healed = recoverHp(lowest, amount);
    events.push({ kind: "heal", text: `${actor.name}のミドルヒール！` });
    events.push({ kind: "heal", text: `${lowest.name}のHPが${healed}回復した。` });
    pushHp(events, lowest, "heal");
    return;
  }

  const wounded = livingMembers(party)
    .filter((m) => m.hp < Math.floor(m.maxHp * 0.45))
    .sort((a, b) => hpRate(a) - hpRate(b))[0];

  if (wounded && isSkillEnabled(actor, "heal")) {
    const amount = healingAmount(actor, 8, 13, 1.4, 0.4);
    const healed = recoverHp(wounded, amount);
    events.push({ kind: "heal", text: `${actor.name}のヒール！` });
    events.push({ kind: "heal", text: `${wounded.name}のHPが${healed}回復した。` });
    pushHp(events, wounded, "heal");
    return;
  }

  const groupTargets = livingMembers(party).filter((m) => hpRate(m) <= 0.75 && m.hp < m.maxHp);
  if (groupTargets.length >= 2 && isSkillEnabled(actor, "healRain")) {
    const amount = healingAmount(actor, 5, 8, 0.8, 0.25);
    events.push({ kind: "heal", text: `${actor.name}のヒールレイン！` });
    events.push({ kind: "heal", text: `全員のHPが${amount}回復した。` });
    for (const target of livingMembers(party)) {
      recoverHp(target, amount);
      pushHp(events, target, "heal");
    }
    return;
  }

  const barrierTarget = magicBarrierTarget(party);
  if (barrierTarget && isSkillEnabled(actor, "magicBarrier")) {
    barrierTarget.magicBarrier = true;
    events.push({ kind: "heal", text: `${actor.name}は${barrierTarget.name}に魔力障壁を張った。` });
    return;
  }

  const baseDamage = Math.max(1, Math.floor(damageFor(actor.atk, enemy.def) * 0.75));
  const hit = rollPhysicalHit(baseDamage, actor);
  const { damage } = hit;
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}が杖で牽制。` });
  events.push({ kind: "", text: `${damageResultText(enemy, damage, hit.critical)}。` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function targetEnemyGroup(enemy, enemies = null) {
  const target = enemy && enemy.hp > 0 ? enemy : pickLivingEnemy(enemies);
  return target ? [target] : [];
}

function applyEnemySlow(enemy) {
  enemy.baseDex = enemy.baseDex || enemy.dex || 1;
  enemy.slowTurns = 2;
}

function tickEnemySlow(enemy) {
  if (!enemy.slowTurns) return;
  enemy.slowTurns -= 1;
  if (enemy.slowTurns <= 0) enemy.slowTurns = 0;
}

function applyEnemyBlind(enemy) {
  if (enemy.blindTurns > 0) return false;
  enemy.blindTurns = 2;
  return true;
}

function tickEnemyBlind(enemy) {
  if (!enemy.blindTurns) return;
  enemy.blindTurns -= 1;
  if (enemy.blindTurns <= 0) enemy.blindTurns = 0;
}

function tickEnemyTurnStatuses(enemy) {
  tickEnemySlow(enemy);
  tickEnemyBlind(enemy);
}

function tickParalyze(member) {
  if (!member.paralyzeTurns) return;
  member.paralyzeTurns -= 1;
  if (member.paralyzeTurns <= 0) member.paralyzeTurns = 0;
}

function tickMemberTurnStatuses(member, events = null) {
  if (member.hp <= 0) return;
  if (!member?.[STATUS_EFFECTS.curse.turnKey]) return;
  member[STATUS_EFFECTS.curse.turnKey] -= 1;
  if (member[STATUS_EFFECTS.curse.turnKey] <= 0) {
    member[STATUS_EFFECTS.curse.turnKey] = 0;
    if (events) {
      events.push({ kind: "heal", text: `${member.name}を覆う呪いが薄れた。` });
    }
  }
}

function shouldSkipParalyzedAction(member, events) {
  if (!member.paralyzeTurns) return false;
  const skip = Math.random() < 0.5;
  if (skip) {
    events.push({ kind: "voice", text: `${member.name}は体がしびれて動けない。` });
  }
  tickParalyze(member);
  return skip;
}

function applyEnemyPoison(enemy, events) {
  if (enemy.poisonTurns > 0) {
    enemy.poisonTier = "venom";
    enemy.poisonTurns = 3;
    events.push({ kind: "spell", text: `${enemy.name}は猛毒化した。` });
    return;
  }

  enemy.poisonTier = "poison";
  enemy.poisonTurns = 3;
  events.push({ kind: "spell", text: `${enemy.name}は毒に侵された。` });
}

function applyEnemyBurn(enemy, events) {
  enemy.burnTurns = 2;
  events.push({ kind: "spell", text: `${enemy.name}は火傷を負った。` });
}

// 注意:
// 敵専用ではない
// 味方にも使用中
// 名称変更禁止
function tryApplyEquipmentStrikeOptions(actor, enemy, events) {
  if (!actor || !enemy || enemy.hp <= 0) return;
  const rates = typeof getEquipmentStatusStrikeRates === "function"
    ? getEquipmentStatusStrikeRates(actor)
    : { blind: 0, poison: 0 };
  if (rates.blind > 0 && Math.random() < rates.blind) {
    if (applyEnemyBlind(enemy)) {
      pushHp(events, enemy);
      return;
    }
  }
  if (rates.poison > 0 && Math.random() < rates.poison) {
    applyEnemyPoison(enemy, events);
    pushHp(events, enemy);
  }
}

function tickEnemyDots(enemy, events, kind = "enemy-action") {
  if (enemy.hp <= 0) return;

  if (enemy.poisonTurns > 0) {
    const baseDamage = Math.max(3, Math.floor(enemy.maxHp * 0.05));
    const damage = enemy.poisonTier === "venom" ? baseDamage * 2 : baseDamage;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind, text: `${enemy.name}は毒で${damage}ダメージ。` });
    if (enemy.hp <= 0) enemy.dotDefeatText = `${enemy.name}は毒で倒れた。`;
    enemy.poisonTurns -= 1;
    if (enemy.poisonTurns <= 0) {
      enemy.poisonTurns = 0;
      enemy.poisonTier = null;
    }
    pushHp(events, enemy, enemy.hp <= 0 ? `${kind} down` : kind);
  }

  if (enemy.hp <= 0) return;

  if (enemy.burnTurns > 0) {
    const damage = Math.max(4, Math.floor(enemy.maxHp * 0.06));
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind, text: `${enemy.name}は火傷で${damage}ダメージ。` });
    if (enemy.hp <= 0) enemy.dotDefeatText = `${enemy.name}は火傷で倒れた。`;
    enemy.burnTurns -= 1;
    if (enemy.burnTurns <= 0) enemy.burnTurns = 0;
    pushHp(events, enemy, enemy.hp <= 0 ? `${kind} down` : kind);
  }
}

function performMageAction(actor, enemy, events, enemies = null) {
  enemy = enemy && enemy.hp > 0 ? enemy : pickLivingEnemy(enemies);
  if (!enemy) return;
  const lightningSkill = getSkillDefinition(actor, "lightning");
  if (isSkillEnabled(actor, "acidMist") && Math.random() < 0.35) {
    const focused = isSkillEnabled(actor, "magicFocus") && Math.random() < 0.3;
    if (focused) events.push({ kind: "spell", text: `${actor.name}は魔力を集中した。` });
    const baseDamage = damageFor(Math.floor(actor.atk * 0.5) + Math.floor(actor.level / 2), Math.floor(enemy.def * 0.2));
    const damage = focused ? Math.floor(baseDamage * 1.5) : baseDamage;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${actor.name}のアシッドミスト！` });
    events.push({ kind: "spell", text: `${enemy.name}に${damage}ダメージ。` });
    if (enemy.hp > 0) {
      applyEnemyPoison(enemy, events);
      pushHp(events, enemy);
    } else {
      pushHp(events, enemy, "down");
    }
    return;
  }

  const skillRoll = Math.random();
  if (isSkillEnabled(actor, "lightning") && skillRoll < 0.3) {
    const focused = isSkillEnabled(actor, "magicFocus") && Math.random() < 0.3;
    if (focused) events.push({ kind: "spell", text: `${actor.name}は魔力を集中した。` });
    events.push({ kind: "spell", text: `${actor.name}の雷撃！` });
    if (!focused && Math.random() >= 0.85) {
      events.push({ kind: "spell", text: `${actor.name}の雷撃は外れた。` });
      return;
    }
    const baseDamage = damageFor(Math.floor(actor.atk * 1.8) + actor.level, Math.floor(enemy.def * 0.25));
    const damage = focused ? Math.floor(baseDamage * 1.5) : baseDamage;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${enemy.name}に${damage}ダメージ。` });
    if (
      enemy.hp > 0 &&
      lightningSkill?.effect === "paralyze" &&
      !enemy.paralyzeTurns &&
      Math.random() < (lightningSkill.effectChance || 0)
    ) {
      enemy.paralyzeTurns = lightningSkill.effectTurns || 0;
      events.push({ kind: "spell", text: `${enemy.name}の体がしびれた。` });
    }
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    return;
  }

  if (isSkillEnabled(actor, "iceLance") && skillRoll < 0.7) {
    const focused = isSkillEnabled(actor, "magicFocus") && Math.random() < 0.3;
    if (focused) events.push({ kind: "spell", text: `${actor.name}は魔力を集中した。` });
    events.push({ kind: "spell", text: `${actor.name}の氷槍。` });

    for (const target of targetEnemyGroup(enemy, enemies)) {
      if (target.hp <= 0) continue;
      if (!focused && Math.random() >= 0.9) {
        events.push({ kind: "spell", text: `${target.name}には当たらなかった。` });
        continue;
      }

      const baseDamage = damageFor(Math.floor(actor.atk * 0.8) + actor.level, Math.floor(target.def * 0.3));
      const damage = focused ? Math.floor(baseDamage * 1.5) : baseDamage;
      target.hp = clamp(target.hp - damage, 0, target.maxHp);
      events.push({ kind: "spell", text: `${target.name}に${damage}ダメージ。` });

      if (target.hp > 0 && !target.slowTurns && Math.random() < 0.3) {
        applyEnemySlow(target);
        events.push({ kind: "spell", text: `${target.name}の動きが鈍った。` });
        pushHp(events, target);
      } else {
        pushHp(events, target, target.hp <= 0 ? "down" : "");
      }
    }
    return;
  }

  if (isSkillEnabled(actor, "firebolt") && skillRoll < 0.9) {
    const focused = isSkillEnabled(actor, "magicFocus") && Math.random() < 0.3;
    if (focused) events.push({ kind: "spell", text: `${actor.name}は魔力を集中した。` });
    const baseDamage = damageFor(actor.atk + 8 + actor.level, Math.floor(enemy.def * 0.35));
    const damage = focused ? Math.floor(baseDamage * 1.5) : baseDamage;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${actor.name}の火球。${enemy.name}に${damage}ダメージ。` });
    if (enemy.hp > 0 && Math.random() < 0.3) {
      applyEnemyBurn(enemy, events);
      pushHp(events, enemy);
    } else {
      pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    }
    return;
  }

  const damage = damageFor(actor.atk, enemy.def);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}の攻撃！ ${enemy.name}に${damage}ダメージ！` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function performScoutAction(actor, party, enemy, events, enemies = null) {
  enemy = enemy && enemy.hp > 0 ? enemy : pickLivingEnemy(enemies);
  if (!enemy) return;
  if (actor.focusTurns > 0) {
    actor.focusTurns -= 1;
  }

  const criticalAlly = livingMembers(party)
    .filter((member) => member.hp < Math.floor(member.maxHp * 0.3))
    .sort((a, b) => hpRate(a) - hpRate(b))[0];
  if (criticalAlly && isSkillEnabled(actor, "firstAid") && Math.random() < 0.55) {
    const amount = roll(5, 9) + Math.floor(actor.level * 0.7);
    const guarded = grantTempHp(criticalAlly, amount);
    events.push({ kind: "heal", text: `${actor.name}は応急手当をした。` });
    events.push({ kind: "heal", text: `${criticalAlly.name}にバリアを付与した。` });
    pushHp(events, criticalAlly, "heal");
    return;
  }

  if (enemy.hp > 0 && !enemy.blindTurns && isSkillEnabled(actor, "blind") && Math.random() < 0.4) {
    if (applyEnemyBlind(enemy)) {
      events.push({ kind: "voice", text: `${actor.name}は目つぶしを使った。` });
      events.push({ kind: "voice", text: `${enemy.name}の視界を奪った。` });
      pushHp(events, enemy);
      return;
    }
  }

  if (!actor.focusTurns && isSkillEnabled(actor, "rogueFocus") && Math.random() < 0.35) {
    actor.focusTurns = 2;
    events.push({ kind: "voice", text: `${actor.name}は集中している。` });
    return;
  }

  const focused = actor.focusTurns > 0;
  const baseDamage = damageFor(actor.atk, enemy.def);
  const hit = rollPhysicalHit(baseDamage, actor, focused);
  const { damage } = hit;
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}の攻撃。` });
  events.push({ kind: "", text: `${damageResultText(enemy, damage, hit.critical)}。` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function shouldWarriorDefend(actor) {
  if (actor.job !== "warrior" || actor.hp <= 0 || !isSkillEnabled(actor, "guard")) return false;
  const hpRate = actor.maxHp > 0 ? (actor.hp / actor.maxHp) * 100 : 0;
  if (hpRate <= 30) return Math.random() < 0.45;
  if (hpRate <= 50) return Math.random() < 0.25;
  return false;
}

function shouldWarriorIronWall(actor, enemyCount = 1) {
  if (
    actor.job !== "warrior" ||
    actor.hp <= 0 ||
    actor.ironWall ||
    (actor.ironWallCooldown || 0) > 0 ||
    !isSkillEnabled(actor, "ironWall")
  ) return false;
  const hpRate = actor.maxHp > 0 ? (actor.hp / actor.maxHp) * 100 : 0;
  return hpRate <= 50 || enemyCount >= 2;
}

function startMemberTurn(member, events = null) {
  const wasIronWall = !!member.ironWall;
  member.guard = false;
  member.ironWall = false;
  member.actionConsumed = false;
  member.tauntCheckedThisTurn = false;
  tickMemberTurnStatuses(member, events);
  if ((member.ironWallCooldown || 0) > 0) {
    member.ironWallCooldown -= 1;
    if (member.ironWallCooldown < 0) member.ironWallCooldown = 0;
  }
  return { wasIronWall };
}

function tickTaunts(party) {
  for (const member of party) {
    if (member.hp <= 0) {
      member.tauntTurns = 0;
    } else if (member.tauntTurns > 0) {
      member.tauntTurns -= 1;
    }
  }
}

function performWarriorIronWallActive(member, events, continued = false) {
  member.ironWall = true;
  member.actionConsumed = true;
  member.ironWallCooldown = 3;
  events.push({
    kind: "guard",
    text: continued ? `${member.name}は鉄壁の構えを取っている。` : `${member.name}は鉄壁の構えを取った。`,
  });
  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${member.name}「ここは通さない」` });
  }
}

function performWarriorTauntActive(member, events) {
  member.tauntTurns = 2;
  member.actionConsumed = true;
  events.push({ kind: "guard", text: `${member.name}の挑発。` });
  events.push({ kind: "guard", text: `${member.name}が敵を引きつけた。` });
  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${member.name}「こちらだ」` });
  }
}

function performWarriorDefendPassive(member, events) {
  member.guard = true;
  events.push({ kind: "guard", text: `${member.name}は盾を構えた。` });
  events.push({ kind: "guard", text: `次の行動まで受けるダメージを50%軽減。` });
}

function performTurnStartSkillChecks(party, enemies, events) {
  const enemyCount = livingEnemies(enemies).length;
  if (!enemyCount) return;
  for (const member of party) {
    const turnState = startMemberTurn(member, events);
    if (member.hp <= 0) continue;

    // Active defensive skills consume the member's normal action.
    if (shouldWarriorIronWall(member, enemyCount)) {
      performWarriorIronWallActive(member, events, turnState.wasIronWall);
      continue;
    }

    if (shouldWarriorTaunt(member, party)) {
      performWarriorTauntActive(member, events);
      continue;
    }
    member.tauntCheckedThisTurn = true;

    // Passive defenses do not consume the member's normal action.
    if (!shouldWarriorDefend(member)) continue;
    performWarriorDefendPassive(member, events);
  }
}

function shouldWarriorTaunt(actor, party) {
  if (
    actor.job !== "warrior" ||
    actor.hp <= 0 ||
    actor.tauntTurns > 0 ||
    actor.tauntCheckedThisTurn ||
    !isSkillEnabled(actor, "provoke")
  ) return false;
  const needsAttention = livingMembers(party).some((member) => {
    if (member.id === actor.id || member.maxHp <= 0) return false;
    const hpRate = (member.hp / member.maxHp) * 100;
    return hpRate <= 50 || (member.formation === "後衛" && hpRate <= 70);
  });
  return needsAttention && Math.random() < 0.5;
}

function shouldWarriorDesperateStrike(actor) {
  if (actor.job !== "warrior" || actor.hp <= 0 || actor.ironWall || !isSkillEnabled(actor, "desperateStrike")) return false;
  return Math.random() < 0.3;
}

function performWarriorAction(actor, party, enemy, events, enemies = null) {
  enemy = enemy && enemy.hp > 0 ? enemy : pickLivingEnemy(enemies);
  if (!enemy) return;
  // Active actions in this block consume the normal attack.
  if (shouldWarriorTaunt(actor, party)) {
    actor.tauntTurns = 2;
    events.push({ kind: "guard", text: `${actor.name}の挑発。` });
    events.push({ kind: "guard", text: `${actor.name}が敵を引きつけた。` });
    if (Math.random() < 0.15) {
      events.push({ kind: "voice", text: `${actor.name}「こちらだ」` });
    }
    return;
  }

  if (shouldWarriorDesperateStrike(actor)) {
    actor.desperateVulnerable = true;
    const baseDamage = Math.max(1, Math.floor(damageFor(actor.atk, enemy.def) * 1.8));
    const hit = rollPhysicalHit(baseDamage, actor);
    const { damage } = hit;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "guard", text: `${actor.name}は捨て身に出た。` });
    if (Math.random() < 0.15) {
      events.push({ kind: "voice", text: `${actor.name}「行くぞ」` });
    }
    events.push({ kind: "", text: `${actor.name}の攻撃。` });
    events.push({ kind: "", text: `${damageResultText(enemy, damage, hit.critical)}。` });
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    return;
  }

  const hit = rollPhysicalHit(damageFor(actor.atk, enemy.def), actor);
  const { damage } = hit;
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}の攻撃。` });
  events.push({ kind: "", text: `${damageResultText(enemy, damage, hit.critical)}。` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function performMemberAction(actor, party, enemies, events) {
  const enemy = pickLivingEnemy(enemies);
  if (actor.hp <= 0 || !enemy) return;
  if (actor.actionConsumed) return;
  if (shouldSkipParalyzedAction(actor, events)) return;
  const hpBeforeAction = enemy.hp;
  if (actor.job === "priest") performPriestAction(actor, party, enemy, events);
  else if (actor.job === "mage") performMageAction(actor, enemy, events, enemies);
  else if (actor.job === "scout") performScoutAction(actor, party, enemy, events, enemies);
  else performWarriorAction(actor, party, enemy, events, enemies);
  if (enemy.hp > 0 && enemy.hp < hpBeforeAction) {
    tryApplyEquipmentStrikeOptions(actor, enemy, events);
  }
}

function shouldCoverTarget(target) {
  if (!target || target.hp <= 0 || target.maxHp <= 0) return false;
  return (target.hp / target.maxHp) * 100 <= 70;
}

function isLargeIncomingDamage(target, predictedDamage) {
  if (!target || target.maxHp <= 0 || predictedDamage == null) return false;
  return predictedDamage >= 8 || predictedDamage >= target.maxHp * 0.25;
}

function coverChanceFor(target) {
  const hpRate = target.maxHp > 0 ? (target.hp / target.maxHp) * 100 : 0;
  if (hpRate <= 25) return 1;
  if (hpRate <= 40) return 0.7;
  if (hpRate <= 70) return 0.5;
  return 0;
}

function pickCoverWarrior(party, target, predictedDamage) {
  if (!shouldCoverTarget(target)) return null;
  if (!isLargeIncomingDamage(target, predictedDamage)) return null;
  if (Math.random() >= coverChanceFor(target)) return null;

  const candidates = livingMembers(party).filter(
    (member) => member.job === "warrior" && member.id !== target.id && isSkillEnabled(member, "cover")
  );
  return candidates.length ? pick(candidates) : null;
}

function maybeCoverTarget(party, target, predictedDamage) {
  // Passive cover can redirect an enemy attack without consuming an action.
  const coverer = pickCoverWarrior(party, target, predictedDamage);
  return coverer ? { target: coverer, covered: target, coverer } : { target, covered: null, coverer: null };
}

function maybeCounterAttack(actor, enemy, events) {
  // Passive counter only happens after direct damage is taken.
  if (actor.job !== "warrior" || actor.hp <= 0 || enemy.hp <= 0) return;
  if (!isSkillEnabled(actor, "counter")) return;
  if (Math.random() >= 0.6) return;

  const damageRate = 0.5 + Math.random() * 0.3;
  const baseDamage = Math.max(1, Math.floor(actor.atk * damageRate));
  const hit = rollPhysicalHit(baseDamage, actor);
  const { damage } = hit;
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${actor.name}「こちらも返す」` });
  }
  events.push({ kind: "guard", text: `${actor.name}の反撃！` });
  events.push({ kind: "guard", text: `${damageResultText(enemy, damage, hit.critical)}。` });
  tryApplyEquipmentStrikeOptions(actor, enemy, events);
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function pickAmbushScout(party) {
  const scouts = livingScouts(party).filter((scout) => isSkillEnabled(scout, "ambush"));
  return scouts.length ? pick(scouts) : null;
}

function pushScoutAmbushEvents(scout, events) {
  if (!scout || scout.hp <= 0) return;
  events.push({ kind: "voice", text: `${scout.name}は奇襲を使った。` });
  events.push({ kind: "voice", text: `${scout.name}が最初に行動。` });
}

function actionOrderForRound(party, enemies, round, ambushScout) {
  const entries = [
    ...livingMembers(party).map((member, index) => ({
      side: "ally",
      unit: member,
      order: index,
      ambush: round === 1 && ambushScout?.id === member.id && member.hp > 0,
    })),
    ...livingEnemies(enemies).map((enemy, index) => ({
      side: "enemy",
      unit: enemy,
      order: livingMembers(party).length + index,
      ambush: false,
    })),
  ];
  return entries.sort((a, b) => {
    if (a.ambush !== b.ambush) return a.ambush ? -1 : 1;
    const dexDiff = effectiveDex(b.unit) - effectiveDex(a.unit);
    if (dexDiff) return dexDiff;
    return a.order - b.order;
  });
}

const DEFAULT_TREASURE_RATES = [0.6, 0.4, 0.2, 0.1];
const DEFAULT_TRAP_RATES = [0.6, 0.4, 0.2, 0.1];

function explorationRate(area, key, count, defaults) {
  const rates = Array.isArray(area?.[key]) ? area[key] : defaults;
  return rates[count] ?? rates.at(-1) ?? 0;
}

function buildScoutExplorationEvents(party, speechState = {}, area = null) {
  return [
    ...buildTreasureExplorationEvents(party, speechState, area),
    ...buildTrapExplorationEvents(party, speechState, area),
  ];
}

function buildTreasureExplorationEvents(party, speechState = {}, area = null) {
  const scouts = livingScouts(party).filter((scout) => isSkillEnabled(scout, "treasureFind"));
  if (!scouts.length) return [];

  const scout = pick(scouts);
  const events = [];
  const count = speechState.treasureFindCount || 0;
  const rate = explorationRate(area, "treasureRates", count, DEFAULT_TREASURE_RATES);
  if (Math.random() < rate) {
    speechState.treasureFindCount = count + 1;
    events.push({
      kind: "voice",
      skillId: "treasureFind",
      text: `${scout.name}が宝箱を見つけた。`,
      debug: [`宝箱回数:${count + 1}`, `今回確率:${Math.round(rate * 100)}%`, "追加抽選:+1"],
    });
  }

  return events;
}

function buildTrapExplorationEvents(party, speechState = {}, area = null) {
  const target = pick(livingMembers(party));
  const events = [];
  if (!target) return events;

  const count = speechState.trapDisarmCount || 0;
  const rate = explorationRate(area, "trapRates", count, DEFAULT_TRAP_RATES);
  if (Math.random() >= rate) return events;
  speechState.trapDisarmCount = count + 1;

  const dexRate = Math.min(70, Math.max(0, effectiveDex(target) * 3));
  const trapDisarmer = livingScouts(party).find((scout) => isSkillEnabled(scout, "trapDisarm"));
  const trapBonus = trapDisarmer ? 25 : 0;
  const avoidRate = Math.min(90, dexRate + trapBonus);
  const trapDamage = Math.max(1, Math.floor(target.maxHp * 0.1));
  const debug = [
    `罠回数:${count + 1}`,
    `今回確率:${Math.round(rate * 100)}%`,
    `罠回避率:${avoidRate}%`,
    `DEX補正:${dexRate}%`,
    ...(trapDisarmer ? ["盗賊補正:+25%"] : []),
    "罠ダメージ:最大HP10%",
  ];

  if (Math.random() * 100 < avoidRate) {
    events.push({
      kind: "voice",
      skillId: "trapDisarm",
      text: trapDisarmer
        ? `${trapDisarmer.name}が罠を解除した。<br>危険は未然に防がれた。`
        : `${target.name}は罠をかわした。`,
      debug,
    });
    return events;
  }

  target.hp = clamp(target.hp - trapDamage, 0, target.maxHp);
  events.push({
    kind: "voice",
    skillId: "trapDisarm",
    text: `罠が作動した。<br>${target.name}が${trapDamage}ダメージを受けた。`,
    debug,
    membersSnapshot: snapshotPartyHp(party),
  });
  return events;
}

function buildShortcutExplorationEvents(party, area = null) {
  const scouts = livingScouts(party);
  if (!scouts.length) return [];

  const scout = pick(scouts);
  const events = [];
  const rate = Number.isFinite(area?.shortcutRate) ? area.shortcutRate : 1;
  if (isSkillEnabled(scout, "shortcutFind") && Math.random() < rate) {
    events.push({
      kind: "voice",
      skillId: "shortcutFind",
      text: `${scout.name}が近道を見つけた。<br>予定より早く帰還できそうだ。`,
      debug: ["発動率:100%", "帰還時間:-10%"],
    });
  }

  return events;
}

function dropKindForMonster(monster) {
  if (monster?.boss) return "boss";
  if (monster?.rare) return "rare";
  return "normal";
}

function pickWeightedKey(weights) {
  const entries = Object.entries(weights || {}).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let rollValue = Math.random() * total;
  for (const [key, weight] of entries) {
    rollValue -= weight;
    if (rollValue <= 0) return key;
  }
  return entries.at(-1)?.[0] || "common";
}

function resolveDropCandidate(candidate) {
  if (typeof candidate === "string") {
    const found = EQUIPMENT_DROPS.find((item) => item.id === candidate);
    return found
      ? {
          ...found,
          ...(found.options ? { options: found.options.map((option) => ({ ...option })) } : {}),
        }
      : null;
  }
  if (!candidate?.id) return candidate || null;
  const base = EQUIPMENT_DROPS.find((item) => item.id === candidate.id);
  if (base) {
    const merged = { ...base, ...candidate };
    if (base.options || candidate.options) {
      merged.options = (candidate.options || base.options || []).map((option) => ({ ...option }));
    }
    return merged;
  }
  return {
    ...candidate,
    ...(candidate.options ? { options: candidate.options.map((option) => ({ ...option })) } : {}),
  };
}

function pickDropFromPool(pool, rarity) {
  const matching = pool.filter((item) => (item.rarity || "common") === rarity);
  return pick(matching.length ? matching : pool);
}

function buildDropOption() {
  const optionIds = Object.keys(OPTION_MASTER || {});
  if (!optionIds.length) return [];

  const optionCount = pickWeightedKey({ 0: 40, 1: 30, 2: 20, 3: 10 });
  const count = Math.min(Number(optionCount) || 0, optionIds.length);
  if (count <= 0) return [];

  const pool = [...optionIds];
  const options = [];
  for (let i = 0; i < count; i += 1) {
    const index = roll(0, pool.length - 1);
    const [id] = pool.splice(index, 1);
    options.push({
      id,
      level: roll(1, 3),
    });
  }
  return options;
}

function rollEquipmentDrop(party, monster) {
  const kind = dropKindForMonster(monster);
  if (!EQUIPMENT_DROPS?.length || Math.random() >= (DROP_RATES[kind] ?? DROP_RATES.normal)) return null;

  const specificDrops = (monster?.drops || monster?.dropTable || []).map(resolveDropCandidate).filter(Boolean);
  const pool = specificDrops.length ? specificDrops : EQUIPMENT_DROPS;
  const rarity = pickWeightedKey(DROP_RARITY_WEIGHTS[kind] || DROP_RARITY_WEIGHTS.normal);
  const item = pickDropFromPool(pool, rarity);
  if (!item) return null;
  const finder = livingScouts(party)[0] || livingMembers(party)[0] || party[0];
  const options = buildDropOption();
  return {
    ...item,
    ...(options.length ? { options } : {}),
    finderName: finder?.name || "隊員",
  };
}

const RARITY_NAMES = new Set(["common", "uncommon", "rare", "set", "epic", "legendary", "artifact"]);

function normalizeRarity(rarity) {
  return RARITY_NAMES.has(rarity) ? rarity : "common";
}

function rarityClassName(rarity) {
  return `rarity-${normalizeRarity(rarity)}`;
}

function equipmentSellGoldValue(item) {
  const baseSellGold = Math.max(0, Number(item?.sellGold) || 0);
  const plus = Math.max(0, Number(item?.plus) || 0);
  const plusBonus = plus <= 0 ? 0 : Math.max(plus, Math.floor(baseSellGold * 0.1 * plus));
  const subtotal = baseSellGold + plusBonus;
  const researchProgress = typeof equipmentResearchProgress === "function" ? equipmentResearchProgress(item) : 0;
  const researchBonusRate = Math.max(0, Math.min(10, Math.floor(researchProgress / 10)));
  const researchBonus = Math.floor(subtotal * (researchBonusRate / 100));
  return subtotal + researchBonus;
}

function shouldAutoSellDrop(item) {
  const rarity = normalizeRarity(item?.rarity);
  const settings = typeof ensureAutoSellSettings === "function"
    ? ensureAutoSellSettings()
    : { common: false, uncommon: false };
  const autoSold = rarity === "common" || rarity === "uncommon" ? !!settings[rarity] : false;
  if (item && typeof item === "object") item.autoSold = autoSold;
  return autoSold;
}

function dropOptionLabels(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  return options
    .map((option) => {
      const meta = OPTION_MASTER?.[option?.id];
      if (!meta?.name) return "";
      const level = Number(option?.level) || 0;
      return `\u3010${meta.name}${level > 0 ? `Lv${level}` : ""}\u3011`;
    })
    .filter(Boolean)
    .join("");
}

function dropNameHtml(item) {
  if (!item?.name) return "";
  const setMark = item?.setId || normalizeRarity(item?.rarity) === "set"
    ? '<span class="set-item">（S）</span>'
    : "";
  return `<span class="${rarityClassName(item.rarity)}">${item.name}${setMark}</span>${dropOptionLabels(item)}`;
}

function performEnemyAction(enemy, party, enemies, area, heroLevel, events, speechState, round = 1) {
  if (enemy.hp <= 0) {
    tickEnemyTurnStatuses(enemy);
    return;
  }
  const eventCountBeforeAction = events.length;
  if (shouldSkipParalyzedAction(enemy, events)) {
    const latestEvent = events.at(-1);
    if (events.length > eventCountBeforeAction && latestEvent?.kind === "voice") {
      latestEvent.kind = "enemy-action";
    }
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }
  let target = pickEnemyTarget(party, enemy);
  if (!target) {
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  if (enemy.special === "selfDestruct") {
    events.push({ kind: "enemy-action", text: "selfDestruct未実装" });
  }

  if (enemy.special === "curseTouch" && Math.random() < 0.2) {
    const curseTargets = livingMembers(party).filter(
      (member) => (member[STATUS_EFFECTS.curse.turnKey] || 0) <= 0
    );
    if (curseTargets.length) {
      target = pick(curseTargets);
      target[STATUS_EFFECTS.curse.turnKey] = 3;
      events.push({ kind: "enemy-action", text: `${enemy.name}は低く祈った。` });
      events.push({ kind: "enemy-action", text: `${target.name}を覆う呪いが濃くなった。` });
      pushHp(events, target);
      tickEnemyDots(enemy, events);
      tickEnemyTurnStatuses(enemy);
      return;
    }
  }

  if (enemy.special === "curseWhisper" && Math.random() < 0.5) {
    const curseTargets = livingMembers(party).filter(
      (member) => (member[STATUS_EFFECTS.curse.turnKey] || 0) <= 0
    );
    if (curseTargets.length) {
      target = pick(curseTargets);
      target[STATUS_EFFECTS.curse.turnKey] = 3;
      events.push({ kind: "enemy-action", text: `${enemy.name}がかすかに震えた。` });
      events.push({ kind: "enemy-action", text: `${target.name}を覆う呪いが濃くなった。` });
      pushHp(events, target);
      tickEnemyDots(enemy, events);
      tickEnemyTurnStatuses(enemy);
      return;
    }
  }

  if (enemy.special === "heavySwingLite" && Math.random() < 0.25) {
    const predictedDamage = Math.max(1, Math.floor(damageFor(enemy.atk, target.def) * 1.35));
    const cover = maybeCoverTarget(party, target, predictedDamage);
    target = cover.target;

    let damage = predictedDamage;
    if (target.ironWall) {
      damage = Math.max(1, Math.floor(damage * 0.25));
    } else if (target.guard) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (target.desperateVulnerable) {
      damage = Math.max(1, Math.floor(damage * 1.5));
      target.desperateVulnerable = false;
    }
    if (target.magicBarrier) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      target.magicBarrier = false;
    }
    const beforeHp = target.hp;
    const canUsePriestBlessing =
      beforeHp > 0 &&
      target.job === "priest" &&
      isSkillEnabled(target, "divineGrace") &&
      !target.divineGraceUsed &&
      target.hp > 0;
    applyDamageToMember(target, damage);
    events.push({ kind: "enemy-action", text: `${enemy.name}は大きく斧を振りかぶった。` });
    if (cover.coverer) {
      if (Math.random() < 0.15) {
        events.push({ kind: "enemy-action", text: `${cover.coverer.name}「下がれ！」` });
      }
      events.push({ kind: "enemy-action", text: `${cover.coverer.name}が${cover.covered.name}をかばった。` });
    }
    if (target.hp <= 0) {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      if (trySurviveFatalDamage(target, events, party, canUsePriestBlessing)) {
        reactToHpDrop(target, beforeHp, events, speechState);
      } else {
        pushHp(events, target, "enemy-action down");
        confirmMemberDown(target, events, speechState);
      }
    } else {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      pushHp(events, target);
      reactToHpDrop(target, beforeHp, events, speechState);
    }
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  if (enemy.special === "leapStrikeLite" && Math.random() < 0.5) {
    const predictedDamage = Math.max(1, Math.floor(damageFor(enemy.atk, target.def) * 1.25));
    const cover = maybeCoverTarget(party, target, predictedDamage);
    target = cover.target;

    let damage = predictedDamage;
    if (target.ironWall) {
      damage = Math.max(1, Math.floor(damage * 0.25));
    } else if (target.guard) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (target.desperateVulnerable) {
      damage = Math.max(1, Math.floor(damage * 1.5));
      target.desperateVulnerable = false;
    }
    if (target.magicBarrier) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      target.magicBarrier = false;
    }
    const beforeHp = target.hp;
    const canUsePriestBlessing =
      beforeHp > 0 &&
      target.job === "priest" &&
      isSkillEnabled(target, "divineGrace") &&
      !target.divineGraceUsed &&
      target.hp > 0;
    applyDamageToMember(target, damage);
    events.push({ kind: "enemy-action", text: `${enemy.name}は泥を跳ねて飛びかかった。` });
    if (cover.coverer) {
      if (Math.random() < 0.15) {
        events.push({ kind: "enemy-action", text: `${cover.coverer.name}「下がって！」` });
      }
      events.push({ kind: "enemy-action", text: `${cover.coverer.name}が${cover.covered.name}をかばった。` });
    }
    if (target.hp <= 0) {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      if (trySurviveFatalDamage(target, events, party, canUsePriestBlessing)) {
        reactToHpDrop(target, beforeHp, events, speechState);
      } else {
        pushHp(events, target, "enemy-action down");
        confirmMemberDown(target, events, speechState);
      }
    } else {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      pushHp(events, target);
      reactToHpDrop(target, beforeHp, events, speechState);
    }
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  if (enemy.special === "stoneBlowLite" && Math.random() < 0.5) {
    const predictedDamage = Math.max(1, Math.floor(damageFor(enemy.atk, target.def) * 1.3));
    const cover = maybeCoverTarget(party, target, predictedDamage);
    target = cover.target;

    let damage = predictedDamage;
    if (target.ironWall) {
      damage = Math.max(1, Math.floor(damage * 0.25));
    } else if (target.guard) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (target.desperateVulnerable) {
      damage = Math.max(1, Math.floor(damage * 1.5));
      target.desperateVulnerable = false;
    }
    if (target.magicBarrier) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      target.magicBarrier = false;
    }
    const beforeHp = target.hp;
    const canUsePriestBlessing =
      beforeHp > 0 &&
      target.job === "priest" &&
      isSkillEnabled(target, "divineGrace") &&
      !target.divineGraceUsed &&
      target.hp > 0;
    applyDamageToMember(target, damage);
    events.push({ kind: "enemy-action", text: `${enemy.name}の石打ち。` });
    if (cover.coverer) {
      if (Math.random() < 0.15) {
        events.push({ kind: "enemy-action", text: `${cover.coverer.name}は身を張った！` });
      }
      events.push({ kind: "enemy-action", text: `${cover.coverer.name}が${cover.covered.name}をかばった。` });
    }
    if (target.hp <= 0) {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      if (trySurviveFatalDamage(target, events, party, canUsePriestBlessing)) {
        reactToHpDrop(target, beforeHp, events, speechState);
      } else {
        pushHp(events, target, "enemy-action down");
        confirmMemberDown(target, events, speechState);
      }
    } else {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      pushHp(events, target);
      reactToHpDrop(target, beforeHp, events, speechState);
    }
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  if (enemy.special === "stoneEcho" && Math.random() < 0.5) {
    if (enemy.id === "sealedBeast" && Math.random() >= 0.6) {
      const predictedDamage = Math.max(1, Math.floor(damageFor(enemy.atk, target.def) * 1.1));
      const cover = maybeCoverTarget(party, target, predictedDamage);
      target = cover.target;

      let damage = predictedDamage;
      if (target.ironWall) {
        damage = Math.max(1, Math.floor(damage * 0.25));
      } else if (target.guard) {
        damage = Math.max(1, Math.floor(damage * 0.5));
      }
      if (target.desperateVulnerable) {
        damage = Math.max(1, Math.floor(damage * 1.5));
        target.desperateVulnerable = false;
      }
      if (target.magicBarrier) {
        damage = Math.max(1, Math.floor(damage * 0.5));
        target.magicBarrier = false;
      }
      const beforeHp = target.hp;
      const canUsePriestBlessing =
        beforeHp > 0 &&
        target.job === "priest" &&
        isSkillEnabled(target, "divineGrace") &&
        !target.divineGraceUsed &&
        target.hp > 0;
      applyDamageToMember(target, damage);
      events.push({ kind: "enemy-action", text: `${enemy.name}の封じの咆哮。` });
      if (cover.coverer) {
        if (Math.random() < 0.15) {
          events.push({ kind: "enemy-action", text: `${cover.coverer.name}は身を投げ出した。` });
        }
        events.push({ kind: "enemy-action", text: `${cover.coverer.name}が${cover.covered.name}をかばった。` });
      }
      if (target.hp <= 0) {
        events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
        if (trySurviveFatalDamage(target, events, party, canUsePriestBlessing)) {
          reactToHpDrop(target, beforeHp, events, speechState);
        } else {
          pushHp(events, target, "enemy-action down");
          confirmMemberDown(target, events, speechState);
        }
      } else {
        events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
        pushHp(events, target);
        reactToHpDrop(target, beforeHp, events, speechState);
      }
      if (target.hp > 0 && !target[STATUS_EFFECTS.paralyze.turnKey] && Math.random() < 0.4) {
        target[STATUS_EFFECTS.paralyze.turnKey] = 1;
        events.push({ kind: "enemy-action", text: `${target.name}は身を強張らせた。` });
        pushHp(events, target);
      }
      tickEnemyDots(enemy, events);
      tickEnemyTurnStatuses(enemy);
      return;
    }

    const targets = livingMembers(party);
    if (targets.length) {
      events.push({ kind: "enemy-action", text: `${enemy.name}の石響き。` });
      for (const member of targets) {
        let damage = Math.max(1, Math.floor(damageFor(enemy.atk, member.def) * 0.5));
        if (member.ironWall) {
          damage = Math.max(1, Math.floor(damage * 0.25));
        } else if (member.guard) {
          damage = Math.max(1, Math.floor(damage * 0.5));
        }
        if (member.desperateVulnerable) {
          damage = Math.max(1, Math.floor(damage * 1.5));
          member.desperateVulnerable = false;
        }
        if (member.magicBarrier) {
          damage = Math.max(1, Math.floor(damage * 0.5));
          member.magicBarrier = false;
        }
        const beforeHp = member.hp;
        const canUsePriestBlessing =
          beforeHp > 0 &&
          member.job === "priest" &&
          isSkillEnabled(member, "divineGrace") &&
          !member.divineGraceUsed &&
          member.hp > 0;
        applyDamageToMember(member, damage);
        if (member.hp <= 0) {
          events.push({ kind: "enemy-action", text: `${damageResultText(member, damage)}。` });
          if (trySurviveFatalDamage(member, events, party, canUsePriestBlessing)) {
            reactToHpDrop(member, beforeHp, events, speechState);
          } else {
            pushHp(events, member, "enemy-action down");
            confirmMemberDown(member, events, speechState);
          }
        } else {
          events.push({ kind: "enemy-action", text: `${damageResultText(member, damage)}。` });
          pushHp(events, member);
          reactToHpDrop(member, beforeHp, events, speechState);
        }
      }
      tickEnemyDots(enemy, events);
      tickEnemyTurnStatuses(enemy);
      return;
    }
  }

  if (enemy.special === "dragSlowLite" && Math.random() < 0.5) {
    const predictedDamage = Math.max(1, Math.floor(damageFor(enemy.atk, target.def) * 1.1));
    const cover = maybeCoverTarget(party, target, predictedDamage);
    target = cover.target;

    let damage = predictedDamage;
    if (target.ironWall) {
      damage = Math.max(1, Math.floor(damage * 0.25));
    } else if (target.guard) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (target.desperateVulnerable) {
      damage = Math.max(1, Math.floor(damage * 1.5));
      target.desperateVulnerable = false;
    }
    if (target.magicBarrier) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      target.magicBarrier = false;
    }
    const beforeHp = target.hp;
    const canUsePriestBlessing =
      beforeHp > 0 &&
      target.job === "priest" &&
      isSkillEnabled(target, "divineGrace") &&
      !target.divineGraceUsed &&
      target.hp > 0;
    applyDamageToMember(target, damage);
    events.push({ kind: "enemy-action", text: `${enemy.name}の絡みつく。` });
    if (cover.coverer) {
      if (Math.random() < 0.15) {
        events.push({ kind: "enemy-action", text: `${cover.coverer.name}「下がって！」` });
      }
      events.push({ kind: "enemy-action", text: `${cover.coverer.name}が${cover.covered.name}をかばった。` });
    }
    if (target.hp > 0 && !target.slowTurns && Math.random() < 0.7) {
      target.slowTurns = 2;
      events.push({ kind: "enemy-action", text: `${target.name}は足を取られた。` });
    }
    if (target.hp <= 0) {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      if (trySurviveFatalDamage(target, events, party, canUsePriestBlessing)) {
        reactToHpDrop(target, beforeHp, events, speechState);
      } else {
        pushHp(events, target, "enemy-action down");
        confirmMemberDown(target, events, speechState);
      }
    } else {
      events.push({ kind: "enemy-action", text: `${damageResultText(target, damage)}。` });
      pushHp(events, target);
      reactToHpDrop(target, beforeHp, events, speechState);
    }
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  if (enemy.special === "summonSwampLarva") {
    if (livingEnemies(enemies).length < 3 && Math.random() < 0.4) {
      const larvaMonster = MONSTERS?.swampLarva;
      if (larvaMonster) {
        const larvaCount = enemies.filter((unit) => unit?.id === "swampLarva").length;
        const larvaName = `沼の幼生${String.fromCharCode(65 + larvaCount)}`;
        const larva = createEnemy(larvaMonster, area, heroLevel, larvaName);
        enemies.push(larva);
        events.push({ kind: "enemy-action", text: `${enemy.name}が低く鳴いた。` });
        events.push({ kind: "enemy-action", text: `${larva.name}が泥の中から這い出した。` });
        pushInitialHp(events, larva, "enemy-roster");
        tickEnemyDots(enemy, events);
        tickEnemyTurnStatuses(enemy);
        return;
      }
    }
  }

  if (enemy.special === "fireboltLite" && Math.random() < 0.5) {
    const predictedDamage = Math.max(4, Math.floor(damageFor(enemy.atk, target.def) * 1.2));
    const cover = maybeCoverTarget(party, target, predictedDamage);
    target = cover.target;

    let damage = predictedDamage;
    if (target.ironWall) {
      damage = Math.max(1, Math.floor(damage * 0.25));
    } else if (target.guard) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (target.desperateVulnerable) {
      damage = Math.max(1, Math.floor(damage * 1.5));
      target.desperateVulnerable = false;
    }
    if (target.magicBarrier) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      target.magicBarrier = false;
    }
    const beforeHp = target.hp;
    const canUsePriestBlessing =
      beforeHp > 0 &&
      target.job === "priest" &&
      isSkillEnabled(target, "divineGrace") &&
      !target.divineGraceUsed &&
      target.hp > 0;
    applyDamageToMember(target, damage);
    events.push({ kind: "enemy-action", text: `${enemy.name}は小さな火球を放った。` });
    if (cover.coverer) {
      if (Math.random() < 0.15) {
        events.push({ kind: "enemy-action", text: `${cover.coverer.name}「下がれ！」` });
      }
      events.push({ kind: "enemy-action", text: `${cover.coverer.name}が${cover.covered.name}をかばった。` });
    }
    if (target.hp <= 0) {
      events.push({ kind: "enemy-action", text: `${target.name}に${damage}ダメージ。` });
      if (trySurviveFatalDamage(target, events, party, canUsePriestBlessing)) {
        reactToHpDrop(target, beforeHp, events, speechState);
      } else {
        pushHp(events, target, "enemy-action down");
        confirmMemberDown(target, events, speechState);
      }
    } else {
      events.push({ kind: "enemy-action", text: `${target.name}に${damage}ダメージ。` });
      pushHp(events, target);
      reactToHpDrop(target, beforeHp, events, speechState);
    }
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  // Boss flavor is now handled by each enemy's special action instead of the old shared charge-up attack.
  if (false && enemy.boss && enemy.id !== "mudToad" && !enemy.heavyAttackReady && round % 3 === 2) {
    enemy.heavyAttackReady = true;
    events.push({ kind: "enemy-action", text: `${enemy.name}が剣を構えた。` });
    events.push({ kind: "enemy-action", text: "次の攻撃は危険だ。" });
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  if (enemy.blindTurns > 0 && Math.random() < 0.4) {
    events.push({ kind: "enemy-action", text: `${enemy.name}の攻撃` });
    events.push({ kind: "enemy-action", text: `ミス！${target.name}への攻撃は外れた。` });
    tickEnemyDots(enemy, events);
    tickEnemyTurnStatuses(enemy);
    return;
  }

  const bossHeavyAttack = enemy.boss && enemy.heavyAttackReady;
  const predictedDamage = Math.max(
    1,
    Math.floor(damageFor(enemy.atk, target.def) * (bossHeavyAttack ? 1.5 : 1))
  );
  const cover = maybeCoverTarget(party, target, predictedDamage);
  target = cover.target;

  enemy.heavyAttackReady = false;
  const hit = rollPhysicalHit(damageFor(enemy.atk, target.def), enemy);
  let damage = hit.damage;
  if (bossHeavyAttack) {
    damage = Math.max(1, Math.floor(damage * 1.5));
  }
  if (target.ironWall) {
    damage = Math.max(1, Math.floor(damage * 0.25));
  } else if (target.guard) {
    damage = Math.max(1, Math.floor(damage * 0.5));
  }
  if (target.desperateVulnerable) {
    damage = Math.max(1, Math.floor(damage * 1.5));
    target.desperateVulnerable = false;
  }
  if (target.magicBarrier) {
    damage = Math.max(1, Math.floor(damage * 0.5));
    target.magicBarrier = false;
  }
  const beforeHp = target.hp;
  const canUsePriestBlessing =
    beforeHp > 0 &&
    target.job === "priest" &&
    isSkillEnabled(target, "divineGrace") &&
    !target.divineGraceUsed &&
    target.hp > 0;
  applyDamageToMember(target, damage);
  events.push({
    kind: "enemy-action",
    text: bossHeavyAttack ? `${enemy.name}の重い一撃。` : `${enemy.name}の攻撃。`,
  });
  if (cover.coverer) {
    if (Math.random() < 0.15) {
      events.push({ kind: "enemy-action", text: `${cover.coverer.name}「下がれ！」` });
    }
    events.push({ kind: "enemy-action", text: `${cover.coverer.name}が${cover.covered.name}をかばった。` });
  }
  if (target.hp <= 0) {
    events.push({ kind: "enemy-action", text: `${damageResultText(target, damage, hit.critical)}。` });
    if (trySurviveFatalDamage(target, events, party, canUsePriestBlessing)) {
      reactToHpDrop(target, beforeHp, events, speechState);
    } else {
      pushHp(events, target, "enemy-action down");
      confirmMemberDown(target, events, speechState);
    }
  } else {
    events.push({ kind: "enemy-action", text: `${damageResultText(target, damage, hit.critical)}。` });
    pushHp(events, target);
    reactToHpDrop(target, beforeHp, events, speechState);
  }
  maybeCounterAttack(target, enemy, events);
  tickEnemyDots(enemy, events);
  tickEnemyTurnStatuses(enemy);
}

function runEncounter(members, monster, area, speechState = {}, partyName = "隊") {
  const magicSense = tryMageMagicSense(members, monster, area);
  monster = magicSense.monster;
  const highestLevel = Math.max(...members.map((m) => m.level || 1));
  const encounterMonsters = monster.boss ? [monster] : buildEncounterMonsters(area, monster);
  const enemies = withIndexedEnemyNames(encounterMonsters).map(({ monster: enemyMonster, displayName }) =>
    createEnemy(enemyMonster, area, highestLevel, displayName)
  );
  const encounterLabel = enemyGroupLabel(enemies);
  const enemy = enemies[0];
  const party = members; // ← 全回復せず、そのまま（ダメージを受けた状態）で引き継ぐ
  party.forEach((member) => {
    if (member.job === "priest") {
      member.sureReviveUsed = false;
      member.divineGraceUsed = false;
    }
  });
  const startMembersSnapshot = snapshotPartyHp(party);
  const events = [];
  const ambushScout = pickAmbushScout(party);
  const explorationEvents = [...magicSense.explorationEvents, ...buildScoutExplorationEvents(party, speechState, area)];
  let round = 1;

  events.push({
    kind: "intro",
    text: enemy.boss ? `${enemy.name}が姿を現した。隊列に緊張が走る。` : `${enemy.name}と遭遇。`,
  });
  if (magicSense.foundRare && magicSense.detector) {
    events.push({ kind: "spell", text: `${magicSense.detector.name}の魔力探知で見つけ出した。` });
  }
  enemies.forEach((enemy) => pushInitialHp(events, enemy, `${enemy.boss ? "boss " : ""}enemy-roster`.trim()));
  pushPartyHp(events, party);

  while (livingEnemies(enemies).length > 0 && livingMembers(party).length > 0 && round <= 20) {
    events.push({ kind: "turn-separator", text: `──── Turn ${round} ────` });
    tickTaunts(party);
    const actionOrder = actionOrderForRound(party, enemies, round, ambushScout);
    if (round === 1 && actionOrder[0]?.unit?.id === ambushScout?.id) {
      pushScoutAmbushEvents(ambushScout, events);
      performMemberAction(ambushScout, party, enemies, events);
      tickEnemyDots(ambushScout, events, "ally-action");
      if (ambushScout.hp <= 0) confirmMemberDown(ambushScout, events, speechState);
      if (!livingEnemies(enemies).length) break;
    }
    performTurnStartSkillChecks(party, enemies, events);
    let enemyActed = false;
    for (const actor of actionOrder) {
      if (round === 1 && actor.unit.id === ambushScout?.id) continue;
      if (actor.side === "ally") {
        performMemberAction(actor.unit, party, enemies, events);
        tickEnemyDots(actor.unit, events, "ally-action");
        if (actor.unit.hp <= 0) confirmMemberDown(actor.unit, events, speechState);
        if (!livingEnemies(enemies).length) break;
      } else {
        performEnemyAction(actor.unit, party, enemies, area, highestLevel, events, speechState, round);
        enemyActed = true;
        if (!livingMembers(party).length) break;
      }
    }
    if (enemyActed && livingEnemies(enemies).length > 0 && livingMembers(party).length > 0) {
      events.push({ kind: "action-break", text: "────────" });
    }
    round += 1;
  }

  const defeatedEnemies = enemies.filter((enemyUnit) => enemyUnit.hp <= 0);
  const draw = defeatedEnemies.length === enemies.length && livingMembers(party).length === 0;
  const victory = defeatedEnemies.length === enemies.length && !draw;
  confirmRemainingDownMembers(party, events, speechState, !(victory && enemies.some((enemyUnit) => enemyUnit.boss)));
  clearTempHp(party);
  const dropMonster = victory ? pick(encounterMonsters) : null;
  const equipmentDrop = dropMonster ? rollEquipmentDrop(party, dropMonster) : null;

  if (victory) {
    events.push({ kind: enemy.boss ? "boss" : "", text: `${enemy.name}を討伐。戦闘記録をギルドへ送った。` });
    if (equipmentDrop) {
      const dropName = dropNameHtml(equipmentDrop);
      if (shouldAutoSellDrop(equipmentDrop)) equipmentDrop.sellGold = equipmentSellGoldValue(equipmentDrop);
      events.push({ kind: "voice", text: `${equipmentDrop.finderName}が${dropName}を見つけた。` });
      if (shouldAutoSellDrop(equipmentDrop)) {
        events.push({ kind: "voice", text: `${dropName}を売却した（${equipmentDrop.sellGold || 0}G）。` });
      }
    }
  } else if (draw) {
    events.push({ kind: "down", text: enemy.dotDefeatText || `${enemy.name}は倒れた。` });
    events.push({ kind: "down", text: `しかし既に${partyName}は壊滅していた。` });
    events.push({ kind: "down", text: "戦闘記録だけがギルドへ送られた。" });
  } else {
    events.push({ kind: "down", text: `${enemy.name}を退けきれず、隊は煙幕で撤退した。` });
  }

  return {
    monster,
    monsters: encounterMonsters,
    enemy,
    enemies,
    label: encounterLabel,
    victory,
    draw,
    events,
    explorationEvents,
    equipmentDrop,
    startMembersSnapshot,
    bossPreludeEvents: enemies.some((enemyUnit) => enemyUnit.boss) ? buildBossPreludeEvents(party, startMembersSnapshot) : [],
    membersSnapshot: snapshotPartyHp(party),
    kills: victory ? encounterMonsters.length : 0,
    xp: victory
      ? enemies.reduce((sum, enemyUnit) => sum + enemyUnit.xp, 0)
      : draw
      ? 0
      : Math.floor(enemies.reduce((sum, enemyUnit) => sum + enemyUnit.xp, 0) * 0.35),
    gold: victory
      ? enemies.reduce((sum, enemyUnit) => sum + enemyUnit.gold, 0) +
        (equipmentDrop && shouldAutoSellDrop(equipmentDrop) ? equipmentDrop.sellGold || 0 : 0)
      : draw
      ? 0
      : Math.floor(enemies.reduce((sum, enemyUnit) => sum + enemyUnit.gold, 0) * 0.25),
  };
}
