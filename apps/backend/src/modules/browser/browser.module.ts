import { Module } from '@nestjs/common';
import { BrowserPoolService } from './browser-pool.service';
import { PlaywrightService } from './playwright.service';
import { ScreenshotService } from './screenshot.service';
import { DomSnapshotService } from './dom-snapshot.service';
import { CaptchaDetector } from './captcha.detector';

@Module({
  providers: [BrowserPoolService, PlaywrightService, ScreenshotService, DomSnapshotService, CaptchaDetector],
  exports: [BrowserPoolService, PlaywrightService, ScreenshotService, DomSnapshotService, CaptchaDetector],
})
export class BrowserModule {}