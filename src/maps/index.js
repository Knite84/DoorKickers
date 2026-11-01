import { courtyard } from './courtyard.js';
import { partitions } from './partitions.js';
import { lodge } from './lodge.js';

export const maps = { courtyard, partitions, lodge };
export const resolveMap = id => Object.hasOwn(maps, id) ? maps[id] : courtyard;
