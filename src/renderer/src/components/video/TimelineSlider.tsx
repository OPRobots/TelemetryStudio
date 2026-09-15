import { useRef, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer } from '@core/video-synchronizer';

export function TimelineSlider(): React.ReactElement {
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const anchor = useAppStore((s) => s.syncAnchor);

  const draggingRef = useRef(false);
  const [dragValue, setDragValue] = useState(0);

  const min = anchor ? anchor.video_ms / 1000 : 0;
  const max = duration > 0 ? duration : 1;
  // Mientras se arrastra, manda el valor del usuario; si no, la posición real
  const value = draggingRef.current ? dragValue : Math.min(Math.max(currentTime, min), max);

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={0.001}
      value={value}
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onChange={(e) => {
        const t = Number(e.target.value);
        draggingRef.current = true;
        setDragValue(t);
        videoSynchronizer.seekTo(t);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        videoSynchronizer.seekTo(Number(e.currentTarget.value));
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      className="timeline-slider"
    />
  );
}
