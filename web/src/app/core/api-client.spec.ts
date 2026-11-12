import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClient } from './api-client';

// The stats GETs may be kept by the browser for 30 s; after a sync the app bumps meridian.dataVersion so the next reads miss that cache.
describe('ApiClient data version', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => localStorage.clear()); // the key must not leak into other specs
  const http = () => TestBed.inject(HttpTestingController);

  it('shouldAddNothingWhenThereIsNoDataVersion', () => {
    TestBed.inject(ApiClient).get('/api/stats/bundle').subscribe();
    expect(http().expectOne((r) => r.url === '/api/stats/bundle').request.params.has('v')).toBe(false);
  });

  it('shouldAddTheDataVersionToReadsKeepingTheOtherParams', () => {
    localStorage.setItem('meridian.dataVersion', '1234');
    TestBed.inject(ApiClient).get('/api/matches', { limit: 10 }).subscribe();
    const p = http().expectOne((r) => r.url === '/api/matches').request.params;
    expect([p.get('v'), p.get('limit')]).toEqual(['1234', '10']);
  });

  it('shouldNotTouchWrites', () => {
    localStorage.setItem('meridian.dataVersion', '1234');
    TestBed.inject(ApiClient).post('/api/me/sync').subscribe();
    expect(http().expectOne({ method: 'POST', url: '/api/me/sync' }).request.params.has('v')).toBe(false);
  });
});
