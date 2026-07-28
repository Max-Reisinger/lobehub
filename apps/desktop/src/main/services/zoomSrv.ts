import type { WebContents } from 'electron';

import { createLogger } from '@/utils/logger';

import { ServiceModule } from './index';

export const ZOOM_FACTOR_MIN = 0.6;
export const ZOOM_FACTOR_MAX = 1.7;

export type ZoomAction = 'in' | 'out' | 'reset';

const ELECTRON_ZOOM_BASE = 1.2;
const ZOOM_FACTOR_STEP = 0.1;

const logger = createLogger('services:ZoomService');

const roundZoomFactor = (factor: number) => Number(factor.toFixed(1));

export default class ZoomService extends ServiceModule {
  apply(action: ZoomAction, webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    const current = webContents.getZoomFactor();
    const next =
      action === 'reset'
        ? 1
        : Math.min(
            ZOOM_FACTOR_MAX,
            Math.max(
              ZOOM_FACTOR_MIN,
              roundZoomFactor(current + (action === 'in' ? ZOOM_FACTOR_STEP : -ZOOM_FACTOR_STEP)),
            ),
          );

    if (next !== current) {
      webContents.setZoomFactor(next);
      logger.debug(`Zoom ${action}: factor ${current} -> ${next}`);
    }

    this.broadcast(webContents, next);
  }

  private broadcast(webContents: WebContents, factor: number): void {
    const level = Number((Math.log(factor) / Math.log(ELECTRON_ZOOM_BASE)).toFixed(4));

    try {
      webContents.send('zoom:changed', { factor, level });
    } catch (error) {
      logger.warn('Failed to broadcast zoom:changed', error);
    }
  }
}
