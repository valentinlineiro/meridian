import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const GLYPH: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

/** Port of boardHtml (src/dashboard.client.js:1399): the position of a FEN, seen from the owner's side when flipped. */
@Component({
  selector: 'm-chess-board',
  host: { class: 'board' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (s of squares(); track $index) {<i class="sq" [class.dk]="s.dk" [class.lt]="!s.dk">{{ s.g }}</i>}`,
})
export class ChessBoard {
  readonly fen = input.required<string>();
  readonly flip = input(false);
  protected readonly squares = computed(() => {
    const rows = this.fen().split(' ')[0].split('/').map((r) => [...r].flatMap((ch) => /\d/.test(ch) ? Array<string>(+ch).fill('') : [GLYPH[ch] || '']));
    if (this.flip()) { rows.reverse(); rows.forEach((r) => r.reverse()); }
    return rows.flatMap((r, y) => r.map((g, x) => ({ g, dk: (x + y) % 2 === 1 })));
  });
}
