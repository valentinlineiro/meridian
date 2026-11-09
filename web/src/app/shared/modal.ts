import { afterNextRender, Component, ElementRef, inject, Injector, input, OnDestroy, output } from '@angular/core';

const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea';

/**
 * The one modal shell: backdrop, dialog semantics, Escape / backdrop click to dismiss, Tab trapped inside, focus goes to
 * `initialFocus` on open and back to whoever had it on close. Parents render it inside an `@if`, so it only exists while open.
 */
@Component({
  selector: 'app-modal',
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -- Escape is handled on the document -->
    <div class="modal" style="display:flex" role="dialog" aria-modal="true" [attr.id]="modalId()" [attr.aria-labelledby]="labelledby()"
         (click)="$event.target === $event.currentTarget && dismissed.emit()">
      <div [class]="'card gamecard ' + cardClass()"><ng-content /></div>
    </div>
  `,
})
export class Modal implements OnDestroy {
  readonly modalId = input<string>();
  readonly labelledby = input.required<string>();
  readonly initialFocus = input.required<string>();
  readonly cardClass = input('');
  readonly dismissed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly opener = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => this.host.querySelector<HTMLElement>(this.initialFocus())?.focus(), { injector: inject(Injector) });
  }

  ngOnDestroy(): void { this.opener?.focus?.(); }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.dismissed.emit();
    else if (e.key === 'Tab') {
      const f = [...this.host.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1)].focus();
    }
  }
}
