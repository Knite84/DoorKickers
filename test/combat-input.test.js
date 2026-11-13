import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindCombatMouse } from '../src/combat-input.js';
import { createMission } from '../src/simulation.js';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { equip, equippedWeapon } from '../src/kit.js';
import { fireWeapon } from '../src/weapons.js';

function mouse(target, type, button, buttons) {
  const event = new Event(type);
  Object.defineProperties(event, { button: { value: button }, buttons: { value: buttons } });
  target.dispatchEvent(event);
}
test('a suppressed pistol fires when left is pressed while right is already held', () => {
  const surface = new EventTarget(), releaseTarget = new EventTarget();
  const map = { ...courtyard, walls: [], props: [], doors: [], patrols: [[[2, 0], [3, 0]], [[4, 0], [5, 0]]] };
  const state = createMission(map, defaults); state.status = 'active'; equip(state, 'pistol');
  Object.assign(state.inventory.weapons.pistol, { suppressor: true, velocity: 'subsonic', ammoType: 'solid' });
  let aimed = false, held = false, aimChanges = 0;
  bindCombatMouse(surface, releaseTarget, {
    primaryDown: () => { held = true; assert.equal(aimed, true); fireWeapon(state, map, defaults, [0, 1.65, 0], [1, 0, 0]); },
    primaryUp: () => { held = false; }, secondaryDown: () => { aimed = true; aimChanges++; },
  });
  // Real browser sequence: no second pointerdown when the left button joins right.
  mouse(surface, 'pointerdown', 2, 2); mouse(surface, 'mousedown', 2, 2);
  mouse(surface, 'mousedown', 0, 3);
  assert.equal(state.ammo, equippedWeapon(state).magazine - 1); assert.equal(state.guards[0].health, 0); assert.equal(held, true);
  mouse(releaseTarget, 'mouseup', 0, 2); assert.equal(held, false);
  state.elapsed = 1;
  mouse(surface, 'mousedown', 0, 3);
  assert.equal(state.ammo, equippedWeapon(state).magazine - 2); assert.equal(aimChanges, 1); assert.equal(aimed, true);
  // Releasing right must not cancel left-button fire.
  mouse(releaseTarget, 'mouseup', 2, 1); assert.equal(held, true);
  mouse(releaseTarget, 'mouseup', 0, 0); assert.equal(held, false);
});
test('button binding does not duplicate clicks and can be detached', () => {
  const surface = new EventTarget(), releaseTarget = new EventTarget(); let fired = 0;
  const detach = bindCombatMouse(surface, releaseTarget, { primaryDown: () => fired++, primaryUp: () => {}, secondaryDown: () => {} });
  mouse(surface, 'pointerdown', 0, 1); mouse(surface, 'mousedown', 0, 1); assert.equal(fired, 1);
  detach(); mouse(surface, 'mousedown', 0, 1); assert.equal(fired, 1);
});

test('mouse button 4 triggers melee independently of left and right buttons', () => {
  const surface = new EventTarget(), releaseTarget = new EventTarget(); let strikes = 0, shots = 0;
  bindCombatMouse(surface, releaseTarget, { primaryDown: () => shots++, primaryUp: () => {}, secondaryDown: () => {}, meleeDown: () => strikes++ });
  mouse(surface, 'mousedown', 3, 8); mouse(surface, 'mousedown', 0, 9);
  assert.equal(strikes, 1); assert.equal(shots, 1);
});
