import { PlaybackControls } from '../video/PlaybackControls';
import { TimelineSlider } from '../video/TimelineSlider';

export function Toolbar(): React.ReactElement {
  return (
    <div
      className="flex flex-col gap-2.5 px-4 py-3"
      style={{ backgroundColor: 'var(--bg-panel)', borderTop: '1px solid var(--bg-border)' }}
    >
      <TimelineSlider />
      <PlaybackControls />
    </div>
  );
}
