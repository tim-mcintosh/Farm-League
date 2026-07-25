(() => {
  'use strict';

  const CHANGE_EVENT = 'farmleague:directionchange';
  const DIRECTIONS = ['up', 'right', 'down', 'left'];

  class FarmLeagueDPad {
    constructor(element) {
      this.element = element;
      this.activePointerId = null;
      this.direction = null;
      this.directionElements = new Map(
        [...element.querySelectorAll('[data-direction]')]
          .map(indicator => [indicator.dataset.direction, indicator])
          .filter(([direction]) => DIRECTIONS.includes(direction))
      );

      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerEnd = this.onPointerEnd.bind(this);
      this.preventBrowserGesture = this.preventBrowserGesture.bind(this);
      this.reset = this.reset.bind(this);
      this.onVisibilityChange = () => {
        if (document.hidden) this.reset();
      };

      element.addEventListener('pointerdown', this.onPointerDown);
      element.addEventListener('pointermove', this.onPointerMove);
      element.addEventListener('pointerup', this.onPointerEnd);
      element.addEventListener('pointercancel', this.onPointerEnd);
      element.addEventListener('lostpointercapture', this.onPointerEnd);
      element.addEventListener('contextmenu', this.preventBrowserGesture);
      element.addEventListener('dblclick', this.preventBrowserGesture);
      ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend']
        .forEach(type => element.addEventListener(type, this.preventBrowserGesture, { passive: false }));
      window.addEventListener('blur', this.reset);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    preventBrowserGesture(event) {
      if (event.cancelable) event.preventDefault();
    }

    directionAt(clientX, clientY) {
      const bounds = this.element.getBoundingClientRect();
      const x = clientX - (bounds.left + bounds.width / 2);
      const y = clientY - (bounds.top + bounds.height / 2);
      const deadZone = Math.max(18, Math.min(bounds.width, bounds.height) * .13);

      if (Math.hypot(x, y) < deadZone) return null;
      if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
      return y < 0 ? 'up' : 'down';
    }

    setDirection(direction) {
      if (direction === this.direction) return;
      this.direction = direction;
      this.directionElements.forEach((indicator, name) => {
        indicator.classList.toggle('active', name === direction);
      });
      this.element.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
        bubbles: true,
        detail: { direction }
      }));
    }

    onPointerDown(event) {
      if (this.activePointerId !== null) return;
      event.preventDefault();
      this.activePointerId = event.pointerId;
      this.element.setPointerCapture(event.pointerId);
      this.setDirection(this.directionAt(event.clientX, event.clientY));
    }

    onPointerMove(event) {
      if (event.pointerId !== this.activePointerId) return;
      event.preventDefault();
      this.setDirection(this.directionAt(event.clientX, event.clientY));
    }

    onPointerEnd(event) {
      if (event.pointerId !== this.activePointerId) return;
      event.preventDefault();
      this.activePointerId = null;
      this.setDirection(null);
    }

    reset() {
      this.activePointerId = null;
      this.setDirection(null);
    }
  }

  const initialise = root => {
    root.querySelectorAll('[data-farm-dpad]').forEach(element => {
      if (!element.farmLeagueDPad) element.farmLeagueDPad = new FarmLeagueDPad(element);
    });
  };

  window.FarmLeagueDPad = FarmLeagueDPad;
  window.FARM_LEAGUE_DPAD_EVENT = CHANGE_EVENT;
  initialise(document);
})();
