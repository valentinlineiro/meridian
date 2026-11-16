import { Component, input, output, signal } from '@angular/core';

/**
 * One block for "this section did not load": what failed in words and one manual retry. Never retries by itself (a retry storm made the
 * D1 overload worse). While the retry runs the button is disabled; if it fails again the block says so and asks for a minute.
 * `again` lets a host that rebuilds the block during the retry say the same thing.
 */
@Component({
  selector: 'app-error-block',
  template: `<div class="err-box" role="alert"><span>{{ (again() || tried()) && !loading() ? 'Sigue sin cargar. Inténtalo en un minuto.' : message() }}</span>&ngsp;<button class="btn btn-p" type="button" [disabled]="loading()" (click)="go()">{{ loading() ? 'Cargando…' : 'Reintentar' }}</button></div>`,
})
export class ErrorBlock {
  readonly message = input.required<string>();
  readonly loading = input(false);
  readonly again = input(false);
  readonly retry = output<void>();
  protected readonly tried = signal(false);
  protected go(): void { this.tried.set(true); this.retry.emit(); }
}
