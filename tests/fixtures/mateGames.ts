// Complete games (coordinate moves) ending in checkmate, found by random playouts and checked by replaying them. Long on purpose: they are real games.
const g = (s: string) => s.split(" ");

export const FOOLS = g("f2f3 e7e5 g2g4 d8h4");
export const SCHOLARS = g("e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7");
export const SMOTHERED = g("e2e4 e7e5 g1f3 b8c6 f1c4 c6d4 f3e5 d8g5 e5f7 g5g2 h1f1 g2e4 c4e2 d4f3"); // Blackburne Shilling gambit, Nf3#
export const QUEEN = g("g2g4 c7c6 b2b3 e7e5 c2c3 b7b6 f2f4 d8h4");
export const BISHOP = g("f2f3 h7h5 a2a3 e7e6 f3f4 e6e5 g2g4 f8e7 f4f5 e7h4");
export const BACK_RANK = g("b1c3 b8c6 h2h4 d7d5 h1h3 h7h6 d2d4 f7f5 a1b1 c6e5 c3e4 e8d7 c2c4 f5e4 h3a3 e5g4 c4c5 g8f6 a3a4 a8b8 g1h3 f6h5 d1c2 d8e8 a4a3 e8f7 h3g1 g4e5 a3a7 f7e6 a2a4 g7g6 g2g4 e6b6 g1h3 b6b4 c2d2 b4a3 d2d1 a3b2 c1g5 e4e3 g5e7 b2a2 d1d2 e5c4 c5c6 d7e6 d2b4 h5f4 h3f4 e6f7 a4a5 c8d7 b4d6 a2b1");
// Contains the promotion f2e1r; ends with Rxf3#.
export const ROOK = g("h2h4 g7g5 d2d4 g5h4 g2g3 h4g3 b1c3 g8f6 c3b1 g3f2 e1d2 e7e6 f1g2 h7h6 c2c3 f8d6 e2e4 d6a3 d2e2 e8f8 d1e1 f2e1r e2f2 e1f1 f2e3 f1d1 b2b3 d7d5 g1e2 a3c1 e3f3 f6d7 h1h2 f7f6 b1a3 f8f7 a3b1 d1f1 f3g4 h8h7 b1d2 a7a6 g2h1 d8h8 h1f3 h7g7 g4f4 d7e5 h2h6 c7c6 a1b1 g7g5 b1a1 f1f3");
export const PAWN = g("b2b4 b8a6 c1a3 g8f6 f2f4 d7d5 e2e3 f6h5 d1e2 f7f5 h2h3 h5f6 e1d1 a6b4 c2c3 b4d3 g1f3 f6h5 f3h2 d3b2 d1c2 a8b8 a3b2 d8d7 d2d3 e8f7 c2b3 h8g8 e2f3 h5g3 h1g1 g7g6 f3e4 e7e5 e4b4 d5d4 b3c4 d7e6 c4b5 d4c3 g1h1 e6a2 d3d4 g3f1 b4a3 f1h2 e3e4 f8e7 a3a5 e7d8 b2c1 a2d2 a5a4 d8e7 b1d2 e5f4 h3h4 b8a8 d2b1 f7e6 a4a5 f4f3 a5a3 e6f6 h1d1 h7h5 a3c5 f3f2 c1g5 f6g7 e4e5 f5f4 d4d5 e7f8 b5a5 a7a6 c5b5 c8d7 b1d2 d7h3 b5d7 h3d7 a1c1 b7b6");
export const STALEMATE = g("e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6");
