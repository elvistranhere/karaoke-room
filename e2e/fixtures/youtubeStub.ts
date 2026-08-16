export const STUB_DURATION_S = 213;

const TITLE_PREFIX = "Stub Video ";

export function stubVideoTitle(videoId: string): string {
  return `${TITLE_PREFIX}${videoId}`;
}

// Served in place of https://www.youtube.com/iframe_api: the slice of YT.Player that
// useYouTubePlayer and useVideoSync drive, on a wall clock that never rebuffers.
export const YOUTUBE_IFRAME_API_STUB = `
(function () {
  var DURATION = ${STUB_DURATION_S};
  var STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

  var players = [];

  function StubPlayer(element, options) {
    var self = this;
    this.videoId = null;
    this.state = STATE.UNSTARTED;
    this.base = 0;
    this.since = Date.now();
    this.rate = 1;
    this.volume = 100;
    this.muted = false;
    this.events = (options && options.events) || {};
    this.frame = document.createElement("iframe");
    this.frame.setAttribute("title", "stub youtube player");
    this.frame.style.width = "100%";
    this.frame.style.height = "100%";
    var host = typeof element === "string" ? document.getElementById(element) : element;
    if (host) host.appendChild(this.frame);
    players.push(this);
    setTimeout(function () {
      if (self.events.onReady) self.events.onReady({ target: self });
    }, 0);
  }

  StubPlayer.prototype.transition = function (next) {
    var self = this;
    if (this.state === next) return;
    this.base = this.getCurrentTime();
    this.since = Date.now();
    this.state = next;
    setTimeout(function () {
      if (self.events.onStateChange) self.events.onStateChange({ target: self, data: next });
    }, 0);
  };

  StubPlayer.prototype.stage = function (videoId, startSeconds, next) {
    this.videoId = videoId;
    this.base = Math.max(0, Math.min(DURATION, Number(startSeconds) || 0));
    this.since = Date.now();
    this.rate = 1;
    this.state = STATE.UNSTARTED;
    this.transition(next);
  };

  StubPlayer.prototype.loadVideoById = function (videoId, startSeconds) {
    this.stage(videoId, startSeconds, STATE.PLAYING);
  };

  StubPlayer.prototype.cueVideoById = function (videoId, startSeconds) {
    this.stage(videoId, startSeconds, STATE.CUED);
  };

  StubPlayer.prototype.playVideo = function () { this.transition(STATE.PLAYING); };
  StubPlayer.prototype.pauseVideo = function () { this.transition(STATE.PAUSED); };
  StubPlayer.prototype.stopVideo = function () { this.transition(STATE.UNSTARTED); };

  StubPlayer.prototype.seekTo = function (seconds) {
    this.base = Math.max(0, Math.min(DURATION, Number(seconds) || 0));
    this.since = Date.now();
  };

  StubPlayer.prototype.setPlaybackRate = function (rate) {
    this.base = this.getCurrentTime();
    this.since = Date.now();
    this.rate = Number(rate) || 1;
  };

  StubPlayer.prototype.getPlaybackRate = function () { return this.rate; };
  StubPlayer.prototype.getAvailablePlaybackRates = function () { return [0.25, 0.5, 1, 1.5, 2]; };

  StubPlayer.prototype.getCurrentTime = function () {
    if (this.videoId === null) return 0;
    if (this.state !== STATE.PLAYING) return this.base;
    var elapsed = ((Date.now() - this.since) / 1000) * this.rate;
    return Math.max(0, Math.min(DURATION, this.base + elapsed));
  };

  StubPlayer.prototype.getDuration = function () { return this.videoId === null ? 0 : DURATION; };
  StubPlayer.prototype.getPlayerState = function () { return this.state; };
  StubPlayer.prototype.getVideoData = function () {
    return { video_id: this.videoId, title: this.videoId === null ? "" : "${TITLE_PREFIX}" + this.videoId };
  };
  StubPlayer.prototype.getIframe = function () { return this.frame; };
  StubPlayer.prototype.setVolume = function (value) { this.volume = value; };
  StubPlayer.prototype.getVolume = function () { return this.volume; };
  StubPlayer.prototype.mute = function () { this.muted = true; };
  StubPlayer.prototype.unMute = function () { this.muted = false; };
  StubPlayer.prototype.unloadModule = function () {};
  StubPlayer.prototype.loadModule = function () {};
  StubPlayer.prototype.destroy = function () {
    if (this.frame && this.frame.parentNode) this.frame.parentNode.removeChild(this.frame);
    var index = players.indexOf(this);
    if (index !== -1) players.splice(index, 1);
  };

  function current() { return players.length === 0 ? null : players[players.length - 1]; }

  window.__ytStub = {
    duration: DURATION,
    count: function () { return players.length; },
    state: function () { var p = current(); return p === null ? null : p.getPlayerState(); },
    time: function () { var p = current(); return p === null ? null : p.getCurrentTime(); },
    rate: function () { var p = current(); return p === null ? null : p.getPlaybackRate(); },
    videoId: function () { var p = current(); return p === null ? null : p.videoId; }
  };

  window.YT = { Player: StubPlayer, PlayerState: STATE };
  if (typeof window.onYouTubeIframeAPIReady === "function") window.onYouTubeIframeAPIReady();
})();
`;
