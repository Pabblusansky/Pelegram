import { TestBed } from '@angular/core/testing';
import { ScrollStabilizerService, CONTENT_WRAPPER_SELECTOR } from './scroll-stabilizer.service';

describe('ScrollStabilizerService', () => {
  let service: ScrollStabilizerService;
  let viewport: HTMLElement;
  let wrapper: HTMLElement;

  const QUIET = 30;
  const TIMEOUT = 300;
  const opts = { quietMs: QUIET, timeoutMs: TIMEOUT };

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  const addRow = () => {
    const row = document.createElement('div');
    row.style.height = '100px';
    wrapper.appendChild(row);
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ScrollStabilizerService] });
    service = TestBed.inject(ScrollStabilizerService);

    viewport = document.createElement('div');
    viewport.style.height = '200px';
    viewport.style.overflowY = 'scroll';

    wrapper = document.createElement('div');
    wrapper.className = CONTENT_WRAPPER_SELECTOR.replace('.', '');
    viewport.appendChild(wrapper);
    document.body.appendChild(viewport);

    for (let i = 0; i < 10; i++) addRow();
  });

  afterEach(() => {
    service.cancel();
    viewport.remove();
  });

  it('completes and snaps to the bottom when nothing mutates', async () => {
    let done = false;
    viewport.scrollTop = 0;

    service.stabilize(viewport, () => { done = true; }, opts);
    await wait(QUIET + 40);

    expect(done).toBe(true);
    expect(viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight);
  });

  it('completes immediately when there is no element', async () => {
    let done = false;
    service.stabilize(null, () => { done = true; }, opts);
    expect(done).toBe(true);
  });

  it('completes immediately when the content wrapper is missing', () => {
    const bare = document.createElement('div');
    let done = false;

    service.stabilize(bare, () => { done = true; }, opts);
    expect(done).toBe(true);
  });

  it('waits for mutations to go quiet before completing', async () => {
    let done = false;
    service.stabilize(viewport, () => { done = true; }, opts);

    for (let i = 0; i < 3; i++) {
      addRow();
      await wait(QUIET / 2);
      expect(done).toBe(false);
    }

    await wait(QUIET + 40);
    expect(done).toBe(true);
  });

  it('gives up after the hard timeout even if mutations never stop', async () => {
    let done = false;
    service.stabilize(viewport, () => { done = true; }, opts);

    const churn = setInterval(addRow, QUIET / 3);
    await wait(TIMEOUT + 120);
    clearInterval(churn);

    expect(done).toBe(true);
  });

  it('only completes once', async () => {
    let calls = 0;
    service.stabilize(viewport, () => { calls++; }, opts);

    addRow();
    await wait(TIMEOUT + 150);

    expect(calls).toBe(1);
  });

  it('cancels a pending run so its callback never fires', async () => {
    let done = false;
    service.stabilize(viewport, () => { done = true; }, opts);

    service.cancel();
    await wait(TIMEOUT + 100);

    expect(done).toBe(false);
  });

  it('supersedes a previous run when stabilize is called again', async () => {
    let first = 0;
    let second = 0;

    service.stabilize(viewport, () => { first++; }, opts);
    service.stabilize(viewport, () => { second++; }, opts);

    await wait(TIMEOUT + 150);

    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it('stops observing after completion, so later mutations do not re-fire it', async () => {
    let calls = 0;
    service.stabilize(viewport, () => { calls++; }, opts);
    await wait(QUIET + 40);
    expect(calls).toBe(1);

    addRow();
    await wait(QUIET + 60);
    expect(calls).toBe(1);
  });

  it('releases the pending run on destroy', async () => {
    let done = false;
    service.stabilize(viewport, () => { done = true; }, opts);

    service.ngOnDestroy();
    await wait(TIMEOUT + 100);

    expect(done).toBe(false);
  });
});
