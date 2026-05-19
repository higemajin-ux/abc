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

function tryMageMagicSense(members, monster, area) {
  if (monster.boss || !area.monsters?.length) return { monster, events: [] };
  const mages = livingMembers(members).filter((member) => member.job === "mage");
  if (!mages.length || Math.random() >= 0.2) return { monster, events: [] };

  const detector = pick(mages);
  return {
    monster: pickWeightedMonster(area, 3),
    events: [
      { kind: "spell", text: `${detector.name}は魔力探知を使った。` },
      { kind: "voice", text: `${detector.name}<br>「……珍しいやつがいるな」` },
    ],
  };
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
    dex: monster.dex || area.difficulty + 4,
    xp: monster.xp + scale * 4,
    gold: monster.gold + scale * 3,
    rare: !!monster.rare,
    boss: !!monster.boss,
  };
}

function livingMembers(party) {
  return party.filter((m) => m.hp > 0);
}

function livingScouts(party) {
  return livingMembers(party).filter((member) => member.job === "scout");
}

function formationTargetWeight(member) {
  if (member.formation === "前衛") return 6;
  if (member.formation === "後衛") return 1;
  return 3;
}

function pickEnemyTarget(party) {
  const candidates = livingMembers(party);
  if (!candidates.length) return null;
  const taunting = candidates.filter((member) => member.tauntTurns > 0);
  if (taunting.length) return pick(taunting);

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

function physicalCriticalChance(attacker, focused = false) {
  const dex = attacker.dex || 0;
  const luc = attacker.luc || 0;
  const baseChance = (5 + dex * 0.3 + luc * 0.5) / 100;
  const focusBonus = focused ? 0.25 : 0;
  return Math.min(0.5, baseChance + focusBonus);
}

function applyPhysicalCritical(damage, attacker, events, focused = false) {
  if (Math.random() >= physicalCriticalChance(attacker, focused)) return damage;
  events.push({ kind: "battle", text: "クリティカル！" });
  return Math.max(1, Math.floor(damage * 1.5));
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

function hpRate(unit) {
  return unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
}

function lowestHpLivingMember(party) {
  return livingMembers(party).sort((a, b) => hpRate(a) - hpRate(b))[0] || null;
}

function recoverHp(target, amount) {
  const before = target.hp;
  target.hp = clamp(target.hp + amount, 0, target.maxHp);
  return target.hp - before;
}

function hasBadStatus(member) {
  return (
    member.poisonTurns > 0 ||
    member.poisonTier === "venom" ||
    member.paralysisTurns > 0 ||
    member.paralyzeTurns > 0 ||
    member.burnTurns > 0 ||
    member.slowTurns > 0
  );
}

function clearBadStatus(member) {
  member.poisonTurns = 0;
  member.poisonTier = null;
  member.paralysisTurns = 0;
  member.paralyzeTurns = 0;
  member.burnTurns = 0;
  if (member.slowTurns > 0) {
    member.dex = member.baseDex || member.dex;
    member.slowTurns = 0;
  }
}

function performPriestAction(actor, party, enemy, events) {
  const fallen = party.filter((m) => m.hp <= 0);
  if (fallen.length) {
    const target = pick(fallen);
    const sureRevive = !actor.sureReviveUsed;
    events.push({ kind: "heal", text: `${actor.name}は祈った。` });
    if (sureRevive || Math.random() < 0.5) {
      actor.sureReviveUsed = actor.sureReviveUsed || sureRevive;
      target.hp = Math.max(1, Math.floor(target.maxHp * (sureRevive ? 0.35 : 0.25)));
      events.push({ kind: "heal", text: `${target.name}が立ち上がった。` });
      pushHp(events, target, "heal");
    } else {
      events.push({ kind: "heal", text: "祈りは届かなかった。" });
    }
    return;
  }

  const statusTarget = livingMembers(party).find(hasBadStatus);
  if (statusTarget) {
    clearBadStatus(statusTarget);
    events.push({ kind: "heal", text: `${actor.name}は祈りを捧げた。` });
    events.push({ kind: "heal", text: `${statusTarget.name}の状態が安定した。` });
    return;
  }

  const lowest = lowestHpLivingMember(party);
  if (lowest && hpRate(lowest) <= 0.3) {
    const amount = roll(15, 22) + Math.floor(actor.level * 2);
    recoverHp(lowest, amount);
    events.push({ kind: "heal", text: `${actor.name}は中回復を唱えた。` });
    events.push({ kind: "heal", text: `${lowest.name}の傷が癒えた。` });
    pushHp(events, lowest, "heal");
    return;
  }

  const wounded = livingMembers(party)
    .filter((m) => m.hp < Math.floor(m.maxHp * 0.45))
    .sort((a, b) => hpRate(a) - hpRate(b))[0];

  if (wounded) {
    const amount = roll(8, 13) + Math.floor(actor.level * 1.4);
    const healed = recoverHp(wounded, amount);
    events.push({ kind: "heal", text: `${actor.name}が回復魔法！ ${wounded.name}のHPが${healed}回復！` });
    pushHp(events, wounded, "heal");
    return;
  }

  const groupTargets = livingMembers(party).filter((m) => hpRate(m) <= 0.75 && m.hp < m.maxHp);
  if (groupTargets.length >= 2) {
    events.push({ kind: "heal", text: `${actor.name}の祈りが広がった。` });
    for (const target of livingMembers(party)) {
      recoverHp(target, roll(5, 8) + Math.floor(actor.level * 0.8));
      pushHp(events, target, "heal");
    }
    return;
  }

  if (lowest && hpRate(lowest) <= 0.65 && !lowest.magicBarrier) {
    lowest.magicBarrier = true;
    events.push({ kind: "heal", text: `${actor.name}は${lowest.name}に魔力障壁を張った。` });
    return;
  }

  const baseDamage = Math.max(1, Math.floor(damageFor(actor.atk, enemy.def) * 0.75));
  const damage = applyPhysicalCritical(baseDamage, actor, events);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}が杖で牽制。${enemy.name}に${damage}ダメージ。` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function targetEnemyGroup(enemy) {
  return [enemy];
}

function applyEnemySlow(enemy) {
  enemy.baseDex = enemy.baseDex || enemy.dex || 1;
  enemy.dex = Math.max(1, Math.floor(enemy.baseDex * 0.5));
  enemy.slowTurns = 2;
}

function tickEnemySlow(enemy) {
  if (!enemy.slowTurns) return;
  enemy.slowTurns -= 1;
  if (enemy.slowTurns <= 0) {
    enemy.dex = enemy.baseDex || enemy.dex;
    enemy.slowTurns = 0;
  }
}

function applyEnemyPoison(enemy, events) {
  if (enemy.poisonTurns > 0) {
    enemy.poisonTier = "venom";
    enemy.poisonTurns = 3;
    events.push({ kind: "spell", text: `${enemy.name}の毒が悪化した。` });
    return;
  }

  enemy.poisonTier = "poison";
  enemy.poisonTurns = 3;
  events.push({ kind: "spell", text: `${enemy.name}は毒に侵された。` });
}

function applyEnemyBurn(enemy, events) {
  enemy.burnTurns = 2;
  events.push({ kind: "spell", text: `${enemy.name}は燃えている。` });
}

function tickEnemyDots(enemy, events) {
  if (enemy.hp <= 0) return;

  if (enemy.poisonTurns > 0) {
    const baseDamage = Math.max(3, Math.floor(enemy.maxHp * 0.05));
    const damage = enemy.poisonTier === "venom" ? baseDamage * 2 : baseDamage;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${enemy.name}は毒で${damage}ダメージ。` });
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    enemy.poisonTurns -= 1;
    if (enemy.poisonTurns <= 0) {
      enemy.poisonTurns = 0;
      enemy.poisonTier = null;
    }
  }

  if (enemy.hp <= 0) return;

  if (enemy.burnTurns > 0) {
    const damage = Math.max(4, Math.floor(enemy.maxHp * 0.06));
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${enemy.name}は燃焼で${damage}ダメージ。` });
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    enemy.burnTurns -= 1;
    if (enemy.burnTurns <= 0) enemy.burnTurns = 0;
  }
}

function performMageAction(actor, enemy, events) {
  if (Math.random() < 0.35) {
    const focused = Math.random() < 0.3;
    if (focused) events.push({ kind: "spell", text: `${actor.name}は魔力を集中した。` });
    const baseDamage = damageFor(Math.floor(actor.atk * 0.5) + Math.floor(actor.level / 2), Math.floor(enemy.def * 0.2));
    const damage = focused ? Math.floor(baseDamage * 1.5) : baseDamage;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${actor.name}の毒霧。${enemy.name}に${damage}ダメージ。` });
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    if (enemy.hp > 0) applyEnemyPoison(enemy, events);
    return;
  }

  const skillRoll = Math.random();
  if (skillRoll < 0.3) {
    const focused = Math.random() < 0.3;
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
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    return;
  }

  if (skillRoll < 0.7) {
    const focused = Math.random() < 0.3;
    if (focused) events.push({ kind: "spell", text: `${actor.name}は魔力を集中した。` });
    events.push({ kind: "spell", text: `${actor.name}の氷槍。` });

    for (const target of targetEnemyGroup(enemy)) {
      if (target.hp <= 0) continue;
      if (!focused && Math.random() >= 0.9) {
        events.push({ kind: "spell", text: `${target.name}には当たらなかった。` });
        continue;
      }

      const baseDamage = damageFor(Math.floor(actor.atk * 0.8) + actor.level, Math.floor(target.def * 0.3));
      const damage = focused ? Math.floor(baseDamage * 1.5) : baseDamage;
      target.hp = clamp(target.hp - damage, 0, target.maxHp);
      events.push({ kind: "spell", text: `${target.name}に${damage}ダメージ。` });
      pushHp(events, target, target.hp <= 0 ? "down" : "");

      if (target.hp > 0 && !target.slowTurns && Math.random() < 0.3) {
        applyEnemySlow(target);
        events.push({ kind: "spell", text: `${target.name}の動きが鈍った。` });
      }
    }
    return;
  }

  if (skillRoll < 0.9) {
    const focused = Math.random() < 0.3;
    if (focused) events.push({ kind: "spell", text: `${actor.name}は魔力を集中した。` });
    const baseDamage = damageFor(actor.atk + 8 + actor.level, Math.floor(enemy.def * 0.35));
    const damage = focused ? Math.floor(baseDamage * 1.5) : baseDamage;
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "spell", text: `${actor.name}の火球。${enemy.name}に${damage}ダメージ。` });
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    if (enemy.hp > 0 && Math.random() < 0.3) applyEnemyBurn(enemy, events);
    return;
  }

  const damage = damageFor(actor.atk, enemy.def);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}の攻撃！ ${enemy.name}に${damage}ダメージ！` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function performScoutAction(actor, party, enemy, events) {
  if (actor.focusTurns > 0) {
    actor.focusTurns -= 1;
  }

  const criticalAlly = livingMembers(party)
    .filter((member) => member.hp < Math.floor(member.maxHp * 0.3))
    .sort((a, b) => hpRate(a) - hpRate(b))[0];
  if (criticalAlly && Math.random() < 0.55) {
    const amount = roll(5, 9) + Math.floor(actor.level * 0.7);
    recoverHp(criticalAlly, amount);
    events.push({ kind: "heal", text: `${actor.name}は応急手当をした。` });
    events.push({ kind: "heal", text: `${criticalAlly.name}は少し落ち着いた。` });
    pushHp(events, criticalAlly, "heal");
    return;
  }

  if (!actor.focusTurns && Math.random() < 0.35) {
    actor.focusTurns = 2;
    events.push({ kind: "voice", text: `${actor.name}は集中している。` });
    return;
  }

  const focused = actor.focusTurns > 0;
  const baseDamage = damageFor(actor.atk, enemy.def);
  const damage = applyPhysicalCritical(baseDamage, actor, events, focused);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({
    kind: "",
    text: `${actor.name}の攻撃！ ${enemy.name}に${damage}ダメージ！`,
  });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function shouldWarriorDefend(actor) {
  if (actor.job !== "warrior" || actor.hp <= 0) return false;
  const hpRate = actor.maxHp > 0 ? (actor.hp / actor.maxHp) * 100 : 0;
  if (hpRate <= 30) return Math.random() < 0.45;
  if (hpRate <= 50) return Math.random() < 0.25;
  return false;
}

function shouldWarriorIronWall(actor, enemyCount = 1) {
  if (actor.job !== "warrior" || actor.hp <= 0 || actor.ironWall) return false;
  const hpRate = actor.maxHp > 0 ? (actor.hp / actor.maxHp) * 100 : 0;
  return hpRate <= 50 || enemyCount >= 2;
}

function startMemberTurn(member) {
  const wasIronWall = !!member.ironWall;
  member.guard = false;
  member.ironWall = false;
  member.actionConsumed = false;
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
  events.push({
    kind: "guard",
    text: continued ? `${member.name}は鉄壁の構えを取っている。` : `${member.name}は鉄壁の構えを取った。`,
  });
  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${member.name}「ここは通さない」` });
  }
}

