import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    <button id="opener" (click)="open.set(true)">open</button>
    @if (open()) {
      <app-modal modalId="m" labelledby="t" initialFocus="#b" (dismissed)="open.set(false)">
        <b id="t">Title</b>
        @if (withButtons()) { <button id="a">a</button><button id="b">b</button><button id="x" disabled>x</button><a href="#" tabindex="-1" id="skip">skip</a> }
      </app-modal>
    }
  `,
})
class Host { open = signal(false); withButtons = signal(true); }

describe('Modal', () => {
  let el: HTMLElement;
  let host: Host;
  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); };
  const key = (k: string, shiftKey = false) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, cancelable: true, bubbles: true })); return tick(); };
  const active = () => document.activeElement?.id;
  const openIt = async () => { el.querySelector<HTMLElement>('#opener')!.focus(); el.querySelector<HTMLElement>('#opener')!.click(); await tick(); };

  beforeEach(async () => {
    const f = TestBed.createComponent(Host);
    host = f.componentInstance;
    el = f.nativeElement;
    document.body.append(el);
    await tick();
  });
  afterEach(() => el.remove());

  it('shouldFocusInitialElementWhenOpened', async () => {
    await openIt();
    expect(active()).toBe('b');
  });

  it('shouldCloseAndRestoreFocusWhenEscapePressed', async () => {
    await openIt();
    await key('Escape');
    expect(el.querySelector('#m')).toBeNull();
    expect(active()).toBe('opener');
  });

  it('shouldCloseWhenBackdropClickedButNotWhenCardClicked', async () => {
    await openIt();
    el.querySelector<HTMLElement>('.gamecard')!.click(); await tick();
    expect(el.querySelector('#m')).not.toBeNull();
    el.querySelector<HTMLElement>('#m')!.click(); await tick();
    expect(el.querySelector('#m')).toBeNull();
  });

  it('shouldWrapTabAndShiftTabWithinFocusableElementsOnly', async () => {
    await openIt(); // focus on b, the last focusable (x is disabled, skip has tabindex -1)
    await key('Tab');
    expect(active()).toBe('a');
    await key('Tab', true);
    expect(active()).toBe('b');
  });

  it('shouldKeepFocusInsideWhenNothingIsFocusable', async () => {
    host.withButtons.set(false);
    await openIt();
    const e = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
