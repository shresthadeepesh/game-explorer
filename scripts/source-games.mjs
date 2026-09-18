// Source of truth for the timeline. Edit here, then run `npm run build:data`
// to regenerate data/games.json and data/games.csv.
//
// Row shape:  [year, [entry, ...]]
// Entry:      [title, genre, blurb, wikipediaArticle?]
//
// The 4th field is only needed when the Wikipedia article title differs from
// the game's display title (disambiguated pages, full sub-titles, and so on).
// Genres must exist in src/categories.js — the build fails loudly otherwise.

export const RAW = [
  [1990, [
    ["Super Mario World", "Platformer", "A launch game that shipped with a cape, a dinosaur and a map full of secret exits."],
    ["The Secret of Monkey Island", "Point & Click", "LucasArts comedy where you could not die, get stuck, or stop quoting it."],
    ["Wing Commander", "Space Sim", "Cockpit dogfights, a branching campaign, and a crew that noticed when you failed.", "Wing Commander (video game)"],
    ["Railroad Tycoon", "Simulation", "Sid Meier turned timetables into a hobby; the management sim gets a pulse.", "Railroad Tycoon (video game)"],
    ["F-Zero", "Racing", "Mode 7 speed that made a home console feel like an arcade cabinet.", "F-Zero (video game)"],
    ["Dragon Quest IV", "JRPG", "Five chapters, each told from a different companion before the party ever meets."]
  ]],
  [1991, [
    ["Sonic the Hedgehog", "Platformer", "Momentum as attitude; Sega's mascot arrived already running.", "Sonic the Hedgehog (1991 video game)"],
    ["Street Fighter II", "Fighting", "Six buttons, eight world warriors, and the arcade boom that followed.", "Street Fighter II: The World Warrior"],
    ["Civilization", "4X", "One more turn: four thousand years of history as a systems toy.", "Civilization (video game)"],
    ["The Legend of Zelda: A Link to the Past", "Action-Adventure", "Two overlapping worlds and the template every 2D Zelda still follows."],
    ["Another World", "Cinematic Platformer", "Rotoscoped, wordless, and hostile in a beautiful way.", "Another World (video game)"],
    ["Lemmings", "Puzzle", "Assign jobs, save the oblivious; a mouse-driven puzzle with a body count.", "Lemmings (video game)"]
  ]],
  [1992, [
    ["Mortal Kombat", "Fighting", "Digitised actors, spinal columns, and the rating board it summoned into being.", "Mortal Kombat (1992 video game)"],
    ["Wolfenstein 3D", "FPS", "id proved a PC could run a corridor at speed, and the genre had a name."],
    ["Super Mario Kart", "Kart Racer", "Items as rubber-band physics; the party racer invented in one go."],
    ["Dune II", "RTS", "Harvest, build, rush: the command-and-control loop everything else copied."],
    ["Ultima Underworld", "Immersive Sim", "A full 3D dungeon with physics and conversation, a year before Doom.", "Ultima Underworld: The Stygian Abyss"],
    ["Kirby's Dream Land", "Platformer", "A game designed to be finished, and adored for exactly that."]
  ]],
  [1993, [
    ["Doom", "FPS", "Shareware, deathmatch and modding: three decades of PC culture in one download.", "Doom (1993 video game)"],
    ["Myst", "Adventure", "A silent puzzle island that sold CD-ROM drives to people who hated computers."],
    ["Star Fox", "Rail Shooter", "A chip in the cartridge put polygons on a 16-bit console.", "Star Fox (1993 video game)"],
    ["Secret of Mana", "Action RPG", "Real-time party combat and a ring menu that never paused the world."],
    ["SimCity 2000", "City Builder", "Isometric zoning, water pipes and arcologies; civic planning as a pastime."],
    ["NBA Jam", "Sports", "He's on fire: basketball reduced to two players and total spectacle.", "NBA Jam (1993 video game)"]
  ]],
  [1994, [
    ["Super Metroid", "Action-Adventure", "Atmosphere, map design and movement still taught as the reference text."],
    ["Final Fantasy VI", "JRPG", "Fourteen protagonists and a villain who actually wins halfway through."],
    ["Donkey Kong Country", "Platformer", "Pre-rendered sprites that sold a console everyone had written off."],
    ["System Shock", "Immersive Sim", "SHODAN, audio logs, and the first genuinely systemic first-person world."],
    ["Warcraft: Orcs & Humans", "RTS", "Blizzard's first war machine: Dune II with fantasy and a modem cable."],
    ["TIE Fighter", "Space Sim", "Flying for the Empire, with the sharpest mission design of the era.", "Star Wars: TIE Fighter"]
  ]],
  [1995, [
    ["Chrono Trigger", "JRPG", "Time travel with no wasted scene and thirteen endings to prove it."],
    ["Command & Conquer", "RTS", "FMV briefings, Hell March and the LAN party as a social institution.", "Command & Conquer (1995 video game)"],
    ["Yoshi's Island", "Platformer", "Crayon art and the most generous platform toolkit on the machine.", "Super Mario World 2: Yoshi's Island"],
    ["Descent", "FPS", "Six degrees of freedom; the only shooter that got you lost in three axes.", "Descent (1995 video game)"],
    ["Suikoden", "JRPG", "A hundred and eight recruitable characters and a castle that grows with them.", "Suikoden (video game)"],
    ["Wipeout", "Racing", "Club culture, licensed techno and a console's entire identity in one race.", "Wipeout (video game)"]
  ]],
  [1996, [
    ["Super Mario 64", "Platformer", "Invented the 3D camera and the 3D move-set in the same afternoon."],
    ["Resident Evil", "Survival Horror", "Fixed cameras, tank controls, and ammunition as arithmetic.", "Resident Evil (1996 video game)"],
    ["Quake", "FPS", "True 3D, rocket jumps, and a mod scene that became an industry.", "Quake (video game)"],
    ["Diablo", "Action RPG", "Randomised dungeons plus Battle.net; loot quietly becomes a genre.", "Diablo (video game)"],
    ["Pokemon Red and Blue", "JRPG", "Two cartridges, one link cable, and a playground economy.", "Pokémon Red and Blue"],
    ["Tomb Raider", "Action-Adventure", "Cinematic 3D exploration and the decade's most recognisable silhouette.", "Tomb Raider (1996 video game)"]
  ]],
  [1997, [
    ["Final Fantasy VII", "JRPG", "Pre-rendered spectacle that made turn-based RPGs mainstream in the West."],
    ["GoldenEye 007", "FPS", "Split-screen, objectives, and a film licence with no right to be this good.", "GoldenEye 007 (1997 video game)"],
    ["Fallout", "RPG", "A retro-future wasteland with dialogue that let you be genuinely awful.", "Fallout (video game)"],
    ["Castlevania: Symphony of the Night", "Metroidvania", "One castle, inverted; the genre gets half its name from here."],
    ["Ultima Online", "MMORPG", "A persistent world with player thieves, years before anyone budgeted for that."],
    ["PaRappa the Rapper", "Rhythm", "Button timing as comedy; the rhythm genre finds its feet and its attitude."]
  ]],
  [1998, [
    ["Half-Life", "FPS", "Scripted storytelling told entirely from behind the eyes, no cutscenes.", "Half-Life (video game)"],
    ["The Legend of Zelda: Ocarina of Time", "Action-Adventure", "Wrote the grammar of 3D adventure: lock-on combat, a world on a clock."],
    ["Metal Gear Solid", "Stealth", "Cinema smuggled into a PlayStation; hiding became more interesting than shooting.", "Metal Gear Solid (1998 video game)"],
    ["StarCraft", "RTS", "Three asymmetric armies so finely balanced they became a national sport.", "StarCraft (video game)"],
    ["Resident Evil 2", "Survival Horror", "Two scenarios through one police station, and Leon's very bad first shift."],
    ["Grim Fandango", "Point & Click", "Film noir in the land of the dead, with the best script LucasArts ever shipped."]
  ]],
  [1999, [
    ["System Shock 2", "Immersive Sim", "A haunted starship that let you solve it wrong and live with it."],
    ["Silent Hill", "Horror", "Fog born of hardware limits turned into the most effective dread in games.", "Silent Hill (video game)"],
    ["Age of Empires II", "RTS", "Castles, monks and mangonels; still being patched a quarter-century on."],
    ["Unreal Tournament", "Arena FPS", "Pure movement and aim, stripped of everything that wasn't the fight.", "Unreal Tournament (1999 video game)"],
    ["EverQuest", "MMORPG", "The first 3D persistent world big enough to swallow people whole."],
    ["Planescape: Torment", "RPG", "What can change the nature of a man? Prose first, combat a distant second."]
  ]],
  [2000, [
    ["Deus Ex", "Immersive Sim", "Conspiracy RPG where the vent, the hack and the gun were all valid.", "Deus Ex (video game)"],
    ["The Sims", "Life Sim", "A dollhouse simulation that quietly became the best-selling PC game alive.", "The Sims (video game)"],
    ["Diablo II", "Action RPG", "Loot as a rhythm section; the blueprint for two decades of grinding."],
    ["Counter-Strike", "Tactical FPS", "A Half-Life mod that redefined competitive shooters for good.", "Counter-Strike (video game)"],
    ["Perfect Dark", "FPS", "GoldenEye's successor, with bots, gadgets and sci-fi swagger.", "Perfect Dark"],
    ["Tony Hawk's Pro Skater 2", "Sports", "Manuals, the two-minute run, and a soundtrack nobody has escaped."]
  ]],
  [2001, [
    ["Halo: Combat Evolved", "FPS", "Proved a console shooter could feel better than a mouse, with two guns and a grenade."],
    ["Grand Theft Auto III", "Open World", "The city became the protagonist and every rule became optional."],
    ["Ico", "Puzzle-Adventure", "Holding a hand as a game mechanic; negative space as art direction."],
    ["Max Payne", "Action", "Bullet time, graphic novel panels and a very tired man in the snow.", "Max Payne (video game)"],
    ["Super Smash Bros. Melee", "Fighting", "Twenty-five years of tournament play squeezed out of one launch-window disc."],
    ["Silent Hill 2", "Horror", "Grief rendered as a town; still the medium's finest psychological horror."]
  ]],
  [2002, [
    ["The Elder Scrolls III: Morrowind", "RPG", "An alien island with no quest markers, trusting you to get lost."],
    ["Metroid Prime", "Action-Adventure", "A first-person world you read through a visor rather than shot through."],
    ["Kingdom Hearts", "Action RPG", "An improbable crossover that worked because it took its sincerity seriously.", "Kingdom Hearts (video game)"],
    ["Battlefield 1942", "FPS", "Vehicles, squads and 64 players; the combined-arms shooter arrives."],
    ["Animal Crossing", "Life Sim", "Real-time chores, a loan shark raccoon, and a village that missed you.", "Animal Crossing (video game)"],
    ["Warcraft III", "RTS", "Heroes, creeps, and a custom map that grew into its own genre.", "Warcraft III: Reign of Chaos"]
  ]],
  [2003, [
    ["The Wind Waker", "Action-Adventure", "Cel shading aged into timelessness while its critics didn't.", "The Legend of Zelda: The Wind Waker"],
    ["Prince of Persia: Sands of Time", "Platformer", "Rewinding death turned failure into part of the choreography.", "Prince of Persia: The Sands of Time"],
    ["Beyond Good & Evil", "Action-Adventure", "A photojournalist, a talking pig and a cult classic nobody bought.", "Beyond Good & Evil (video game)"],
    ["Call of Duty", "FPS", "Squad-scale war where you were one rifle among many, not a hero.", "Call of Duty (video game)"],
    ["Star Wars: Knights of the Old Republic", "RPG", "A twist that retroactively reframes forty hours of your own choices.", "Star Wars: Knights of the Old Republic (video game)"],
    ["EVE Online", "MMORPG", "A single-shard economy where the real wars are fought in spreadsheets."]
  ]],
  [2004, [
    ["Half-Life 2", "FPS", "Physics as a verb, plus a face-acting engine the industry copied for years."],
    ["World of Warcraft", "MMORPG", "Made an entire genre mainstream and kept millions inside it."],
    ["GTA: San Andreas", "Open World", "Three cities, planes, gyms and the most sprawling PS2 game ever shipped.", "Grand Theft Auto: San Andreas"],
    ["Katamari Damacy", "Puzzle", "Roll everything. A budget experiment that became a design parable."],
    ["Far Cry", "FPS", "Open islands, long sightlines, and enemies that flanked you for it.", "Far Cry (video game)"],
    ["Burnout 3: Takedown", "Racing", "Crashing became the point; arcade racing at its loudest and least sensible."]
  ]],
  [2005, [
    ["Resident Evil 4", "Survival Horror", "Over-the-shoulder aiming reinvented action games twice: in 2005 and forever after."],
    ["Shadow of the Colossus", "Action-Adventure", "Sixteen fights, an empty world and an argument about what games can mean."],
    ["Psychonauts", "Platformer", "Levels shaped like damaged minds, written sharper than most films."],
    ["Guitar Hero", "Rhythm", "A plastic guitar that put the living room back into gaming.", "Guitar Hero (video game)"],
    ["Civilization IV", "4X", "The series' most beloved ruleset, and the only 4X with a Grammy-winning theme."],
    ["God of War", "Action", "Brutal, legible combat and set pieces the hardware had no business running.", "God of War (2005 video game)"]
  ]],
  [2006, [
    ["Oblivion", "RPG", "Cyrodiil's open gates and infinite side-quests defined the HD-era RPG.", "The Elder Scrolls IV: Oblivion"],
    ["Okami", "Action-Adventure", "Ink-wash world where the brush was both camera and weapon.", "Ōkami"],
    ["Gears of War", "Shooter", "Cover shooting and chunky men set the visual tone of a whole console cycle.", "Gears of War (video game)"],
    ["Wii Sports", "Sports", "Bundled with a console and handed games to everyone's grandmother."],
    ["Company of Heroes", "RTS", "Cover, suppression and squad AI; wartime strategy finally grows up.", "Company of Heroes (video game)"],
    ["Hitman: Blood Money", "Stealth", "Sandbox assassination with a sense of humour about its own accidents."]
  ]],
  [2007, [
    ["Portal", "Puzzle", "The tightest comedy in games, told in two portals and roughly three hours.", "Portal (video game)"],
    ["BioShock", "Immersive Sim", "Objectivism underwater, and a twist that interrogated the act of playing."],
    ["Super Mario Galaxy", "Platformer", "Gravity as a level design tool; spherical worlds, orchestral swagger."],
    ["Mass Effect", "Action RPG", "A space opera that remembered what you said three games ago.", "Mass Effect (video game)"],
    ["Team Fortress 2", "Hero Shooter", "Nine readable silhouettes, a decade of hats, and the class shooter perfected."],
    ["Rock Band", "Rhythm", "Four instruments, one living room, and an argument about who sings.", "Rock Band (video game)"]
  ]],
  [2008, [
    ["Fallout 3", "RPG", "The wasteland went first person and the Capital ruins became iconic."],
    ["LittleBigPlanet", "Platformer", "Handcrafted textures plus a level editor: play, create, share.", "LittleBigPlanet (2008 video game)"],
    ["Dead Space", "Horror", "Diegetic UI, strategic dismemberment, and a very loud silence.", "Dead Space (2008 video game)"],
    ["Braid", "Puzzle-Platformer", "Time manipulation and painted backdrops kicked open the indie decade.", "Braid (video game)"],
    ["Left 4 Dead", "Co-op Shooter", "An AI director that learned to frighten four people at once."],
    ["World of Goo", "Physics Puzzle", "Indie engineering with a sense of dread, charm and structural integrity."]
  ]],
  [2009, [
    ["Demon's Souls", "Action RPG", "Punishing, cryptic and invented a genre without meaning to."],
    ["Uncharted 2: Among Thieves", "Action-Adventure", "Set-piece cinema with likeable people and a train that never stops."],
    ["Minecraft", "Sandbox", "Blocks, survival and a generation's first taste of authorship."],
    ["Batman: Arkham Asylum", "Action", "Freeflow combat made being the world's best detective feel plausible."],
    ["Plants vs. Zombies", "Tower Defense", "Perfectly tuned, endlessly readable, and impossible to get out of your head.", "Plants vs. Zombies (video game)"],
    ["Dragon Age: Origins", "RPG", "Six origin stories and a party that argued with you and each other."]
  ]],
  [2010, [
    ["Red Dead Redemption", "Open World", "A frontier ending in real time, with the best final act Rockstar ever wrote."],
    ["Mass Effect 2", "Action RPG", "A recruitment drive turned suicide mission where everyone can die."],
    ["Super Meat Boy", "Platformer", "Precision platforming distilled until only the muscle memory remained."],
    ["StarCraft II: Wings of Liberty", "RTS", "Esports professionalised around one impeccably tuned ruleset."],
    ["Limbo", "Puzzle-Platformer", "Monochrome dread, silhouettes, and traps that only teach by killing you.", "Limbo (video game)"],
    ["Civilization V", "4X", "Hexes and one-unit-per-tile rewrote the series' tactics from the ground up."]
  ]],
  [2011, [
    ["The Elder Scrolls V: Skyrim", "RPG", "Dragons, mods and a world people are still living in fifteen years later."],
    ["Dark Souls", "Action RPG", "Interlocking geography and hostile generosity; the modern template for difficulty.", "Dark Souls (video game)"],
    ["Portal 2", "Puzzle", "Gels, co-op and a script good enough to be quoted for a decade."],
    ["The Binding of Isaac", "Roguelike", "Randomised runs and grotesque item synergy; the roguelite boom starts here.", "The Binding of Isaac (video game)"],
    ["Terraria", "Sandbox", "2D survival crafting with a boss list as long as its item list."],
    ["Bastion", "Action RPG", "A narrator who describes what you just did, and judges it a little.", "Bastion (video game)"]
  ]],
  [2012, [
    ["Journey", "Adventure", "Wordless multiplayer where strangers became companions for an hour.", "Journey (2012 video game)"],
    ["XCOM: Enemy Unknown", "Tactics", "Turn-based squads, permadeath, and a 95% shot that missed."],
    ["Dishonored", "Immersive Sim", "A plague city built so every rooftop was a solution."],
    ["FTL: Faster Than Light", "Roguelike", "A ship, a fire, three crew and one very bad decision per run."],
    ["Hotline Miami", "Action", "Neon, synths, and one-hit kills in both directions; a game about the mask."],
    ["The Walking Dead", "Adventure", "Episodic choices that made saving one person hurt for weeks.", "The Walking Dead (video game)"]
  ]],
  [2013, [
    ["The Last of Us", "Action-Adventure", "Performance capture and restraint pulled prestige drama into the medium.", "The Last of Us (video game)"],
    ["Grand Theft Auto V", "Open World", "Three protagonists, one satirical Los Angeles, a decade of afterlife."],
    ["Papers, Please", "Simulation", "Bureaucracy as moral horror; a stamp is the most violent tool here."],
    ["Super Mario 3D World", "Platformer", "Cat suits and four-player chaos, sharpened to Nintendo's usual point."],
    ["Gone Home", "Adventure", "A house, a mixtape and a story told entirely through what people left out."],
    ["Dota 2", "MOBA", "Free, unforgiving, and carrying the largest prize pool in esports."]
  ]],
  [2014, [
    ["Alien: Isolation", "Horror", "One creature, no script, and the most faithful sci-fi set in games."],
    ["Shovel Knight", "Platformer", "Retro homage with modern generosity; proof nostalgia can be craft."],
    ["Bayonetta 2", "Action", "Combat so legible and excessive it reads as choreography."],
    ["Destiny", "Shooter", "A shared-world shooter whose loop outlasted its own plot.", "Destiny (video game)"],
    ["Hearthstone", "Card Game", "Free-to-play deckbuilding that taught millions of people card-game maths."],
    ["Mario Kart 8", "Kart Racer", "Anti-gravity tracks and the definitive version of the definitive party racer."]
  ]],
  [2015, [
    ["The Witcher 3: Wild Hunt", "RPG", "Side quests written like short stories; the new bar for open-world writing."],
    ["Bloodborne", "Action RPG", "Gothic aggression: dodge instead of block, heal by hitting back."],
    ["Metal Gear Solid V", "Stealth", "The most flexible stealth sandbox ever built, and an unfinished ending.", "Metal Gear Solid V: The Phantom Pain"],
    ["Undertale", "RPG", "A game that notices whether you killed anything, and remembers."],
    ["Rocket League", "Sports", "Cars, football, and a skill ceiling nobody has found the top of."],
    ["Splatoon", "Shooter", "Territory over kills; a shooter for people who dislike shooters.", "Splatoon (video game)"]
  ]],
  [2016, [
    ["Overwatch", "Hero Shooter", "Character design so strong it eclipsed the shooter underneath.", "Overwatch (video game)"],
    ["Doom", "FPS", "Push-forward combat: healing by violence, at a heavy-metal tempo.", "Doom (2016 video game)"],
    ["Inside", "Puzzle-Platformer", "Silent, grim, and flawlessly paced from first frame to final scream.", "Inside (video game)"],
    ["Stardew Valley", "Sim", "One developer, four years, and a farm millions moved into."],
    ["Titanfall 2", "FPS", "Wall-running, a mech with manners, and a campaign that never repeats a trick."],
    ["Hitman", "Stealth", "Episodic sandboxes designed to be replayed until you know every routine.", "Hitman (2016 video game)"]
  ]],
  [2017, [
    ["Breath of the Wild", "Action-Adventure", "Systemic chemistry over quest markers; climbing anything changed everything.", "The Legend of Zelda: Breath of the Wild"],
    ["NieR: Automata", "Action RPG", "Genre-shifting combat wrapped around philosophy and multiple endings."],
    ["Super Mario Odyssey", "Platformer", "Capture mechanics turned every enemy into a new verb."],
    ["PUBG", "Battle Royale", "A hundred players, a shrinking circle, an entire genre overnight.", "PUBG: Battlegrounds"],
    ["Hollow Knight", "Metroidvania", "Hand-drawn, quietly brutal, and several times larger than it admits."],
    ["Persona 5", "JRPG", "A calendar, a dungeon crawl and the best-dressed menus in the medium."]
  ]],
  [2018, [
    ["Red Dead Redemption 2", "Open World", "Obsessive simulation in service of the slowest, saddest western."],
    ["Celeste", "Platformer", "Brutal precision paired with the kindest story about anxiety.", "Celeste (video game)"],
    ["God of War", "Action-Adventure", "One unbroken camera shot and a father learning how to speak.", "God of War (2018 video game)"],
    ["Return of the Obra Dinn", "Puzzle", "Deduce sixty deaths from frozen moments; dithered black and white."],
    ["Into the Breach", "Tactics", "Perfect-information chess with mechs, and no excuse for a bad turn."],
    ["Dead Cells", "Roguelike", "Metroidvania movement bolted onto a roguelite run, at full speed."]
  ]],
  [2019, [
    ["Sekiro: Shadows Die Twice", "Action", "Swordplay as rhythm: deflect, posture, break. No build to hide behind."],
    ["Disco Elysium", "RPG", "No combat, twenty-four skills that argue with you, prose that earns it."],
    ["Outer Wilds", "Adventure", "A twenty-two minute solar system solved only with knowledge."],
    ["Death Stranding", "Adventure", "Logistics as gameplay; ropes instead of sticks, made strangely moving."],
    ["Slay the Spire", "Roguelike Deckbuilder", "Three characters, one ascent, and a genre's worth of imitators."],
    ["Apex Legends", "Battle Royale", "A ping system so good it made squad play possible without a microphone."]
  ]],
  [2020, [
    ["Hades", "Roguelike", "Narrative that advances through failure, with combat worth failing at.", "Hades (video game)"],
    ["Half-Life: Alyx", "VR FPS", "The first VR game that justified the headset on its own terms."],
    ["Animal Crossing: New Horizons", "Life Sim", "An island that arrived in the exact month the world needed one."],
    ["Ghost of Tsushima", "Open World", "Wind instead of waypoints; samurai cinema in a photo-mode paradise."],
    ["Doom Eternal", "FPS", "Resource juggling disguised as a power fantasy, played at a sprint."],
    ["Fall Guys", "Party", "Physics comedy as a battle royale; sixty beans, one crown."]
  ]],
  [2021, [
    ["It Takes Two", "Co-op Platformer", "Every level a new mechanic, playable only with someone else.", "It Takes Two (video game)"],
    ["Metroid Dread", "Action-Adventure", "2D Metroid returns with lethal pursuit and immaculate movement."],
    ["Returnal", "Roguelike", "Bullet-hell third person wrapped in a time loop and a crash site."],
    ["Inscryption", "Card Game", "A deckbuilder that keeps escaping the room it started in."],
    ["Forza Horizon 5", "Racing", "An open Mexico and the most generous driving model on the market."],
    ["Psychonauts 2", "Platformer", "Sixteen years later, and the writing still lands every single time."]
  ]],
  [2022, [
    ["Elden Ring", "Action RPG", "Souls design poured into open country; mystery you find rather than read."],
    ["Vampire Survivors", "Roguelike", "Almost no inputs, absurd number growth, impossible to put down."],
    ["God of War Ragnarok", "Action-Adventure", "Bigger, angrier, and better written than a sequel needed to be.", "God of War Ragnarök"],
    ["Stray", "Adventure", "A cat in a dead neon city; small, exact, and beautifully observed.", "Stray (video game)"],
    ["Tunic", "Adventure", "A fox, a manual you assemble page by page, and secrets under everything.", "Tunic (video game)"],
    ["Pentiment", "Adventure", "Illuminated manuscripts as a murder mystery, typeset with real conviction.", "Pentiment (video game)"]
  ]],
  [2023, [
    ["Baldur's Gate 3", "RPG", "Tabletop freedom honoured at a scale nobody thought shippable."],
    ["Tears of the Kingdom", "Action-Adventure", "A physics toolkit generous enough to break its own puzzles.", "The Legend of Zelda: Tears of the Kingdom"],
    ["Alan Wake 2", "Horror", "Live action, song numbers and two detectives editing reality."],
    ["Pizza Tower", "Platformer", "Hand-drawn momentum chaos, loud and joyful throughout."],
    ["Street Fighter 6", "Fighting", "Modern controls and a single-player mode that actually teaches the game."],
    ["Cocoon", "Puzzle", "Worlds carried inside worlds, taught without a single word.", "Cocoon (video game)"]
  ]],
  [2024, [
    ["Balatro", "Roguelike Deckbuilder", "Poker hands plus jokers plus mathematics that runs away from you."],
    ["Astro Bot", "Platformer", "Pure toy-box delight and the best haptics on any controller."],
    ["Black Myth: Wukong", "Action RPG", "Chinese mythology rendered as spectacle; a landmark for the region."],
    ["Metaphor: ReFantazio", "JRPG", "Election-season fantasy politics with Atlus's sharpest combat yet."],
    ["Helldivers 2", "Co-op Shooter", "Friendly fire as comedy, inside a galactic war that actually moved."],
    ["Animal Well", "Metroidvania", "A 33MB world of secrets the internet needed weeks to finish unpicking."]
  ]],
  [2025, [
    ["Clair Obscur: Expedition 33", "JRPG", "Turn-based combat with parries, and a debut that outclassed its budget."],
    ["Blue Prince", "Puzzle", "A house that redraws itself daily; deduction as domestic architecture."],
    ["Split Fiction", "Co-op Platformer", "Two players, two genres per level, and still no solo mode."],
    ["Hollow Knight: Silksong", "Metroidvania", "Six years of waiting, answered with speed, spite and a new moveset."],
    ["Mario Kart World", "Kart Racer", "The kart racer opens its track list into one continuous island."],
    ["Kingdom Come: Deliverance II", "RPG", "Medieval Bohemia simulated down to the sword angles and the laundry."]
  ]]
];