function performWarriorDefendPassive(member, events) {
  member.guard = true;
  events.push({ kind: "guard", text: `${member.name}は盾を構えた。` });
  events.push({ kind: "guard", text: `次の行動まで受けるダメージを50%軽減。` });
}

function performTurnStartSkillChecks(party, enemy, events) {
  if (enemy.hp <= 0) return;
  for (const member of party) {
    const turnState = startMemberTurn(member);
    if (member.hp <= 0) continue;

    // Active defensive skills consume the member's normal action.
    if (shouldWarriorIronWall(member)) {
      performWarriorIronWallActive(member, events, turnState.wasIronWall);
      continue;
    }

    // Passive defenses do not consume the member's normal action.
    if (!shouldWarriorDefend(member)) continue;
    performWarriorDefendPassive(member, events);
  }
}

function shouldWarriorTaunt(actor, party) {
  if (actor.job !== "warrior" || actor.hp <= 0 || actor.tauntTurns > 0) return false;
  const needsAttention = livingMembers(party).some((member) => {
    if (member.id === actor.id || member.maxHp <= 0) return false;
    const hpRate = (member.hp / member.maxHp) * 100;
    return hpRate <= 50 || (member.formation === "後衛" && hpRate <= 70);
  });
  return needsAttention && Math.random() < 0.5;
}

