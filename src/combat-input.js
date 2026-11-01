// Mouse buttons must be tracked independently. Pointer events only report the
// first button down and last button up in a multi-button chord.
export function bindCombatMouse(surface, releaseTarget, { primaryDown, primaryUp, secondaryDown }) {
  const down = event => {
    if (event.button === 0) primaryDown(event);
    else if (event.button === 2) secondaryDown(event);
  };
  const up = event => { if (event.button === 0) primaryUp(event); };
  surface.addEventListener('mousedown', down);
  releaseTarget.addEventListener('mouseup', up);
  return () => {
    surface.removeEventListener('mousedown', down);
    releaseTarget.removeEventListener('mouseup', up);
  };
}
