import { courtyard } from './courtyard.js';
import { partitions } from './partitions.js';
import { lodge } from './lodge.js';
import { martelli } from './martelli.js';

export const maps = { courtyard, partitions, lodge, martelli };
export const resolveMap = id => Object.hasOwn(maps, id) ? maps[id] : courtyard;
