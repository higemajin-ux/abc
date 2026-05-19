"use strict";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function createMember(template, level = 1) {
  const base = JOB_STATS[template.job];
  const maxHp = base.maxHp + (level - 1) * 5;
  return {
    ...template,
    level,
    xp: template.xp || 0,
    xpToNext: template.xpToNext || 40,
    maxHp,
    hp: template.hp == null ? maxHp : clamp(template.hp, 0, maxHp),
    atk: base.atk + Math.floor((level - 1) * 1.5),
    def: base.def + Math.floor((level - 1) * 0.8),
    dex: template.dex ?? base.dex,
    luc: template.luc ?? base.luc,
  };
}

function normalizeMember(member) {
  const template = { id: member.id, name: member.name, job: member.job || "warrior", dex: member.dex, luc: member.luc };
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

function createEnemy(monster, area, heroLevel) {
  const scale = Math.max(0, area.difficulty - 1) + Math.floor(heroLevel / 3);
  return {
    id: monster.id,
    name: monster.name,
    maxHp: monster.hp + scale * 8,
    hp: monster.hp + scale * 8,
    atk: monster.atk + scale * 2,
    def: (monster.def || Math.max(0, area.difficulty - 1)) + Math.floor(scale / 2),
    xp: monster.xp + scale * 4,
    gold: monster.gold + scale * 3,
    rare: !!monster.rare,
    boss: !!monster.boss,
  };
}

function livingMembers(party) {
  return party.filter((m) => m.hp > 0);
}

function formationTargetWeight(member) {
  if (member.formation === "前衛") return 6;
  if (member.formation === "後衛") return 1;
  return 3;
}

function pickEnemyTarget(party) {
  const candidates = livingMembers(party);
  if (!candidates.length) return null;

  const total = candidates.reduce((sum, member) => sum + formationTargetWeight(member), 0);
  let rollValue = Math.random() * total;
  for (const member of candidates) {
    rollValue -= formationTargetWeight(member);
    if (rollValue <= 0) return member;
  }
  return candidates.at(-1);
}

function damageFor(attackerAtk, defenderDef = 0) {
  return Math.max(1, attackerAtk - defenderDef);
}

function hpClass(unit) {
  const hpRate = unit.maxHp > 0 ? (unit.hp / unit.maxHp) * 100 : 0;
  if (unit.hp <= 0) return "hp-down";
  if (hpRate < 30) return "hp-danger";
  if (hpRate < 50) return "hp-caution";
  if (hpRate < 70) return "hp-warn";
  return "hp-safe";
}

function hpLabel(unit) {
  return `<span class="hp-text ${hpClass(unit)}">${unit.name}（HP ${unit.hp}/${unit.maxHp}）</span>`;
}

function pushHp(events, unit, kind = "") {
  events.push({ kind, text: hpLabel(unit) });
}

function pushPartyHp(events, party) {
  for (const member of party) {
    pushHp(events, member, member.hp <= 0 ? "down" : "");
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

function buildReturnEvents(members, hpSnapshot) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const hpSource = hpSnapshot?.length ? hpSnapshot : snapshotPartyHp(members);
  const candidates = hpSource
    .filter((hp) => hp.hp > 0)
    .map((hp) => ({ member: memberById.get(hp.id), hp }))
    .filter(({ member }) => member);
  if (!candidates.length) return [];

  const count = Math.min(candidates.length, roll(1, 2));
  return candidates
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map(({ member, hp }) => ({
      kind: "voice",
      text: `${member.name}「${pickReturnLine(member, hp)}」`,
    }));
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
  const hpRate = member.maxHp > 0 ? (member.hp / member.maxHp) * 100 : 0;
  if (member.hp <= 0) {
    pushMemberLine(member, "down", events, speechState, 1);
  } else if (hpRate <= 30) {
    pushMemberLine(member, "critical", events, speechState, 0.55);
  } else if (hpRate <= 50) {
    pushMemberLine(member, "wounded", events, speechState, 0.35);
  }
}

function performPriestAction(actor, party, enemy, events) {
  const wounded = livingMembers(party)
    .filter((m) => m.hp < Math.floor(m.maxHp * 0.45))
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

  if (wounded) {
    const amount = roll(8, 13) + Math.floor(actor.level * 1.4);
    const before = wounded.hp;
    wounded.hp = clamp(wounded.hp + amount, 0, wounded.maxHp);
    events.push({ kind: "heal", text: `${actor.name}が回復魔法！ ${wounded.name}のHPが${wounded.hp - before}回復！` });
    pushHp(events, wounded, "heal");
    return;
  }

  const damage = Math.max(1, Math.floor(damageFor(actor.atk, enemy.def) * 0.75));
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}が杖で牽制。${enemy.name}に${damage}ダメージ。` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function performMageAction(actor, enemy, events) {
  if (Math.random() < 0.35) {
    const damage = damageFor(actor.atk + 8 + actor.level, enemy.def);
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${actor.name}が攻撃魔法！ ${enemy.name}に${damage}ダメージ！` });
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    return;
  }

  const damage = damageFor(actor.atk, enemy.def);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}の攻撃！ ${enemy.name}に${damage}ダメージ！` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function shouldWarriorDefend(actor) {
  if (actor.job !== "warrior" || actor.guard) return false;
  const hpRate = actor.maxHp > 0 ? (actor.hp / actor.maxHp) * 100 : 0;
  if (hpRate <= 30) return Math.random() < 0.45;
  if (hpRate <= 50) return Math.random() < 0.25;
  return false;
}

function performWarriorAction(actor, enemy, events) {
  if (shouldWarriorDefend(actor)) {
    actor.guard = true;
    events.push({ kind: "guard", text: `${actor.name}は盾を構えた。` });
    events.push({ kind: "guard", text: `次に受けるダメージを50%軽減。` });
    return;
  }

  const damage = damageFor(actor.atk, enemy.def);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}の攻撃！ ${enemy.name}に${damage}ダメージ！` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function performMemberAction(actor, party, enemy, events) {
  if (actor.hp <= 0 || enemy.hp <= 0) return;
  if (actor.job === "priest") performPriestAction(actor, party, enemy, events);
  else if (actor.job === "mage") performMageAction(actor, enemy, events);
  else performWarriorAction(actor, enemy, events);
}

