import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer } from '@core/video-synchronizer';

export function TimelineSlider(): React.ReactElement {
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const anchor = useAppStore((s) => s.syncAnchor);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const min = anchor ? anchor.video_ms / 1000 : 0;
  const max = duration > 0 ? duration : 1;
  const value = scrubbing ? scrubValue : Math.min(Math.max(currentTime, min), max);

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={0.001}
      value={value}
      onMouseDown={() => setScrubbing(true)}
      onChange={(e) => {
        const t = Number(e.target.value);
        setScrubValue(t);
        if (!scrubbing) videoSynchronizer.seekTo(t);
      }}
      onMouseUp={(e) => {
        videoSynchronizer.seekTo(Number((e.target as HTMLInputElement).value));
        setScrubbing(false);
      }}
      className="timeline-slider"
    />
  );
}
