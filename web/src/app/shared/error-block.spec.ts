import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ErrorBlock } from './error-block';

@Component({ imports: [ErrorBlock], template: `<app-error-block message="No pudimos cargar tus juegos." [loading]="loading()" (retry)="retries = retries + 1" />` })
class Host { loading = signal(false); retries = 0; }

describe('ErrorBlock', () => {
  const make = () => { const f = TestBed.createComponent(Host); f.detectChanges(); return f; };
  const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelector('.err-box')!.textContent!.trim();
  const button = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelector('button')!;

  it('shouldSayWhatFailedAndOfferOneRetry', () => {
    const f = make();
    expect(text(f)).toBe('No pudimos cargar tus juegos. Reintentar');
    expect(f.nativeElement.querySelector('[role=alert]')).not.toBeNull();
  });

  it('shouldDisableTheButtonAndSayCargandoWhileTheRetryRuns', () => {
    const f = make();
    button(f).click();
    expect(f.componentInstance.retries).toBe(1);
    f.componentInstance.loading.set(true); f.detectChanges();
    expect(button(f).disabled).toBe(true);
    expect(button(f).textContent).toBe('Cargando…');
  });

  it('shouldAskForAMinuteWhenTheRetryFailedAgain', () => {
    const f = make();
    button(f).click();
    f.componentInstance.loading.set(true); f.detectChanges();
    f.componentInstance.loading.set(false); f.detectChanges();
    expect(text(f)).toContain('Sigue sin cargar. Inténtalo en un minuto.');
    expect(button(f).disabled).toBe(false);
  });
});
