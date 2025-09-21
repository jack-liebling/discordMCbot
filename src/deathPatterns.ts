// Comprehensive list of Minecraft death message patterns for Java Edition
// Each pattern captures the player name in the first capture group (\w+)

export const DEATH_PATTERNS: RegExp[] = [
  // Cactus
  /(\w+) was pricked to death/,
  /(\w+) walked into a cactus while trying to escape (.+)/,

  // Drowning
  /(\w+) drowned/,
  /(\w+) drowned while trying to escape (.+)/,

  // Drying out (dolphins/axolotls)
  /(\w+) died from dehydration/,
  /(\w+) died from dehydration while trying to escape (.+)/,

  // Elytra
  /(\w+) experienced kinetic energy/,
  /(\w+) experienced kinetic energy while trying to escape (.+)/,

  // Explosions
  /(\w+) blew up/,
  /(\w+) was blown up by (.+)/,
  /(\w+) was blown up by (.+) using (.+)/,
  /(\w+) was killed by \[Intentional Game Design\]/,

  // Falling
  /(\w+) hit the ground too hard/,
  /(\w+) hit the ground too hard while trying to escape (.+)/,
  /(\w+) fell from a high place/,
  /(\w+) fell off a ladder/,
  /(\w+) fell off some vines/,
  /(\w+) fell off some weeping vines/,
  /(\w+) fell off some twisting vines/,
  /(\w+) fell off scaffolding/,
  /(\w+) fell while climbing/,
  /(\w+) was doomed to fall/,
  /(\w+) was doomed to fall by (.+)/,
  /(\w+) was doomed to fall by (.+) using (.+)/,
  /(\w+) was impaled on a stalagmite/,
  /(\w+) was impaled on a stalagmite while fighting (.+)/,

  // Falling blocks
  /(\w+) was squashed by a falling anvil/,
  /(\w+) was squashed by a falling block/,
  /(\w+) was skewered by a falling stalactite/,

  // Fire
  /(\w+) went up in flames/,
  /(\w+) walked into fire while fighting (.+)/,
  /(\w+) burned to death/,
  /(\w+) was burned to a crisp while fighting (.+)/,

  // Firework rockets
  /(\w+) went off with a bang/,
  /(\w+) went off with a bang due to a firework fired from (.+) by (.+)/,

  // Lava
  /(\w+) tried to swim in lava/,
  /(\w+) tried to swim in lava to escape (.+)/,

  // Lightning
  /(\w+) was struck by lightning/,
  /(\w+) was struck by lightning while fighting (.+)/,

  // Magma block
  /(\w+) discovered the floor was lava/,
  /(\w+) walked into the danger zone due to (.+)/,

  // Magic (Instant Damage / evoker fangs / guardian laser)
  /(\w+) was killed by magic/,
  /(\w+) was killed by magic while trying to escape (.+)/,
  /(\w+) was killed by (.+) using magic/,
  /(\w+) was killed by (.+) using (.+)/,

  // Powder snow
  /(\w+) froze to death/,
  /(\w+) was frozen to death by (.+)/,

  // Players and mobs
  /(\w+) was slain by (.+)/,
  /(\w+) was slain by (.+) using (.+)/,
  /(\w+) was stung to death/,
  /(\w+) was stung to death by (.+) using (.+)/,
  /(\w+) was obliterated by a sonically-charged shriek/,
  /(\w+) was obliterated by a sonically-charged shriek while trying to escape (.+) wielding (.+)/,
  /(\w+) was smashed by (.+)/,
  /(\w+) was smashed by (.+) with (.+)/,

  // Projectiles
  /(\w+) was shot by (.+)/,
  /(\w+) was shot by (.+) using (.+)/,
  /(\w+) was pummeled by (.+)/,
  /(\w+) was pummeled by (.+) using (.+)/,
  /(\w+) was fireballed by (.+)/,
  /(\w+) was fireballed by (.+) using (.+)/,
  /(\w+) was shot by a skull from (.+)/,
  /(\w+) was shot by a skull from (.+) using (.+)/,

  // Starving
  /(\w+) starved to death/,
  /(\w+) starved to death while fighting (.+)/,

  // Suffocation
  /(\w+) suffocated in a wall/,
  /(\w+) suffocated in a wall while fighting (.+)/,
  /(\w+) was squished too much/,
  /(\w+) was squashed by (.+)/,
  /(\w+) left the confines of this world/,
  /(\w+) left the confines of this world while fighting (.+)/,

  // Sweet berry bushes
  /(\w+) was poked to death by a sweet berry bush/,
  /(\w+) was poked to death by a sweet berry bush while trying to escape (.+)/,

  // Thorns enchantment
  /(\w+) was killed while trying to hurt (.+)/,
  /(\w+) was killed by (.+) while trying to hurt (.+)/,

  // Trident
  /(\w+) was impaled by (.+)/,
  /(\w+) was impaled by (.+) with (.+)/,

  // Void
  /(\w+) fell out of the world/,
  /(\w+) didn't want to live in the same world as (.+)/,

  // Wither effect
  /(\w+) withered away/,
  /(\w+) withered away while fighting (.+)/,

  // Generic death
  /(\w+) died/,
  /(\w+) died because of (.+)/,
  /(\w+) was killed/,
  /(\w+) was killed while fighting (.+)/,

  // Dragon's breath
  /(\w+) was roasted in dragon's breath/,
  /(\w+) was roasted in dragon's breath by (.+)/,
];
