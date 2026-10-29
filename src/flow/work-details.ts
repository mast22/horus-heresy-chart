/** Bibliographic details for every charted work. */

export type WorkDetails = {
  author: string;
  year: number;
  length: string;
  description: string;
};

export const workDetails: Readonly<Record<string, WorkDetails>> = {
  "the-last-church": {
    author: "Graham McNeill",
    year: 2009,
    length: "1 hr 26 min audio",
    description:
      "The Emperor, in disguise, visits Terra's last priest to debate faith in the final days of unification.",
  },
  "ordo-sinister": {
    author: "John French",
    year: 2017,
    length: "22 pages",
    description:
      "A glimpse of the Ordo Sinister, the Mechanicum's forbidden order of psi-Titans, as it is unleashed.",
  },
  "the-maste-f-mankin": {
    author: "Aaron Dembski-Bowden",
    year: 2016,
    length: "404 pages",
    description:
      "The Emperor leads the defence of the Imperial Webway beneath the Palace as war reaches Terra.",
  },
  "the-kaban-project": {
    author: "Graham McNeill",
    year: 2004,
    length: "47 pages",
    description:
      "A magos of Mars secretly constructs a forbidden machine intelligence as war approaches.",
  },
  mechanicum: {
    author: "Graham McNeill",
    year: 2008,
    length: "416 pages",
    description:
      "The Mechanicum of Mars fractures into civil war as loyalists and traitors seize the forges.",
  },
  "into-exile": {
    author: "Aaron Dembski-Bowden",
    year: 2016,
    length: "20 pages",
    description:
      "A forbidden machine intelligence escapes Mars, pursued as the Heresy begins.",
  },
  "bringer-of-sorrow": {
    author: "Aaron Dembski-Bowden",
    year: 2019,
    length: "20 pages",
    description:
      "A lone Raven Guard assassin is dispatched to hunt down a target in the void.",
  },
  magisterium: {
    author: "Chris Wraight",
    year: 2017,
    length: "22 pages",
    description:
      "The Fabricator General's court is engulfed in intrigue as Mars slides toward war.",
  },
  vorax: {
    author: "Matthew Farrer",
    year: 2014,
    length: "11 pages",
    description:
      "A Mechanicum ark is stalked by a feral war-machine in the void.",
  },
  "the-binary-succession": {
    author: "David Annandale",
    year: 2017,
    length: "1 hr 15 min audio",
    description:
      "The Mechanicum's succession is contested amid the chaos of the Martian civil war.",
  },
  myriad: {
    author: "Rob Sanders",
    year: 2016,
    length: "29 pages",
    description:
      "A sentient war-machine is set loose on a mission across a divided Mars.",
  },
  cybernetica: {
    author: "Rob Sanders",
    year: 2015,
    length: "127 pages",
    description:
      "A disgraced tech-adept is sent to a forge world to root out a hidden traitor.",
  },
  "the-lightning-hall": {
    author: "Graham McNeill",
    year: 2020,
    length: "46 pages",
    description:
      "The Custodians and Mechanicum guard the secret halls beneath the Imperial Palace.",
  },
  "the-board-is-set": {
    author: "Gav Thorpe",
    year: 2017,
    length: "20 pages",
    description:
      "Malcador and the Emperor play a game that foreshadows the battles of the Heresy.",
  },
  "blood-games": {
    author: "Dan Abnett",
    year: 2009,
    length: "1 hr 26 min audio",
    description:
      "A Custodian runs a blood game, hunting the Emperor to test the Palace's defences.",
  },
  "the-outcast-dead": {
    author: "Graham McNeill",
    year: 2011,
    length: "416 pages",
    description:
      "Prisoners and jailers are trapped together when the Heresy reaches Terra.",
  },
  abyssal: {
    author: "David Annandale",
    year: 2018,
    length: "16 pages",
    description:
      "A Dark Angels warship ventures into the treacherous region known as the Abyss.",
  },
  "wolt-hunt": {
    author: "Graham McNeill",
    year: 2013,
    length: "1 hr 15 min audio",
    description:
      "A Space Wolf and a Custodian track a dangerous quarry across Terra.",
  },
  "thief-of-revelations": {
    author: "Graham McNeill",
    year: 2013,
    length: "39 min audio",
    description:
      "A Thousand Son summons a daemon to steal forbidden knowledge from another Legion.",
  },
  morningstar: {
    author: "Graham McNeill",
    year: 2019,
    length: "24 min audio",
    description: "A Word Bearer carries a dark mission to a loyal world.",
  },
  "the-cr-the-crimson-king": {
    author: "Graham McNeill",
    year: 2017,
    length: "496 pages",
    description:
      "The Thousand Sons search for a way to reach their fallen primarch Magnus.",
  },
  "prospero-ero-burns": {
    author: "Dan Abnett",
    year: 2010,
    length: "444 pages",
    description:
      "The destruction of Prospero is witnessed through the eyes of the Space Wolves.",
  },
  "a-thousand-sons": {
    author: "Graham McNeill",
    year: 2010,
    length: "558 pages",
    description:
      "The Thousand Sons' psychic mastery brings the Legions to the brink of judgement at Nikaea.",
  },
  "prologue-to-nikaea": {
    author: "David Annandale",
    year: 2018,
    length: "21 pages",
    description:
      "The events leading to the Council of Nikaea, where the use of psychic power is judged.",
  },
  "lucius-the-eternal-blade": {
    author: "Graham McNeill",
    year: 2013,
    length: "12 min audio",
    description:
      "Lucius of the Emperor's Children duels a champion of another Legion.",
  },
  "brotherhood-of-the-moon": {
    author: "Chris Wraight",
    year: 2014,
    length: "13 pages",
    description:
      "A White Scar faces a trial that reveals his Legion's hidden purpose.",
  },
  restorer: {
    author: "Chris Wraight",
    year: 2017,
    length: "23 pages",
    description:
      "A Mechanicum adept labours to restore a shattered Titan to war.",
  },
  allegiance: {
    author: "Chris Wraight",
    year: 2017,
    length: "33 pages",
    description: "A White Scar must decide where his loyalty truly lies.",
  },
  "the-last-council": {
    author: "L.J. Goulding",
    year: 2018,
    length: "28 pages",
    description:
      "A council of the Imperium debates the fate of the lost Legions.",
  },
  "the-last-son-of-prospero": {
    author: "Chris Wraight",
    year: 2016,
    length: "24 pages",
    description:
      "A dying Thousand Son is offered a new purpose in the shadows of the war.",
  },
  "the-pa-the-path-of-heaven": {
    author: "Chris Wraight",
    year: 2016,
    length: "432 pages",
    description:
      "The White Scars fight to reunite their scattered Legion and reach Terra.",
  },
  daemonology: {
    author: "Chris Wraight",
    year: 2014,
    length: "22 pages",
    description:
      "A Word Bearer confronts the daemons his Legion has pledged itself to serve.",
  },
  scars: {
    author: "Chris Wraight",
    year: 2013,
    length: "416 pages",
    description:
      "The White Scars learn of the Heresy and must choose where their loyalty lies.",
  },
  rebirth: {
    author: "Chris Wraight",
    year: 2011,
    length: "39 pages",
    description:
      "A broken Thousand Son is remade in secret beneath the Imperial Palace.",
  },
  "the-thirteenth-wolf": {
    author: "Gav Thorpe",
    year: 2016,
    length: "1 hr 7 min audio",
    description:
      "A Space Wolf of the 13th Great Company faces the war's turning point.",
  },
  "the-sigillite": {
    author: "Chris Wraight",
    year: 2013,
    length: "1 hr 11 min audio",
    description:
      "Malcador the Sigillite guards Terra and the Emperor's secrets during the Heresy.",
  },
  "the-soul-severed": {
    author: "Chris Wraight",
    year: 2016,
    length: "25 min audio",
    description:
      "A Mechanicum adept is remade into a vessel for a Titan's power.",
  },
  "the-devine-adoratrice": {
    author: "Graham McNeill",
    year: 2014,
    length: "in War Without End (544 pp.)",
    description:
      "A cult rises within the Mechanicum to venerate a new divinity.",
  },
  "old-wounds-new-scars": {
    author: "Graham McNeill",
    year: 2018,
    length: "29 pages",
    description: "Old wounds of the Heresy are reopened as new scars are made.",
  },
  "wolf-n-wolf-mother": {
    author: "Graham McNeill",
    year: 2015,
    length: "36 pages",
    description:
      "The mother of a slain Space Wolf confronts the Legion that took her son.",
  },
  "brotherhoodof-the-storm": {
    author: "Chris Wraight",
    year: 2012,
    length: "123 pages",
    description:
      "The White Scars' Great Khan is drawn into a hunt for a mysterious enemy.",
  },
  "wolf-at-the-door": {
    author: "Mike Lee",
    year: 2009,
    length: "2 hr 53 min audio",
    description:
      "The Space Wolves defend against an enemy that strikes at their home.",
  },
  "lone-wolf": {
    author: "Chris Wraight",
    year: 2013,
    length: "9 pages",
    description:
      "A lone Space Wolf hunts a traitor across the war-torn galaxy.",
  },
  blackshield: {
    author: "Chris Wraight",
    year: 2016,
    length: "23 pages",
    description:
      "A warrior who has forsworn his Legion fights alone as a Blackshield.",
  },
  "howl-of-the-hearthworld": {
    author: "Aaron Dembski-Bowden",
    year: 2015,
    length: "16 pages",
    description:
      "A garrison of Space Wolves holds a world against the traitors.",
  },
  twisted: {
    author: "Guy Haley",
    year: 2015,
    length: "35 pages",
    description:
      "A Word Bearer is reshaped by the dark powers he has come to serve.",
  },
  "little-horus": {
    author: "Dan Abnett",
    year: 2011,
    length: "29 pages",
    description:
      "Horus Aximand reckons with his bond to the Warmaster as the war deepens.",
  },
  "vengeful-spirit": {
    author: "Graham McNeill",
    year: 2014,
    length: "544 pages",
    description:
      "The Sons of Horus muster aboard the Vengeful Spirit as the Warmaster seeks power.",
  },
  wolfsbane: {
    author: "Guy Haley",
    year: 2018,
    length: "341 pages",
    description: "Leman Russ gambles on a strike against Horus and his Legion.",
  },
  "two-meta-two-metaphysical-blades": {
    author: "Chris Wraight",
    year: 2018,
    length: "20 pages",
    description:
      "Two peerless blades pass between the hands of primarchs and their warriors.",
  },
  "wolf-s-claw": {
    author: "Chris Wraight",
    year: 2014,
    length: "9 min audio",
    description: "A Space Wolf is tested by the burden of a primarch's gift.",
  },
  "wolf-king": {
    author: "Chris Wraight",
    year: 2015,
    length: "122 pages",
    description:
      "Leman Russ leads the Space Wolves in a war of attrition after Prospero.",
  },
  "lost-sons": {
    author: "James Swallow",
    year: 2012,
    length: "21 pages",
    description: "A warrior searches for the lost sons of a shattered Legion.",
  },
  "luna-mendax": {
    author: "Graham McNeill",
    year: 2013,
    length: "26 pages",
    description: "A Dark Angel undertakes a secret mission on Terra's moon.",
  },
  "garro-novelization-of-short-stories": {
    author: "James Swallow",
    year: 2017,
    length: "464 pages",
    description:
      "The collected adventures of Nathaniel Garro, blade of the Sigillite.",
  },
  "the-last-remembrancer-ancer-16": {
    author: "John French",
    year: 2011,
    length: "16 pages",
    description:
      "A remembrancer records the final days of the Great Crusade's ideal.",
  },
  "grey-angel": {
    author: "John French",
    year: 2012,
    length: "35 min audio",
    description:
      "A Custodian ventures among the Dark Angels in search of the truth.",
  },
  "all-that-remains": {
    author: "James Swallow",
    year: 2015,
    length: "28 pages",
    description: "Survivors of a doomed expedition cling to what remains.",
  },
  nemesis: {
    author: "James Swallow",
    year: 2010,
    length: "507 pages",
    description:
      "The Officio Assassinorum dispatches its deadliest operatives against Horus.",
  },
  gunsight: {
    author: "James Swallow",
    year: 2015,
    length: "37 pages",
    description: "An assassin of the Officio hunts a target across the war.",
  },
  "the-watcher": {
    author: "C.Z. Dunn",
    year: 2014,
    length: "19 min audio",
    description: "A Watcher in the Dark observes the fate of the Dark Angels.",
  },
  "the-serpent-s-dance": {
    author: "Mike Brooks",
    year: 2020,
    length: "30 pages",
    description:
      "An Alpha Legion scheme unfolds beneath a world's glittering surface.",
  },
  "the-voice": {
    author: "James Swallow",
    year: 2009,
    length: "2 hr 1 min audio",
    description:
      "A remembrancer's recorded voice carries a message across the war.",
  },
  "ghosts-speak-not": {
    author: "James Swallow",
    year: 2016,
    length: "in Ghosts Speak Not & Patience (65 pp.)",
    description:
      "An Alpha Legionary is tested by a mission that must leave no trace.",
  },
  patience: {
    author: "James Swallow",
    year: 2016,
    length: "in Ghosts Speak Not & Patience (65 pp.)",
    description: "A patient hunter waits for the perfect moment to strike.",
  },
  "child-ofnight": {
    author: "John French",
    year: 2014,
    length: "21 pages",
    description: "A Night Lord stalks a world that has forgotten fear.",
  },
  "the-fury-of-magnus": {
    author: "Graham McNeill",
    year: 2020,
    length: "248 pages",
    description:
      "Magnus the Red makes a final gambit during the Siege of Terra.",
  },
  "the-eagle-s-talon-lon": {
    author: "John French",
    year: 2015,
    length: "38 min audio",
    description: "Imperial Fists board a Traitor warship in the void.",
  },
  "iron-corpses": {
    author: "David Annandale",
    year: 2015,
    length: "39 min audio",
    description:
      "The crew of a dead Titan keeps fighting inside its ruined hull.",
  },
  imperfect: {
    author: "Nick Kyme",
    year: 2015,
    length: "19 pages",
    description: "A primarch confronts a being created in his own image.",
  },
  chirurgeon: {
    author: "Nick Kyme",
    year: 2015,
    length: "18 pages",
    description: "A Legion's chief chirurgeon practises his art amid the war.",
  },
  "death-of-a-silversmith": {
    author: "Graham McNeill",
    year: 2012,
    length: "16 pages",
    description: "A silversmith's craft is drawn into the death of worlds.",
  },
  riven: {
    author: "John French",
    year: 2013,
    length: "39 pages",
    description: "An Iron Hand is torn between the flesh and the machine.",
  },
  siren: {
    author: "John French",
    year: 2016,
    length: "42 pages",
    description:
      "A warship's crew falls under a strange and dangerous influence.",
  },
  "grandfather-s-gift": {
    author: "Guy Haley",
    year: 2017,
    length: "17 pages",
    description: "A Death Guard warrior receives the Plague God's first gift.",
  },
  "the-keys-of-hel": {
    author: "John French",
    year: 2015,
    length: "in Shattered Legions (496 pp.)",
    description:
      "The Iron Hands unlock forbidden technology to wage their war.",
  },
  "black-oculus": {
    author: "John French",
    year: 2015,
    length: "8 pages",
    description: "A Mechanicum device reveals truths better left unseen.",
  },
  ironclad: {
    author: "John French",
    year: 2015,
    length: "235 pages",
    description: "An Iron Hands warship pursues a secret mission in the void.",
  },
  executioner: {
    author: "John French",
    year: 2013,
    length: "128 pages",
    description: "A Dark Angel hunts the fallen among the stars.",
  },
  "distant-echoes-of-old-night": {
    author: "Rob Sanders",
    year: 2012,
    length: "27 pages",
    description: "A boarding action awakens an ancient horror in the void.",
  },
  "the-reflection-crack-d": {
    author: "Graham McNeill",
    year: 2012,
    length: "95 pages",
    description:
      "The Emperor's Children seek to restore their wounded primarch.",
  },
  witness: {
    author: "John French",
    year: 2015,
    length: "7 pages",
    description: "A lone survivor bears witness to a massacre.",
  },
  "child-of-chaos": {
    author: "Chris Wraight",
    year: 2020,
    length: "25 pages",
    description: "A Word Bearer embraces the powers his Legion now serves.",
  },
  "lantern-lantern-s-light": {
    author: "James Swallow",
    year: 2019,
    length: "22 pages",
    description: "A knight carries a lantern of strange light into the dark.",
  },
  "dark-compliance": {
    author: "John French",
    year: 2017,
    length: "1 hr 4 min audio",
    description:
      "A world is brought to compliance by the forces of the Dark Mechanicum.",
  },
  "galaxy-in-flames": {
    author: "Ben Counter",
    year: 2006,
    length: "416 pages",
    description:
      "The first great battle of the Heresy erupts on the world of Isstvan III.",
  },
  "angel-exterminatus": {
    author: "Graham McNeill",
    year: 2012,
    length: "416 pages",
    description:
      "Perturabo and Fulgrim pursue a weapon of immense and terrible power.",
  },
  "the-flight-of-the-eisenstein": {
    author: "James Swallow",
    year: 2007,
    length: "416 pages",
    description:
      "Nathaniel Garro races to warn Terra of the unfolding betrayal.",
  },
  "slaves-to-darkness": {
    author: "John French",
    year: 2018,
    length: "347 pages",
    description:
      "The Traitor Legions muster as Horus readies his armada for Terra.",
  },
  "the-buried-dagger": {
    author: "James Swallow",
    year: 2019,
    length: "386 pages",
    description:
      "The Death Guard faces a fateful choice on the eve of the Siege of Terra.",
  },
  "the-solar-war": {
    author: "John French",
    year: 2019,
    length: "384 pages",
    description:
      "The Traitor armada breaks through the defences of the Sol System.",
  },
  "the-lost-and-the-damned": {
    author: "Guy Haley",
    year: 2019,
    length: "426 pages",
    description:
      "The Siege of Terra begins as the Traitor hordes assault the Palace.",
  },
  "the-first-wall": {
    author: "Gav Thorpe",
    year: 2020,
    length: "460 pages",
    description:
      "The defenders of Terra hold a key spaceport against the Traitors.",
  },
  saturnine: {
    author: "Dan Abnett",
    year: 2020,
    length: "464 pages",
    description:
      "The defenders of Terra face the Traitors' onslaught at the Saturnine Gate.",
  },
  mortis: {
    author: "John French",
    year: 2021,
    length: "560 pages",
    description:
      "Titan Legions clash on the plains before the Imperial Palace.",
  },
  warhawk: {
    author: "Chris Wraight",
    year: 2021,
    length: "482 pages",
    description:
      "The White Scars and Death Guard clash as the Siege nears its climax.",
  },
  "false-gods": {
    author: "Graham McNeill",
    year: 2006,
    length: "420 pages",
    description:
      "The Warmaster is struck down, and those around him struggle to save him.",
  },
  kryptos: {
    author: "Graham McNeill",
    year: 2012,
    length: "16 pages",
    description:
      "A Raven Guard cryptographer deciphers a secret that could change the war.",
  },
  "fulgrim-rim": {
    author: "Graham McNeill",
    year: 2007,
    length: "512 pages",
    description:
      "The Emperor's Children seek perfection as Fulgrim campaigns against the Laer.",
  },
  "horus-rising": {
    author: "Dan Abnett",
    year: 2006,
    length: "412 pages",
    description:
      "The opening novel of the Heresy, following Horus Lupercal and the Luna Wolves as the first cracks appear in the Emperor's dream.",
  },
  "the-divine-word": {
    author: "Gav Thorpe",
    year: 2012,
    length: "22 pages",
    description: "A Word Bearer preaches a new faith to a captive world.",
  },
  "the-phoenician": {
    author: "Nick Kyme",
    year: 2015,
    length: "9 pages",
    description: "Fulgrim confronts a ghost of his past during the war.",
  },
  "the-shadowmasters": {
    author: "Gav Thorpe",
    year: 2016,
    length: "12 min audio",
    description: "Raven Guard operatives wage a covert war behind enemy lines.",
  },
  "the-grey-raven-the-grey": {
    author: "Gav Thorpe",
    year: 2016,
    length: "21 pages",
    description: "A Raven Guard infiltrator moves unseen among the enemy.",
  },
  "the-harrowing": {
    author: "Rob Sanders",
    year: 2014,
    length: "in War Without End (544 pp.)",
    description: "A Raven Guard vessel is stalked through the void.",
  },
  "the-wolf-of-ash-and-fire": {
    author: "Graham McNeill",
    year: 2014,
    length: "43 pages",
    description: "Horus fights beside the Emperor against a vast Ork Waaagh.",
  },
  "the-face-of-treachery": {
    author: "Gav Thorpe",
    year: 2011,
    length: "28 pages",
    description: "A Death Guard uncovers a threat lurking aboard his own ship.",
  },
  "lord-of-the-red-sands": {
    author: "Aaron Dembski-Bowden",
    year: 2013,
    length: "12 pages",
    description: "A World Eater fights amid the red sands of a death world.",
  },
  "deliverance-lost": {
    author: "Gav Thorpe",
    year: 2011,
    length: "480 pages",
    description: "Corvus Corax races to rebuild his shattered Raven Guard.",
  },
  ravenlord: {
    author: "Gav Thorpe",
    year: 2014,
    length: "128 pages",
    description: "Corvus Corax carries the war to his Legion's enemies.",
  },
  "the-value-of-fear": {
    author: "Gav Thorpe",
    year: 2014,
    length: "in Corax (416 pp.)",
    description: "A Raven Guard teaches the value of fear to an enemy.",
  },
  soulforge: {
    author: "Gav Thorpe",
    year: 2013,
    length: "128 pages",
    description: "A Raven Guard faces the Dark Mechanicum's soul-forges.",
  },
  valerius: {
    author: "Gav Thorpe",
    year: 2016,
    length: "22 min audio",
    description: "A Raven Guard is tested in the crucible of war.",
  },
  "raven-s-flight": {
    author: "Gav Thorpe",
    year: 2010,
    length: "1 hr 8 min audio",
    description: "The Raven Guard fight for survival in the wake of Isstvan V.",
  },
  weregeld: {
    author: "Gav Thorpe",
    year: 2016,
    length: "in Corax (416 pp.)",
    description: "A Raven Guard seeks to settle a blood-debt.",
  },
  "titani-titandeath": {
    author: "Guy Haley",
    year: 2018,
    length: "401 pages",
    description:
      "Titan Legions clash in the greatest armoured battle of the Heresy.",
  },
  raptor: {
    author: "Gav Thorpe",
    year: 2015,
    length: "1 hr 8 min audio",
    description: "A Raven Guard warrior fights on after a devastating loss.",
  },
  "sermon-of-exodus": {
    author: "David Annandale",
    year: 2014,
    length: "in War Without End (544 pp.)",
    description: "A preacher rallies a world to the cause of the war.",
  },
  "the-noose": {
    author: "David Annandale",
    year: 2015,
    length: "in Shattered Legions (496 pp.)",
    description: "A trap tightens around a Loyalist force in the void.",
  },
  serpent: {
    author: "John French",
    year: 2013,
    length: "11 min audio",
    description: "An Alpha Legionary hunts a hidden target.",
  },
  massacre: {
    author: "Aaron Dembski-Bowden",
    year: 2018,
    length: "in Eye of Terra (416 pp.)",
    description: "The survivors of a massacre reckon with its aftermath.",
  },
  "the-damnation-of-pythos": {
    author: "David Annandale",
    year: 2014,
    length: "416 pages",
    description:
      "Survivors of Isstvan V are drawn to a desolate world haunted by an ancient evil.",
  },
  "the-final-compliance-of-sixty-three-fourteen": {
    author: "Guy Haley",
    year: 2014,
    length: "in Eye of Terra (416 pp.)",
    description: "A world is brought into compliance in the Emperor's name.",
  },
  dreadwing: {
    author: "David Guymer",
    year: 2018,
    length: "114 pages",
    description: "The Dark Angels unleash their most feared wing of war.",
  },
  "veritas-ferrum": {
    author: "David Annandale",
    year: 2012,
    length: "11 min audio",
    description: "A Dark Angels warship hunts a hidden enemy in the void.",
  },
  ruinstorm: {
    author: "David Annandale",
    year: 2017,
    length: "384 pages",
    description:
      "The Ultramarines face the storm of the Ruinstorm and a changed galaxy.",
  },
  "descent-of-angels": {
    author: "Mitchel Scanlon",
    year: 2007,
    length: "413 pages",
    description:
      "The origins of the Dark Angels and the order of Caliban before the Imperium.",
  },
  "the-atonement-of-fire": {
    author: "David Annandale",
    year: 2018,
    length: "in Sons of the Emperor (220 pp.)",
    description: "A Salamander seeks atonement through fire and trial.",
  },
  "guardian-of-order": {
    author: "Gav Thorpe",
    year: 2013,
    length: "12 min audio",
    description: "A guardian of the Imperium upholds order amid the war.",
  },
  "spear-of-spear-of-ultramar": {
    author: "David Annandale",
    year: 2018,
    length: "100 pages",
    description: "The Ultramarines receive a weapon of great significance.",
  },
  "call-of-the-lion": {
    author: "Gav Thorpe",
    year: 2009,
    length: "1 hr 15 min audio",
    description: "The Lion calls upon his Legion for a secret war.",
  },
  "fallen-angels": {
    author: "Mike Lee",
    year: 2009,
    length: "416 pages",
    description:
      "The Dark Angels are divided between Caliban and the wider war.",
  },
  "by-the-lion-s-command": {
    author: "Gav Thorpe",
    year: 2015,
    length: "in Corax (416 pp.)",
    description: "A mission is undertaken at the Lion's command.",
  },
  "the-lion": {
    author: "Gav Thorpe",
    year: 2012,
    length: "95 pages",
    description: "The Lion is measured in a duel of words and wills.",
  },
  "deeds-endure": {
    author: "Gav Thorpe",
    year: 2015,
    length: "in Shattered Legions (496 pp.)",
    description: "A legacy of deeds endures beyond the fall.",
  },
  "angels-of-caliban": {
    author: "Gav Thorpe",
    year: 2016,
    length: "398 pages",
    description:
      "Caliban and its Dark Angels are torn by secrets and suspicion.",
  },
  "luther-first-of-the-fallen": {
    author: "Gav Thorpe",
    year: 2021,
    length: "224 pages",
    description:
      "Luther of the Dark Angels gives his account of his life and the fall of Caliban.",
  },
  "savage-weapons": {
    author: "Aaron Dembski-Bowden",
    year: 2011,
    length: "40 pages",
    description:
      "The Lion and the Night Haunter meet in a savage duel on the frontier.",
  },
  "army-of-one": {
    author: "Rob Sanders",
    year: 2012,
    length: "in The Silent War (468 pp.)",
    description: "A lone warrior wages a war against impossible odds.",
  },
  exocytosis: {
    author: "James Swallow",
    year: 2016,
    length: "28 pages",
    description: "A Death Guard undertakes a grim task aboard a warship.",
  },
  "master-of-the-first": {
    author: "Gav Thorpe",
    year: 2014,
    length: "20 pages",
    description: "The First Legion's earliest master is revealed.",
  },
  "prince-of-crows": {
    author: "Aaron Dembski-Bowden",
    year: 2014,
    length: "3 hr 25 min audio",
    description: "Sevatar of the Night Lords rises to command among his kin.",
  },
  "the-long-night": {
    author: "Aaron Dembski-Bowden",
    year: 2014,
    length: "42 min audio",
    description:
      "A long night of terror falls upon a world of the Night Lords.",
  },
  "forgotten-sons": {
    author: "Nick Kyme",
    year: 2011,
    length: "77 pages",
    description: "A Legion reckons with the sons it left behind.",
  },
  "the-gates-of-terra": {
    author: "Nick Kyme",
    year: 2013,
    length: "22 pages",
    description:
      "The defenders hold the gates of Terra against the coming storm.",
  },
  "herald-of-sanguinius": {
    author: "Andy Smillie",
    year: 2014,
    length: "19 min audio",
    description: "A herald of Sanguinius carries his primarch's will to war.",
  },
  "promethean-sun": {
    author: "Nick Kyme",
    year: 2011,
    length: "128 pages",
    description: "A Salamander fights beneath a promethean sun.",
  },
  ironfire: {
    author: "Rob Sanders",
    year: 2015,
    length: "27 pages",
    description: "A war of iron and fire rages across a world.",
  },
  "virtues-of-the-sons": {
    author: "Andy Smillie",
    year: 2015,
    length: "18 pages",
    description: "The virtues of the Blood Angels' sons are tested.",
  },
  "the-iron-within": {
    author: "Rob Sanders",
    year: 2011,
    length: "34 pages",
    description: "A garrison holds fast within an iron defence.",
  },
  "sins-of-the-father-ther": {
    author: "Andy Smillie",
    year: 2014,
    length: "10 pages",
    description: "The sins of a father are visited upon a son.",
  },
  "scorched-earth": {
    author: "Nick Kyme",
    year: 2013,
    length: "123 pages",
    description: "A world is left scorched by the passing of war.",
  },
  "feat-of-iron": {
    author: "Nick Kyme",
    year: 2012,
    length: "102 pages",
    description: "A great feat of iron is achieved in the war.",
  },
  "a-safe-and-shadowe-shadowed-place": {
    author: "Guy Haley",
    year: 2015,
    length: "24 pages",
    description: "A Night Lord finds refuge in a safe and shadowed place.",
  },
  unforged: {
    author: "Guy Haley",
    year: 2015,
    length: "in Shattered Legions (496 pp.)",
    description: "A warrior is left unforged by the loss of his primarch.",
  },
  "strike-and-fade": {
    author: "Guy Haley",
    year: 2012,
    length: "10 min audio",
    description: "A strike-and-fade war is waged by the Shattered Legions.",
  },
  unspoken: {
    author: "Guy Haley",
    year: 2015,
    length: "in Shattered Legions (496 pp.)",
    description: "An unspoken truth binds warriors of a broken Legion.",
  },
  "the-heart-of-the-pharos": {
    author: "L.J. Goulding",
    year: 2016,
    length: "37 min audio",
    description: "The Pharos beacon is guarded against a hidden enemy.",
  },
  "artefacts-and-or-50": {
    author: "Nick Kyme",
    year: 2015,
    length: "17 pages",
    description: "Artefacts of the Imperium are sought amid the war.",
  },
  "vulkan-lives": {
    author: "Nick Kyme",
    year: 2013,
    length: "408 pages",
    description:
      "Vulkan is hunted and imprisoned while his Legion searches for him.",
  },
  "the-lightning-tower": {
    author: "Dan Abnett",
    year: 2007,
    length: "1 hr 16 min (with The Dark King)",
    description: "Rogal Dorn keeps vigil from a tower as the storm gathers.",
  },
  "the-laurel-of-defiance": {
    author: "Guy Haley",
    year: 2017,
    length: "30 pages",
    description: "A laurel of defiance is won on the battlefield.",
  },
  "the-painted-count": {
    author: "Guy Haley",
    year: 2016,
    length: "23 pages",
    description: "A Night Lord count rules a world of painted terror.",
  },
  "the-dark-king-king-22": {
    author: "Graham McNeill",
    year: 2007,
    length: "1 hr 16 min (with The Lightning Tower)",
    description: "The Night Haunter's dark tale is told before the Heresy.",
  },
  pharos: {
    author: "Guy Haley",
    year: 2015,
    length: "480 pages",
    description: "The Pharos beacon becomes the focus of a desperate war.",
  },
  "the-unremembered-empire": {
    author: "Dan Abnett",
    year: 2013,
    length: "416 pages",
    description:
      "Guilliman founds Imperium Secundus on Macragge as the Heresy spreads.",
  },
  "the-first-heretic": {
    author: "Aaron Dembski-Bowden",
    year: 2010,
    length: "483 pages",
    description:
      "The Word Bearers' devotion is tested as Lorgar seeks a new truth.",
  },
  "red-marked": {
    author: "Nick Kyme",
    year: 2016,
    length: "1 hr 14 min audio",
    description: "A world of Ultramar bears the red mark of the Word Bearers.",
  },
  "the-crimson-fist": {
    author: "John French",
    year: 2012,
    length: "93 pages",
    description: "The Imperial Fists wage a desperate void war at Phall.",
  },
  stratagem: {
    author: "Nick Kyme",
    year: 2014,
    length: "12 pages",
    description: "An Alpha Legion stratagem unfolds to its hidden end.",
  },
  nightfane: {
    author: "Nick Kyme",
    year: 2018,
    length: "1 hr 13 min audio",
    description: "A Word Bearer fanetemple is shown in the war.",
  },
  "fear-to-tread": {
    author: "James Swallow",
    year: 2012,
    length: "414 pages",
    description:
      "The Blood Angels are lured to a distant system where a threat awaits.",
  },
  "embers-of-extinction": {
    author: "Brandon Easton",
    year: 2020,
    length: "in Sons of the Emperor (220 pp.)",
    description: "A Salamander fights amid the embers of extinction.",
  },
  "old-earth": {
    author: "Nick Kyme",
    year: 2017,
    length: "400 pages",
    description: "Vulkan and his Legion make the long journey back to Terra.",
  },
  warmaster: {
    author: "John French",
    year: 2012,
    length: "9 min audio",
    description: "The Warmaster's will is carried out across the war.",
  },
  "sons-of-the-forge": {
    author: "Nick Kyme",
    year: 2016,
    length: "240 pages",
    description: "The Salamanders' forge-sons are drawn into a secret war.",
  },
  deathfire: {
    author: "Nick Kyme",
    year: 2015,
    length: "416 pages",
    description: "The Salamanders carry a sacred burden across the stars.",
  },
  aurelian: {
    author: "Aaron Dembski-Bowden",
    year: 2011,
    length: "128 pages",
    description: "Lorgar's path toward a new truth is set in motion.",
  },
  "hunter-s-moon-on": {
    author: "Guy Haley",
    year: 2014,
    length: "36 min audio",
    description: "A hunt is waged beneath a hunter's moon.",
  },
  "liar-s-due": {
    author: "James Swallow",
    year: 2011,
    length: "44 pages",
    description: "A liar's debt comes due in the war.",
  },
  "hubris-of-monarchia": {
    author: "Andy Smillie",
    year: 2018,
    length: "1 hr 1 min audio",
    description: "The destruction of Monarchia tests the Word Bearers' faith.",
  },
  "the-ember-wolves": {
    author: "Rob Sanders",
    year: 2017,
    length: "21 pages",
    description: "A Space Wolf pack fights amid embers.",
  },
  immortalduty: {
    author: "Nick Kyme",
    year: 2017,
    length: "23 pages",
    description: "An immortal duty is upheld by a Legion.",
  },
  "champion-of-oaths": {
    author: "John French",
    year: 2017,
    length: "in Heralds of the Siege (432 pp.)",
    description: "A champion of oaths is tested on the battlefield.",
  },
  "honour-to-the-dead": {
    author: "Gav Thorpe",
    year: 2013,
    length: "1 hr 14 min audio",
    description: "Honour is rendered to the fallen.",
  },
  censure: {
    author: "Nick Kyme",
    year: 2013,
    length: "1 hr 15 min audio",
    description: "A censure is delivered to a wayward warrior.",
  },
  inheritor: {
    author: "Gav Thorpe",
    year: 2016,
    length: "20 pages",
    description: "An inheritor claims a legacy amid the war.",
  },
  "the-hand-elect": {
    author: "Chris Wraight",
    year: 2016,
    length: "in Shattered Legions (496 pp.)",
    description: "A chosen hand of the Alpha Legion carries out a mission.",
  },
  "rules-of-engagement": {
    author: "Graham McNeill",
    year: 2011,
    length: "47 pages",
    description: "The rules of engagement are tested in the war.",
  },
  "sons-of-the-selenar": {
    author: "Graham McNeill",
    year: 2020,
    length: "151 pages",
    description: "The Selenar gene-wrights of Luna are drawn into the war.",
  },
  "the-eightfold-path": {
    author: "Anthony Reynolds",
    year: 2013,
    length: "13 min audio",
    description: "A Word Bearer walks the eightfold path.",
  },
  "grey-talon": {
    author: "Chris Wraight",
    year: 2016,
    length: "59 min audio",
    description: "A White Scar strikes like a grey talon.",
  },
  "the-unburdened": {
    author: "David Annandale",
    year: 2015,
    length: "240 pages",
    description: "A warrior is freed of a burden in the war.",
  },
  "the-seventh-serpent-the-sevent": {
    author: "Graham McNeill",
    year: 2014,
    length: "118 pages",
    description: "The Alpha Legion's seventh serpent coils around a secret.",
  },
  "the-either": {
    author: "Graham McNeill",
    year: 2016,
    length: "1 hr 6 min audio",
    description: "A Mechanicum adept faces a choice between two paths.",
  },
  "the-honoured": {
    author: "Rob Sanders",
    year: 2015,
    length: "5 hr 36 min audio",
    description: "The honoured dead are remembered by their Legion.",
  },
  meduson: {
    author: "Dan Abnett",
    year: 2015,
    length: "in Meduson: Ultimate Edition (278 pp.)",
    description:
      "Shadrak Meduson leads the Shattered Legions' war of vengeance.",
  },
  "mark-of-calth": {
    author: "Various (ed. Laurie Goulding)",
    year: 2013,
    length: "416 pages",
    description: "The Ultramarines struggle to reclaim Calth after the attack.",
  },
  "battle-for-the-abyss": {
    author: "Ben Counter",
    year: 2008,
    length: "416 pages",
    description:
      "A small fleet races to intercept a warship bound for Ultramar.",
  },
  "know-no-fear": {
    author: "Dan Abnett",
    year: 2012,
    length: "412 pages",
    description:
      "The Ultramarines face an unexpected assault on the world of Calth.",
  },
  betrayer: {
    author: "Aaron Dembski-Bowden",
    year: 2012,
    length: "416 pages",
    description: "Angron and the World Eaters campaign across Ultramar.",
  },
  "heart-of-the-conqueror": {
    author: "Aaron Dembski-Bowden",
    year: 2014,
    length: "11 min audio",
    description: "A commander holds the heart of the World Eaters' flagship.",
  },
  "a-rose-watered-with-blood": {
    author: "Aaron Dembski-Bowden",
    year: 2018,
    length: "in A Rose Watered With Blood & Other Stories (167 pp.)",
    description: "A World Eater tends a rose watered with blood.",
  },
  "butcher-s-nails": {
    author: "Aaron Dembski-Bowden",
    year: 2012,
    length: "1 hr 13 min audio",
    description:
      "A World Eater fights against the rage of the Butcher's Nails.",
  },
  "the-revelation-of-theword": {
    author: "David Annandale",
    year: 2019,
    length: "24 min audio",
    description: "A Word Bearer receives a revelation of the word.",
  },
  perpetual: {
    author: "Dan Abnett",
    year: 2016,
    length: "26 min audio",
    description: "A perpetual walks a long road through the war.",
  },
  "after-desh-ea": {
    author: "Matthew Farrer",
    year: 2009,
    length: "1 hr 6 min audio",
    description: "After the battle of Desh'ea, a primarch is claimed.",
  },
  "macragge-s-honour": {
    author: "Dan Abnett",
    year: 2014,
    length: "128 pages",
    description: "Guilliman's flagship sails the stars of Ultramar.",
  },
  "children-of-sicarus": {
    author: "Anthony Reynolds",
    year: 2016,
    length: "38 min audio",
    description: "The children of Sicarus serve the Word Bearers.",
  },
  "the-purge": {
    author: "Anthony Reynolds",
    year: 2014,
    length: "128 pages",
    description: "A purge is carried out in the name of a new faith.",
  },
  "hands-of-the-emperor": {
    author: "Rob Sanders",
    year: 2015,
    length: "in War Without End (544 pp.)",
    description: "The Emperor's servants act in his name.",
  },
  "the-serpent-beneath": {
    author: "Rob Sanders",
    year: 2012,
    length: "101 pages",
    description: "The Alpha Legion infiltrates an enemy stronghold.",
  },
  "duty-waits": {
    author: "Guy Haley",
    year: 2017,
    length: "22 pages",
    description: "Duty waits for a warrior of the Imperial Fists.",
  },
  legion: {
    author: "Dan Abnett",
    year: 2008,
    length: "412 pages",
    description:
      "The Alpha Legion and the Geno Five-Two Chilliad clash over a secret world.",
  },
  "praetorian-of-dorn": {
    author: "John French",
    year: 2017,
    length: "478 pages",
    description:
      "Rogal Dorn defends the Sol System as a shadow war unfolds within it.",
  },
  "now-peals-midnight": {
    author: "John French",
    year: 2017,
    length: "20 pages",
    description: "A bell of midnight peals over the defence of Terra.",
  },
  templar: {
    author: "John French",
    year: 2014,
    length: "1 hr 2 min audio",
    description: "A Templar of the Imperial Fists fights in the void.",
  },
  "blackshields-the-broken-chain": {
    author: "Josh Reynolds",
    year: 2019,
    length: "1 hr 9 min audio",
    description: "Blackshields break the chains of their former allegiance.",
  },
  "blackshields-the-red-fief": {
    author: "Josh Reynolds",
    year: 2018,
    length: "1 hr 15 min audio",
    description: "Blackshields carve out a red fief among the stars.",
  },
  "blackshields-the-false-war": {
    author: "Josh Reynolds",
    year: 2017,
    length: "1 hr 11 min audio",
    description: "Blackshields wage a war of their own making.",
  },
  misbegotten: {
    author: "Dan Abnett",
    year: 2019,
    length: "in Sons of the Emperor (220 pp.)",
    description: "Misbegotten warriors of a broken Legion are revealed.",
  },
  terminus: {
    author: "Chris Wraight",
    year: 2021,
    length: "in Blood of the Emperor (192 pp.)",
    description: "A terminus of the Siege of Terra is defended.",
  },
  "the-chamber-at-the-end-of-memory": {
    author: "James Swallow",
    year: 2020,
    length: "in Scions of the Emperor (182 pp.)",
    description: "A chamber at the end of memory is opened.",
  },
  "prince-of-blood": {
    author: "L.J. Goulding",
    year: 2019,
    length: "in Sons of the Emperor (220 pp.)",
    description: "A prince of the Blood Angels is tested.",
  },
  "scions-of-the-storm": {
    author: "Anthony Reynolds",
    year: 2009,
    length: "1 hr 17 min audio",
    description: "The scions of Dorn ride the storm of the Siege.",
  },
};