function shouldCoverTarget(target) {
  if (!target || target.hp <= 0 || target.maxHp <= 0) return false;
  return (target.hp / target.maxHp) * 100 <= 70;
}

function coverChanceFor(target) {
  const hpRate = target.maxHp > 0 ? (target.hp / target.maxHp) * 100 : 0;
  if (hpRate <= 25) return 0.6;
  if (hpRate <= 40) return 0.4;
  if (hpRate <= 70) return 0.2;
  return 0;
}

function pickCoverWarrior(party, target) {
  if (!shouldCoverTarget(target)) return null;
  if (Math.random() >= coverChanceFor(target)) return null;

  const candidates = livingMembers(party).filter(
    (member) => member.job === "warrior" && member.id !== target.id
  );
  return candidates.length ? pick(candidates) : null;
}

function maybeCoverTarget(party, target, events) {
  const coverer = pickCoverWarrior(party, target);
  if (!coverer) return target;

  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${coverer.name}「下がれ！」` });
  }
  events.push({ kind: "guard", text: `${coverer.name}が${target.name}をかばった。` });
  events.push({ kind: "guard", text: `${coverer.name}が前に出た。` });
  events.push({ kind: "guard", text: `${coverer.name}が攻撃を引き受けた。` });
  return coverer;
}

function performEnemyAction(enemy, party, events, speechState) {
  if (enemy.hp <= 0) return;
  let target = pickEnemyTarget(party);
  if (!target) return;
  target = maybeCoverTarget(party, target, events);

  let damage = damageFor(enemy.atk, target.def);
  if (target.guard) {
    damage = Math.max(1, Math.floor(damage * 0.5));
    target.guard = false;
    events.push({ kind: "guard", text: `${target.name}へのダメージが軽減された。` });
  }
  const beforeHp = target.hp;
  target.hp = clamp(target.hp - damage, 0, target.maxHp);
  events.push({ kind: "", text: `${enemy.name}の攻撃！ ${target.name}に${damage}ダメージ。` });
  pushHp(events, target, target.hp <= 0 ? "down" : "");
  reactToHpDrop(target, beforeHp, events, speechState);
  if (target.hp <= 0) {
    events.push({ kind: "down", text: `${target.name}は戦闘不能になった。` });
  }
}

function runEncounter(members, monster, area, speechState = {}) {
  const highestLevel = Math.max(...members.map((m) => m.level || 1));
  const enemy = createEnemy(monster, area, highestLevel);
  const party = members; // ← 全回復せず、そのまま（ダメージを受けた状態）で引き継ぐ
  const startMembersSnapshot = snapshotPartyHp(party);
  const events = [];
  let round = 1;

  events.push({
    kind: enemy.boss ? "boss" : "",
    text: enemy.boss ? `${enemy.name}が姿を現した。隊列に緊張が走る。` : `${enemy.name}と遭遇。`,
  });
  pushHp(events, enemy, enemy.boss ? "boss" : "");
  pushPartyHp(events, party);

  while (enemy.hp > 0 && livingMembers(party).length > 0 && round <= 12) {
    events.push({ kind: "", text: `${round}ターン目` });
    for (const member of party) {
      performMemberAction(member, party, enemy, events);
      if (enemy.hp <= 0) break;
    }
    performEnemyAction(enemy, party, events, speechState);
    round += 1;
  }

  const victory = enemy.hp <= 0;
  if (victory) {
    events.push({ kind: enemy.boss ? "boss" : "", text: `${enemy.name}を討伐。戦闘記録をギルドへ送った。` });
  } else {
    events.push({ kind: "down", text: `${enemy.name}を退けきれず、隊は煙幕で撤退した。` });
  }

  return {
    monster,
    enemy,
    victory,
    events,
    startMembersSnapshot,
    bossPreludeEvents: enemy.boss ? buildBossPreludeEvents(party, startMembersSnapshot) : [],
    membersSnapshot: snapshotPartyHp(party),
    kills: victory ? 1 : 0,
    xp: victory ? enemy.xp : Math.floor(enemy.xp * 0.35),
    gold: victory ? enemy.gold : Math.floor(enemy.gold * 0.25),
  };
}
