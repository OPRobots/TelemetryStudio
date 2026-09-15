import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer } from '@core/video-synchronizer';

export function TimelineSlider(): React.ReactElement {
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const value = scrubbing ? scrubValue : currentTime;
  const max = duration > 0 ? duration : 1;

  return (
    <input
      type="range"
      min={0}
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
      className="timeline-slider w-full"
      style={{ accentColor: '#3b82f6' }}
    />
  );
}