function shouldWarriorDesperateStrike(actor) {
  if (actor.job !== "warrior" || actor.hp <= 0 || actor.ironWall) return false;
  return Math.random() < 0.3;
}

function performWarriorAction(actor, party, enemy, events) {
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
    const damage = applyPhysicalCritical(baseDamage, actor, events);
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    events.push({ kind: "guard", text: `${actor.name}は捨て身に出た。` });
    if (Math.random() < 0.15) {
      events.push({ kind: "voice", text: `${actor.name}「行くぞ」` });
    }
    events.push({ kind: "", text: `${actor.name}の攻撃！ ${enemy.name}に${damage}ダメージ！` });
    pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
    return;
  }

  const damage = applyPhysicalCritical(damageFor(actor.atk, enemy.def), actor, events);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  events.push({ kind: "", text: `${actor.name}の攻撃！ ${enemy.name}に${damage}ダメージ！` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function performMemberAction(actor, party, enemy, events) {
  if (actor.hp <= 0 || enemy.hp <= 0) return;
  if (actor.actionConsumed) return;
  if (actor.job === "priest") performPriestAction(actor, party, enemy, events);
  else if (actor.job === "mage") performMageAction(actor, enemy, events);
  else if (actor.job === "scout") performScoutAction(actor, party, enemy, events);
  else performWarriorAction(actor, party, enemy, events);
}

function shouldCoverTarget(target) {
  if (!target || target.hp <= 0 || target.maxHp <= 0) return false;
  return (target.hp / target.maxHp) * 100 <= 70;
}

function coverChanceFor(target) {
  const hpRate = target.maxHp > 0 ? (target.hp / target.maxHp) * 100 : 0;
  if (hpRate <= 25) return 1;
  if (hpRate <= 40) return 0.7;
  if (hpRate <= 70) return 0.5;
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
  // Passive cover can redirect an enemy attack without consuming an action.
  const coverer = pickCoverWarrior(party, target);
  if (!coverer) return target;

  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${coverer.name}「下がれ！」` });
  }
  events.push({ kind: "guard", text: `${coverer.name}が${target.name}をかばった。` });
  return coverer;
}

function maybeCounterAttack(actor, enemy, events) {
  // Passive counter only happens after direct damage is taken.
  if (actor.job !== "warrior" || actor.hp <= 0 || enemy.hp <= 0) return;
  if (Math.random() >= 0.6) return;

  const damageRate = 0.5 + Math.random() * 0.3;
  const baseDamage = Math.max(1, Math.floor(actor.atk * damageRate));
  const damage = applyPhysicalCritical(baseDamage, actor, events);
  enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${actor.name}「こちらも返す」` });
  }
  events.push({ kind: "guard", text: `${actor.name}の反撃！${enemy.name}に${damage}ダメージ。` });
  pushHp(events, enemy, enemy.hp <= 0 ? "down" : "");
}

