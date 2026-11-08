// Registry of stationery components (drawn in this order, back to front).
// To add a new item: register it here and give it a position in layout.js.
// (StaplerButton.jsx and PencilCaseDropdown.jsx are kept aside, not on the desk.)
import PenToggle from './PenToggle';
import TapeMeasureSlider from './TapeMeasureSlider';
import StampButton from './StampButton';
import NotebookTabs from './NotebookTabs';
import MaskingTapeTags from './MaskingTapeTags';
import SharpenerProgress from './SharpenerProgress';
import MagnifierSearch from './MagnifierSearch';

export const STATIONERY = [
  { id: 'button', label: 'Button', Component: StampButton },
  { id: 'tab', label: 'Tab', Component: NotebookTabs },
  { id: 'tag', label: 'Tag', Component: MaskingTapeTags },
  { id: 'progress', label: 'Progress', Component: SharpenerProgress },
  { id: 'search', label: 'Search', Component: MagnifierSearch },
  // Tape measure above the slip, so a fully pulled blade lies over the paper.
  { id: 'slider', label: 'Slider', Component: TapeMeasureSlider },
  { id: 'toggle', label: 'Toggle', Component: PenToggle },
];
