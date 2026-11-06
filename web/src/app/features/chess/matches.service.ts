import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ApiClient } from '../../core/api-client';

export interface MatchRow {
  match_id?: string | null; ply_count?: number | null; played_at?: number | null; first_seen_at?: string | null;
  opponent_name?: string | null; opponent_type?: string | null; opponent_segment?: string | null; opponent_elo?: number | null;
  user_color?: string | null; result?: string | null; outcome?: string | null; end_condition?: string | null; mate_type_label?: string | null;
  opening_family?: string | null; opening_family_label?: string | null; phase_key?: string | null; reviewed?: number | boolean | null;
}
interface MatchPage { rows?: MatchRow[]; total?: number }

/** What the owner chose. `opp` is the rival select ("bot" or "seg:<segment>"); min/max/q are applied with the next load. */
export interface MatchFilters { type: string; result: string; color: string; opp: string; end: string; phase: string; opening: string; q: string; min: string; max: string }
export type FilterGroup = keyof MatchFilters;
const NONE: MatchFilters = { type: '', result: '', color: '', opp: '', end: '', phase: '', opening: '', q: '', min: '', max: '' };
type Params = Record<string, string | number>;

/**
 * Port of the matches list state (src/dashboard.client.js:1179–1196, 1366–1395, 1626–1663): one per Chess view.
 * Every load replaces the request; the resource cancels the one before, so a late page never overwrites a later choice.
 */
@Injectable()
export class MatchesService {
  private readonly api = inject(ApiClient);

  readonly compact = signal(true);
  readonly missedOnly = signal(false);
  readonly filters = signal<MatchFilters>(NONE);
  readonly offset = signal(0);
  /** The game the viewer shows (null = closed). */
  readonly openId = signal<string | null>(null);
  readonly pageSize = computed(() => this.compact() ? 10 : 50);

  private readonly request = signal<Params>({ limit: 10, offset: 0 });
  private readonly page_ = rxResource<MatchPage, Params>({ params: () => this.request(), stream: ({ params }) => this.api.get<MatchPage>('/api/matches', params) });
  private readonly body = computed(() => this.page_.hasValue() ? this.page_.value() : null);
  readonly rows = computed<MatchRow[]>(() => { const r = this.body()?.rows; return Array.isArray(r) ? r : []; });
  readonly total = computed(() => this.body()?.total || 0);
  readonly loaded = computed(() => this.page_.status() === 'resolved');
  readonly failed = computed(() => this.page_.status() === 'error');

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  /** A chip or a select: filter and go back to the first page. The type chip replaces the rival select. */
  setFilter(group: FilterGroup, value: string): void {
    this.filters.update((f) => ({ ...f, ...(group === 'type' ? { opp: '' } : {}), [group]: value }));
    this.load(0);
  }

  /** A typed value that waits for the next load (the ELO bounds). */
  setDraft(group: FilterGroup, value: string): void {
    this.filters.update((f) => ({ ...f, [group]: value }));
  }

  onSearch(value: string): void {
    this.setDraft('q', value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(0), 300);
  }

  apply(): void { this.load(0); }

  page(delta: number): void { this.load(this.offset() + delta * this.pageSize()); }

  showAll(): void {
    this.compact.set(false);
    this.load(0);
  }

  toggleMissed(): void {
    this.missedOnly.update((m) => !m);
    if (this.compact()) this.showAll(); else this.load(0);
  }

  clear(): void {
    this.missedOnly.set(false);
    this.filters.set(NONE);
    this.load(0);
  }

  open(id: string): void { this.openId.set(id); }

  private load(offset: number): void {
    clearTimeout(this.searchTimer);
    const f = this.filters();
    this.offset.set(Math.max(0, offset));
    const p: Params = { limit: this.pageSize(), offset: this.offset() };
    if (f.q.trim()) p['q'] = f.q.trim();
    if (this.missedOnly()) p['missedThreat'] = '1';
    if (f.opp) { if (f.opp.startsWith('seg:')) p['opponentSegment'] = f.opp.slice(4); else p['opponentType'] = f.opp; }
    else if (f.type) p['opponentType'] = f.type;
    if (f.result) p['result'] = f.result;
    if (f.color) p['color'] = f.color;
    if (f.min) p['minOpponentElo'] = f.min;
    if (f.max) p['maxOpponentElo'] = f.max;
    if (f.end) p['endCondition'] = f.end;
    if (f.phase) p['phase'] = f.phase;
    if (f.opening) p['opening'] = f.opening;
    this.request.set(p);
  }
}
