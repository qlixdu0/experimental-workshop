/** immersive-vr oturumunun yaşam döngüsü: destek kontrolü, başlatma, referans alanı fallback'i, temizlik. */
export class XRManager {
  constructor(renderer, { onStart, onEnd, onWarn } = {}) {
    this.renderer = renderer;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onWarn = onWarn || (() => {});
    this.session = null;
    this.supported = false;
    this.unsupportedReason = '';
    this.handsSeen = false;
    this.floorless = false;
    this._timer = 0;
    this._handleEnd = this._handleEnd.bind(this);
  }

  get presenting() { return !!this.session; }

  async init() {
    if (!window.isSecureContext) this.unsupportedReason = 'WebXR için HTTPS gerekir.';
    else if (!navigator.xr) this.unsupportedReason = 'Bu tarayıcıda WebXR yok (Quest 3 Browser kullanın).';
    else {
      try { this.supported = await navigator.xr.isSessionSupported('immersive-vr'); } catch { this.supported = false; }
      if (!this.supported) this.unsupportedReason = 'Bu cihaz immersive-vr oturumunu desteklemiyor.';
    }
    return this.supported;
  }

  async enter() {
    if (!this.supported || this.session) return;
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking', 'local-floor'] });

    // Referans alanı fallback: local-floor yoksa local (göz yüksekliği sonradan eklenir)
    let type = 'local-floor';
    try { await session.requestReferenceSpace('local-floor'); } catch { type = 'local'; }
    this.floorless = type !== 'local-floor';
    this.renderer.xr.setReferenceSpaceType(type);
    this.renderer.xr.setFoveation(1);

    session.addEventListener('end', this._handleEnd);
    try {
      await this.renderer.xr.setSession(session);
    } catch (err) {
      session.removeEventListener('end', this._handleEnd);
      try { await session.end(); } catch { /* zaten kapalı */ }
      throw err;
    }
    this.session = session;
    this.handsSeen = false;

    const enabled = session.enabledFeatures;
    if (Array.isArray(enabled) && !enabled.includes('hand-tracking')) {
      this.onWarn('Bu oturumda el takibi etkinleştirilemedi. Quest: Ayarlar > Hareket ve kontrolcüler > El takibi.');
    } else {
      this._timer = setTimeout(() => {
        if (this.session === session && !this.handsSeen) {
          this.onWarn('El algılanmadı. Kontrolcüleri bırakın ve ellerinizi görüş alanına getirin; El takibi Quest ayarlarından açık olmalı.');
        }
      }, 6000);
    }
    this.onStart?.({ floorless: this.floorless, referenceSpace: type });
  }

  noteHands(count) { if (count > 0) this.handsSeen = true; }

  async exit() { if (this.session) await this.session.end(); }

  _handleEnd() {
    clearTimeout(this._timer);
    const s = this.session;
    this.session = null;
    s?.removeEventListener('end', this._handleEnd);
    this.onEnd?.();
  }
}
