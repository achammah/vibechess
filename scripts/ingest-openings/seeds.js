// ── Curated family tabiyas (seeds for engine expansion) ───────────────────────
// Each seed is the family's CHARACTERISTIC opening position, given as a PGN of the
// fixed defining moves. The engine then branches sensible continuations from here.
//
// `family` MUST equal familyOf(name) used by the app (text before the first ":"
// or ","), so the generated rows group under the same course card. Several big
// families list MULTIPLE move-orders/tabiyas: more authentic seeds → more distinct
// trainable lines, all still genuinely part of that system.
//
// Families NOT listed here fall back to the DB's representative line (run.js's
// pattern), so coverage still widens for every family with ≥ a couple book lines.

/** @type {{family:string, eco?:string, tabiyas:string[]}[]} */
export const SEEDS = [
  {
    family: "London System",
    eco: "A48",
    tabiyas: [
      "1. d4 d5 2. Bf4",
      "1. d4 d5 2. Bf4 Nf6 3. e3",
      "1. d4 d5 2. Bf4 c5 3. e3",
      "1. d4 Nf6 2. Bf4",
      "1. d4 Nf6 2. Nf3 e6 3. Bf4",
      "1. d4 Nf6 2. Nf3 g6 3. Bf4",
      "1. d4 d5 2. Nf3 Nf6 3. Bf4",
      "1. d4 d5 2. Bf4 c5 3. e3 Nc6 4. Nf3",
      "1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3",
    ],
  },
  {
    family: "Sicilian Defense",
    eco: "B20",
    tabiyas: [
      "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6", // Najdorf
      "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6", // Dragon
      "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5", // Sveshnikov
      "1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 a6", // Taimanov/Kan
      "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6", // Accelerated Dragon
      "1. e4 c5 2. Nc3", // Closed
    ],
  },
  {
    family: "Ruy Lopez",
    eco: "C60",
    tabiyas: [
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7", // Closed
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Nxe4", // Open
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6", // Berlin
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6", // Exchange
    ],
  },
  {
    family: "Italian Game",
    eco: "C50",
    tabiyas: [
      "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6", // Giuoco Piano
      "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6", // Two Knights
      "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3", // Giuoco Pianissimo
    ],
  },
  {
    family: "French Defense",
    eco: "C00",
    tabiyas: [
      "1. e4 e6 2. d4 d5 3. Nc3 Bb4", // Winawer
      "1. e4 e6 2. d4 d5 3. Nd2", // Tarrasch
      "1. e4 e6 2. d4 d5 3. e5", // Advance
      "1. e4 e6 2. d4 d5 3. Nc3 Nf6", // Classical
    ],
  },
  {
    family: "Caro-Kann Defense",
    eco: "B10",
    tabiyas: [
      "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4", // Main line
      "1. e4 c6 2. d4 d5 3. e5", // Advance
      "1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4", // Panov
    ],
  },
  {
    family: "Queen's Gambit Declined",
    eco: "D30",
    tabiyas: [
      "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7", // Main
      "1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 c6", // Semi-Slav-ish
      "1. d4 d5 2. c4 e6 3. Nc3 c5", // Tarrasch
    ],
  },
  {
    family: "Queen's Gambit Accepted",
    eco: "D20",
    tabiyas: ["1. d4 d5 2. c4 dxc4 3. Nf3 Nf6 4. e3", "1. d4 d5 2. c4 dxc4 3. e4"],
  },
  {
    family: "Slav Defense",
    eco: "D10",
    tabiyas: [
      "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4", // Main
      "1. d4 d5 2. c4 c6 3. Nc3 Nf6 4. e3", // Quiet
    ],
  },
  {
    family: "Semi-Slav Defense",
    eco: "D43",
    tabiyas: [
      "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. Bg5 dxc4", // Botvinnik
      "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7", // Meran-ish
    ],
  },
  {
    family: "King's Indian Defense",
    eco: "E60",
    tabiyas: [
      "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O", // Classical
      "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f3", // Saemisch
      "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. Nf3 O-O", // Fianchetto-ish
    ],
  },
  {
    family: "Nimzo-Indian Defense",
    eco: "E20",
    tabiyas: [
      "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3", // Rubinstein
      "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Qc2", // Classical
      "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. a3", // Saemisch
    ],
  },
  {
    family: "Queen's Indian Defense",
    eco: "E12",
    tabiyas: ["1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. g3", "1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. a3"],
  },
  {
    family: "Grünfeld Defense",
    eco: "D80",
    tabiyas: [
      "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7", // Exchange
      "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. Nf3 Bg7", // Russian-ish
    ],
  },
  {
    family: "English Opening",
    eco: "A10",
    tabiyas: [
      "1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6", // Four Knights
      "1. c4 c5 2. Nf3 Nf6 3. Nc3", // Symmetrical
      "1. c4 Nf6 2. Nc3 e6 3. Nf3", // Anglo-Indian
    ],
  },
  {
    family: "Catalan Opening",
    eco: "E00",
    tabiyas: [
      "1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O dxc4", // Open
      "1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O Nbd7", // Closed
    ],
  },
  {
    family: "Scotch Game",
    eco: "C45",
    tabiyas: [
      "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6", // Schmidt
      "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5", // Classical
    ],
  },
  {
    family: "Vienna Game",
    eco: "C25",
    tabiyas: ["1. e4 e5 2. Nc3 Nf6 3. f4", "1. e4 e5 2. Nc3 Nc6 3. g3"],
  },
  {
    family: "Scandinavian Defense",
    eco: "B01",
    tabiyas: [
      "1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5", // Main
      "1. e4 d5 2. exd5 Nf6", // Modern
    ],
  },
  {
    family: "Pirc Defense",
    eco: "B07",
    tabiyas: ["1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg7", "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. f4"],
  },
  {
    family: "Dutch Defense",
    eco: "A80",
    tabiyas: [
      "1. d4 f5 2. g3 Nf6 3. Bg2 e6", // Classical/Stonewall approach
      "1. d4 f5 2. c4 Nf6 3. g3 g6", // Leningrad
    ],
  },
  {
    family: "Alekhine Defense",
    eco: "B02",
    tabiyas: ["1. e4 Nf6 2. e5 Nd5 3. d4 d6 4. Nf3", "1. e4 Nf6 2. e5 Nd5 3. d4 d6 4. c4 Nb6 5. f4"],
  },
  {
    family: "Trompowsky Attack",
    eco: "A45",
    tabiyas: ["1. d4 Nf6 2. Bg5 Ne4", "1. d4 Nf6 2. Bg5 e6", "1. d4 Nf6 2. Bg5 c5"],
  },
  {
    family: "Torre Attack",
    eco: "A46",
    tabiyas: ["1. d4 Nf6 2. Nf3 e6 3. Bg5", "1. d4 Nf6 2. Nf3 g6 3. Bg5"],
  },
  {
    family: "Colle System",
    eco: "D04",
    tabiyas: ["1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3", "1. d4 Nf6 2. Nf3 e6 3. e3 c5 4. Bd3"],
  },
  {
    family: "Bird Opening",
    eco: "A02",
    tabiyas: ["1. f4 d5 2. Nf3 Nf6 3. e3", "1. f4 d5 2. Nf3 g6 3. g3"],
  },
  {
    family: "Bogo-Indian Defense",
    eco: "E11",
    tabiyas: ["1. d4 Nf6 2. c4 e6 3. Nf3 Bb4+ 4. Bd2", "1. d4 Nf6 2. c4 e6 3. Nf3 Bb4+ 4. Nbd2"],
  },
];
