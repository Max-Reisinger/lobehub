import type { WebContents } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App } from '@/core/App';

import ZoomService, { ZOOM_FACTOR_MAX, ZOOM_FACTOR_MIN } from '../zoomSrv';

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

interface MockWebContents {
  destroyed: boolean;
  factor: number;
  getZoomFactor: () => number;
  isDestroyed: () => boolean;
  send: ReturnType<typeof vi.fn>;
  setZoomFactor: (factor: number) => void;
}

const createMockWebContents = (initialFactor = 1): MockWebContents => {
  const webContents: MockWebContents = {
    destroyed: false,
    factor: initialFactor,
    getZoomFactor: () => webContents.factor,
    isDestroyed: () => webContents.destroyed,
    send: vi.fn(),
    setZoomFactor: (factor: number) => {
      webContents.factor = factor;
    },
  };

  return webContents;
};

const getExpectedPayload = (factor: number) => ({
  factor,
  level: Number((Math.log(factor) / Math.log(1.2)).toFixed(4)),
});

describe('ZoomService', () => {
  let service: ZoomService;

  beforeEach(() => {
    service = new ZoomService({} as App);
  });

  it('increases zoom factor by 10 percentage points on action=in', () => {
    const webContents = createMockWebContents(1);

    service.apply('in', webContents as unknown as WebContents);

    expect(webContents.factor).toBe(1.1);
    expect(webContents.send).toHaveBeenCalledWith('zoom:changed', getExpectedPayload(1.1));
  });

  it('decreases zoom factor by 10 percentage points on action=out', () => {
    const webContents = createMockWebContents(1);

    service.apply('out', webContents as unknown as WebContents);

    expect(webContents.factor).toBe(0.9);
    expect(webContents.send).toHaveBeenCalledWith('zoom:changed', getExpectedPayload(0.9));
  });

  it('resets zoom factor to 1 on action=reset', () => {
    const webContents = createMockWebContents(1.3);

    service.apply('reset', webContents as unknown as WebContents);

    expect(webContents.factor).toBe(1);
    expect(webContents.send).toHaveBeenCalledWith('zoom:changed', getExpectedPayload(1));
  });

  it('rounds the zoom factor to avoid floating-point drift', () => {
    const webContents = createMockWebContents(1.1);

    service.apply('in', webContents as unknown as WebContents);

    expect(webContents.factor).toBe(1.2);
    expect(webContents.send).toHaveBeenCalledWith('zoom:changed', getExpectedPayload(1.2));
  });

  it('clamps at ZOOM_FACTOR_MAX and still broadcasts the current factor', () => {
    const webContents = createMockWebContents(ZOOM_FACTOR_MAX);

    service.apply('in', webContents as unknown as WebContents);

    expect(webContents.factor).toBe(ZOOM_FACTOR_MAX);
    expect(webContents.send).toHaveBeenCalledWith(
      'zoom:changed',
      getExpectedPayload(ZOOM_FACTOR_MAX),
    );
  });

  it('clamps at ZOOM_FACTOR_MIN and still broadcasts the current factor', () => {
    const webContents = createMockWebContents(ZOOM_FACTOR_MIN);

    service.apply('out', webContents as unknown as WebContents);

    expect(webContents.factor).toBe(ZOOM_FACTOR_MIN);
    expect(webContents.send).toHaveBeenCalledWith(
      'zoom:changed',
      getExpectedPayload(ZOOM_FACTOR_MIN),
    );
  });

  it('skips when webContents is destroyed', () => {
    const webContents = createMockWebContents(1);
    webContents.destroyed = true;

    service.apply('in', webContents as unknown as WebContents);

    expect(webContents.factor).toBe(1);
    expect(webContents.send).not.toHaveBeenCalled();
  });
});
