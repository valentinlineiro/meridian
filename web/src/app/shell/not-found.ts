import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** What an unknown address shows: it says so (the address is kept) and offers the way home, instead of silently landing on Hoy. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `<section class="card" id="notFound"><h1>Página no encontrada</h1><p class="muted">La dirección no corresponde a ninguna sección de Meridian.</p><a class="btn btn-p" routerLink="/overview">Ir a Hoy</a></section>`,
})
export class NotFound {}