function buildScoutPassiveEvents(party) {
  const scouts = livingScouts(party);
  if (!scouts.length) return [];

  const scout = pick(scouts);
  const events = [
    { kind: "voice", text: `${scout.name}が敵を先に見つけた。` },
    { kind: "voice", text: "奇襲成功。" },
  ];

  if (Math.random() < 0.2) {
    events.push({ kind: "voice", text: `${scout.name}<br>「……何かある」` });
  }
  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${scout.name}が罠を見つけた。` });
    events.push({ kind: "voice", text: "被害はなかった。" });
  }
  if (Math.random() < 0.15) {
    events.push({ kind: "voice", text: `${scout.name}が近道を見つけた。` });
  }

  return events;
}

function performEnemyAction(enemy, party, events, speechState) {
  if (enemy.hp <= 0) {
    tickEnemySlow(enemy);
    return;
  }
  let target = pickEnemyTarget(party);
  if (!target) {
    tickEnemySlow(enemy);
    return;
  }
  target = maybeCoverTarget(party, target, events);

  let damage = applyPhysicalCritical(damageFor(enemy.atk, target.def), enemy, events);
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
  target.hp = clamp(target.hp - damage, 0, target.maxHp);
  events.push({ kind: "", text: `${enemy.name}の攻撃！ ${target.name}に${damage}ダメージ。` });
  pushHp(events, target, target.hp <= 0 ? "down" : "");
  reactToHpDrop(target, beforeHp, events, speechState);
  if (target.hp <= 0) {
    target.guard = false;
    target.ironWall = false;
    target.actionConsumed = false;
    target.desperateVulnerable = false;
    events.push({ kind: "down", text: `${target.name}は戦闘不能になった。` });
  }
  maybeCounterAttack(target, enemy, events);
  tickEnemySlow(enemy);
}

function runEncounter(members, monster, area, speechState = {}) {
  const magicSense = tryMageMagicSense(members, monster, area);
  monster = magicSense.monster;
  const highestLevel = Math.max(...members.map((m) => m.level || 1));
  const enemy = createEnemy(monster, area, highestLevel);
  const party = members; // ← 全回復せず、そのまま（ダメージを受けた状態）で引き継ぐ
  party.forEach((member) => {
    if (member.job === "priest") member.sureReviveUsed = false;
  });
  const startMembersSnapshot = snapshotPartyHp(party);
  const events = [...magicSense.events, ...buildScoutPassiveEvents(party)];
  let round = 1;

  events.push({
    kind: enemy.boss ? "boss" : "",
    text: enemy.boss ? `${enemy.name}が姿を現した。隊列に緊張が走る。` : `${enemy.name}と遭遇。`,
  });
  pushHp(events, enemy, enemy.boss ? "boss" : "");
  pushPartyHp(events, party);

  while (enemy.hp > 0 && livingMembers(party).length > 0 && round <= 12) {
    events.push({ kind: "", text: `${round}ターン目` });
    tickEnemyDots(enemy, events);
    if (enemy.hp <= 0) break;
    tickTaunts(party);
    performTurnStartSkillChecks(party, enemy, events);
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
