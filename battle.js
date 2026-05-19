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

function damageFor(attackerAtk, defenderDef = 0) {
  return Math.max(1, attackerAtk - defenderDef);
}

function hpLabel(unit) {
  return `${unit.name}（HP ${unit.hp}/${unit.maxHp}）`;
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

function performWarriorAction(actor, enemy, events) {
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

function performEnemyAction(enemy, party, events) {
  if (enemy.hp <= 0) return;
  const target = pick(livingMembers(party));
  if (!target) return;

  const damage = damageFor(enemy.atk, target.def);
  target.hp = clamp(target.hp - damage, 0, target.maxHp);
  events.push({ kind: "", text: `${enemy.name}の攻撃！ ${target.name}に${damage}ダメージ。` });
  pushHp(events, target, target.hp <= 0 ? "down" : "");
  if (target.hp <= 0) {
    events.push({ kind: "down", text: `${target.name}は戦闘不能になった。` });
  }
}

function runEncounter(members, monster, area) {
  const highestLevel = Math.max(...members.map((m) => m.level || 1));
  const enemy = createEnemy(monster, area, highestLevel);
  const party = members; // ← 全回復せず、そのまま（ダメージを受けた状態）で引き継ぐ
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
    performEnemyAction(enemy, party, events);
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
    membersSnapshot: snapshotPartyHp(party),
    kills: victory ? 1 : 0,
    xp: victory ? enemy.xp : Math.floor(enemy.xp * 0.35),
    gold: victory ? enemy.gold : Math.floor(enemy.gold * 0.25),
  };
}
