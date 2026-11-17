import { Component, computed, input } from '@angular/core';

const GLYPH: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

const NAMES: Record<string, [string, string]> = { k: ['rey', 'reyes'], q: ['dama', 'damas'], r: ['torre', 'torres'], b: ['alfil', 'alfiles'], n: ['caballo', 'caballos'], p: ['peón', 'peones'] };
const list = (xs: string[]) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];

/** The pieces of a FEN in words ("Blancas: rey g1, dama d1, torres a1 y f1 …"); a position it cannot read is described as empty. */
function describe(fen: string, caption: string): string {
  const head = 'Posición' + (caption ? ' ' + caption : '');
  const rows = (typeof fen === 'string' ? fen : '').split(' ')[0].split('/');
  if (rows.length !== 8) return head + '.';
  const by: Record<'w' | 'b', Record<string, string[]>> = { w: {}, b: {} };
  rows.forEach((row, y) => { let x = 0; for (const ch of row) { if (/\d/.test(ch)) { x += +ch; continue; } const side = ch === ch.toUpperCase() ? 'w' : 'b'; (by[side][ch.toLowerCase()] ??= []).push('abcdefgh'[x] + (8 - y)); x++; } });
  const side = (c: 'w' | 'b') => Object.keys(NAMES).filter((k) => by[c][k]).map((k) => `${NAMES[k][by[c][k].length > 1 ? 1 : 0]} ${list(by[c][k])}`).join(', ');
  return `${head}. Blancas: ${side('w') || 'ninguna'}. Negras: ${side('b') || 'ninguna'}.`;
}

/** Port of boardHtml (src/dashboard.client.js:1399): the position of a FEN, seen from the owner's side when flipped. */
@Component({
  selector: 'm-chess-board',
  host: { class: 'board', role: 'img', '[attr.aria-label]': 'label()' },
  template: `@for (s of squares(); track $index) {<i class="sq" aria-hidden="true" [class.dk]="s.dk" [class.lt]="!s.dk">{{ s.g }}</i>}`,
})
export class ChessBoard {
  readonly fen = input.required<string>();
  readonly flip = input(false);
  /** What follows "Posición" in the description: "inicial", or "tras la jugada 12, Cxd4". */
  readonly caption = input('');
  /** One sentence for assistive technology: where each piece stands, by colour and kind. */
  protected readonly label = computed(() => describe(this.fen(), this.caption()));
  protected readonly squares = computed(() => {
    // a position it cannot read is an empty board, never a thrown template
    const fen = this.fen();
    const rows = (typeof fen === 'string' ? fen : '8/8/8/8/8/8/8/8').split(' ')[0].split('/').map((r) => [...r].flatMap((ch) => /\d/.test(ch) ? Array<string>(+ch).fill('') : [GLYPH[ch] || '']));
    if (this.flip()) { rows.reverse(); rows.forEach((r) => r.reverse()); }
    return rows.flatMap((r, y) => r.map((g, x) => ({ g, dk: (x + y) % 2 === 1 })));
  });
}
