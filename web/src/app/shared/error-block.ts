import { Component, effect, ElementRef, inject, input, OnDestroy, output, signal, viewChild } from '@angular/core';

/**
 * One block for "this section did not load": what failed in words and one manual retry. Never retries by itself (a retry storm made the
 * D1 overload worse). While the retry runs the button is disabled; if it fails again the block says so and asks for a minute.
 * `again` lets a host that rebuilds the block during the retry say the same thing.
 */
@Component({
  selector: 'app-error-block',
  template: `<div class="err-box" [attr.role]="role()"><span>{{ (again() || tried()) && !loading() ? 'Sigue sin cargar. Inténtalo en un minuto.' : message() }}</span>&ngsp;<button #btn class="btn btn-p" type="button" [disabled]="loading()" (click)="go()">{{ loading() ? 'Cargando…' : 'Reintentar' }}</button></div>`,
})
export class ErrorBlock implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly btn = viewChild.required<ElementRef<HTMLButtonElement>>('btn');
  private asked = false; // the person pressed the button: focus is theirs to be given back
  private heading: HTMLElement | null = null;
  readonly message = input.required<string>();
  readonly loading = input(false);
  readonly again = input(false);
  /** `alert` for a page-level failure; `status` for a block among others, so several failing together do not cut each other off. */
  readonly role = input<'alert' | 'status'>('alert');
  readonly retry = output<void>();
  protected readonly tried = signal(false);
  protected go(): void { this.asked = true; this.heading = this.host.closest('.card, section')?.querySelector<HTMLElement>('h1, h2') ?? null; this.tried.set(true); this.retry.emit(); }

  constructor() {
    // a disabled button drops focus: when the retry ends and the block stays, it comes back to the button
    let was = false;
    effect(() => { const l = this.loading(); if (was && !l && this.asked) queueMicrotask(() => this.btn()?.nativeElement.focus()); was = l; });
  }

  // the retry worked and the block leaves: focus goes to the heading of the card that loaded, not to the top of the page
  ngOnDestroy(): void {
    if (!this.asked || !this.heading) return;
    this.heading.tabIndex = -1;
    this.heading.focus({ preventScroll: true });
  }
}
