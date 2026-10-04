/* ============================================================
   ScienceX 官网 —— 产品视频演示区（自定义播放器，点击即播）
   位于跑马灯与「用户画像与科研场景」之间，桌面/移动全适配
   ============================================================ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';

const DEMO_SRC = '/demo/science-x-demo.mp4';

const fmt = (t: number) => {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const LandingDemo: React.FC = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const [started, setStarted] = useState(false);   // 是否已首次点击播放
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const [barVisible, setBarVisible] = useState(true);

  // 播放中闲置 2.6s 自动隐藏控制条；暂停/未开始时常显
  const wakeControls = useCallback(() => {
    setBarVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setBarVisible(false);
    }, 2600);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setStarted(true);
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    wakeControls();
  }, [wakeControls]);

  const seek = (value: number) => {
    const v = videoRef.current;
    if (v) { v.currentTime = value; setTime(value); }
    wakeControls();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <section id="demo" className="landing-section demo-section">
      <div className="section-head">
        <div className="section-badge">Product Demo · Video Walkthrough</div>
        <h2 className="section-title">眼见为实：ScienceX 全流程演示</h2>
        <p className="section-sub">从选题调研到论文成稿，看 AI 科研工作台如何串起完整研究旅程。<br />点击画面即可播放。</p>
      </div>

      <div
        ref={wrapRef}
        className={`demo-player${isFull ? ' is-full' : ''}`}
        onMouseMove={wakeControls}
        onMouseLeave={() => { if (playing) setBarVisible(false); }}
      >
        <video
          ref={videoRef}
          className="demo-video"
          src={DEMO_SRC}
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onPlay={() => { setPlaying(true); wakeControls(); }}
          onPause={() => { setPlaying(false); setBarVisible(true); }}
          onEnded={() => { setPlaying(false); setBarVisible(true); }}
          onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        />

        {/* 首帧遮罩：未播放时点击即播 */}
        {!started && (
          <button type="button" className="demo-poster" onClick={togglePlay} aria-label="播放 ScienceX 产品演示视频">
            <span className="demo-poster-veil" aria-hidden="true" />
            <span className="demo-poster-corner tl" aria-hidden="true">SCIENCEX · DEMO</span>
            <span className="demo-poster-corner br" aria-hidden="true">{duration ? fmt(duration) : 'HD 1080P'}</span>
            <span className="demo-play-orb" aria-hidden="true">
              <span className="demo-play-ring" />
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
            <span className="demo-poster-caption">
              <strong>产品演示视频</strong>
              <em>工作台 · 文献 · 实验 · 论文 一站式体验</em>
            </span>
          </button>
        )}

        {/* 暂停/播完后的继续提示 */}
        {started && !playing && (
          <button type="button" className="demo-resume" onClick={togglePlay} aria-label="继续播放">
            <Icon name="play" size={20} strokeWidth={1.4} />
          </button>
        )}

        {/* 自定义控制条 */}
        <div className={`demo-controls${barVisible || !playing ? ' is-visible' : ''}`}>
          <button type="button" className="demo-ctrl-btn" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
            <Icon name={playing ? 'pause' : 'play'} size={15} strokeWidth={2.1} />
          </button>
          <span className="demo-time">{fmt(time)}</span>
          <input
            type="range"
            className="demo-seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(time, duration || 0)}
            onChange={e => seek(Number(e.target.value))}
            aria-label="调节播放进度"
            style={{ background: `linear-gradient(to right, #35b58a ${(duration ? time / duration : 0) * 100}%, rgba(255,255,255,.22) ${(duration ? time / duration : 0) * 100}%)` }}
          />
          <span className="demo-time demo-time-total">{fmt(duration)}</span>
          <button type="button" className="demo-ctrl-btn" onClick={toggleMute} aria-label={muted ? '取消静音' : '静音'}>
            <Icon name={muted ? 'volumeMute' : 'volumeUp'} size={15} strokeWidth={2} />
          </button>
          <button type="button" className="demo-ctrl-btn" onClick={toggleFullscreen} aria-label={isFull ? '退出全屏' : '全屏播放'}>
            <Icon name={isFull ? 'minimize' : 'maximize'} size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  );
};
