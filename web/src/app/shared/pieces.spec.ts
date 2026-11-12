import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Help } from './help';
import { Section } from './section';
import { Segmented } from './segmented';
import { Stats } from './stats';
import { VerdictPill } from './verdict';
import { verdictFor } from '../core/words';

@Component({
  imports: [Segmented, Section, Help, Stats, VerdictPill],
  template: `
    <app-segmented groupId="seg" label="Periodo" caption="Periodo" idPrefix="p-" [options]="opts" [value]="v()" (picked)="v.set($event)" />
    <app-section title="Comparativa" sectionId="cg-x"><p id="inside">dentro</p></app-section>
    <app-section title="Cerrada" [open]="false" sectionId="cg-y"><p>x</p></app-section>
    <app-help helpId="hp"><span id="formula">×2,04</span></app-help>
    <app-stats [items]="items" />
    <app-verdict [verdict]="verdict" />
  `,
})
class Host {
  opts = [{ k: 'a', l: 'Uno' }, { k: 'b', l: 'Dos' }];
  v = signal('a');
  items = [{ l: 'Tiempo normal', v: '0:52', s: 'suele estar entre 0:47 y 1:00' }, { l: 'Mejor marca', v: '0:33' }];
  verdict = verdictFor({ label: 'deterioro', pending: null });
}

describe('shared pieces', () => {
  let el: HTMLElement;
  let host: Host;
  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  beforeEach(async () => {
    const f = TestBed.createComponent(Host);
    host = f.componentInstance;
    el = f.nativeElement;
    await tick();
  });

  it('shouldMarkOnlyTheChosenButtonAsPressedAndReportAPick', async () => {
    const [a, b] = [...el.querySelectorAll<HTMLButtonElement>('#seg button')];
    expect([a!.getAttribute('aria-pressed'), b!.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    expect([a!.id, b!.id]).toEqual(['p-a', 'p-b']);
    b!.click(); await tick();
    expect(host.v()).toBe('b');
    expect(el.querySelector('#seg')!.getAttribute('aria-label')).toBe('Periodo');
    expect(el.querySelector('#seg .muted')!.textContent).toBe('Periodo');
  });

  it('shouldFoldASectionAndKeepItsContentInTheDocument', () => {
    expect(el.querySelector<HTMLDetailsElement>('#cg-x')!.open).toBe(true);
    expect(el.querySelector<HTMLDetailsElement>('#cg-y')!.open).toBe(false);
    expect(el.querySelector('#cg-x summary')!.textContent).toBe('Comparativa');
    expect(el.querySelector('#cg-x #inside')!.textContent).toBe('dentro');
  });

  it('shouldHideTheFormulaBehindComoSeCalculaWithoutRemovingIt', () => {
    expect(el.querySelector('#hp summary')!.textContent).toBe('Cómo se calcula');
    expect(el.querySelector<HTMLDetailsElement>('#hp')!.open).toBe(false);
    expect(el.querySelector('#hp #formula')!.textContent).toBe('×2,04');
  });

  it('shouldListEachFactWithItsNoteOnlyWhenItHasOne', () => {
    const rows = [...el.querySelectorAll('.stats > div')].map((d) => [...d.children].map((c) => c.textContent));
    expect(rows).toEqual([['Tiempo normal', '0:52', 'suele estar entre 0:47 y 1:00'], ['Mejor marca', '0:33']]);
  });

  it('shouldGiveEveryVerdictStateAGlyphAndNeverRelyOnColourAlone', async () => {
    const glyph = async (label: string) => { const f = TestBed.createComponent(VerdictPill); f.componentRef.setInput('verdict', verdictFor({ label, pending: null })); await f.whenStable(); return f.nativeElement.textContent.trim(); };
    expect([await glyph('mejora_sostenida'), await glyph('deterioro'), await glyph('estable'), await glyph('otro')]).toEqual(['▲ Mejorando', '▼ Bajando', '▬ Estable', '○ Pocos datos']);
  });

  it('shouldColourTheVerdictPillFromTheVerdict', () => {
    const pill = el.querySelector('app-verdict span')!;
    expect(pill.className).toBe('pill pill-warn');
    expect(pill.textContent).toBe('▼ Bajando');
  });
});
