const HELP_TOOLTIP_SEEN_KEY = 'metsuri-help-tooltip-seen';

export function shouldShowHelpTooltip(): boolean {
  if (sessionStorage.getItem(HELP_TOOLTIP_SEEN_KEY)) return false;
  sessionStorage.setItem(HELP_TOOLTIP_SEEN_KEY, 'true');
  return true;
}
