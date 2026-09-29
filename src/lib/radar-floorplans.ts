export type FloorplanSpot = { x: number; y: number; w: number; h: number };
export type FloorplanConfig = { src: string; width: number; height: number; rooms: Record<string, FloorplanSpot> };

/** Percent-based hotspots sit on the rendered architectural plan, so live ticket
 * state stays interactive without painting over the reference-quality floorplan.
 * Shared between the radar UI and the layout-regeneration API — both need the same
 * reference image and baseline room positions to reason about what actually moved. */
export const FLOORPLANS: Record<string, FloorplanConfig> = {
  kwality: {
    src: '/radar/kwality-floorplan.png', width: 1774, height: 887,
    rooms: {
      'Studio 1': {x: 2, y: 8, w: 25, h: 35}, 'Studio 2': {x: 2, y: 58, w: 30, h: 31},
      'Strength Studio': {x: 60, y: 10, w: 14, h: 49}, 'PowerCycle Studio': {x: 78, y: 15, w: 20, h: 47},
      'His Space': {x: 49, y: 20, w: 13, h: 31}, 'Her Space': {x: 27, y: 2, w: 14, h: 18},
      'GUEST WASHROOM': {x: 31, y: 20, w: 11, h: 14}, 'Brain Cell': {x: 21, y: 59, w: 13, h: 24},
      Pantry: {x: 31, y: 39, w: 12, h: 13}, 'Lobby / Reception': {x: 2, y: 43, w: 30, h: 17},
    },
  },
  supreme: {
    src: '/radar/supreme-floorplan.png', width: 1969, height: 799,
    rooms: {
      'Strength Lab': {x: 9, y: 7, w: 24, h: 33}, 'PowerCycle Studio': {x: 33, y: 7, w: 17, h: 33},
      'Barre Studio': {x: 50, y: 7, w: 21, h: 33}, 'Brain Cell': {x: 71, y: 22, w: 7, h: 30},
      'Her Space': {x: 83, y: 7, w: 14, h: 30}, 'His Space': {x: 83, y: 52, w: 14, h: 28},
      'Front Desk': {x: 8, y: 41, w: 23, h: 23}, Pantry: {x: 35, y: 64, w: 36, h: 20},
      Boutique: {x: 8, y: 64, w: 23, h: 22},
    },
  },
  kenkere: {
    src: '/radar/kenkere-floorplan.png', width: 1672, height: 941,
    rooms: {
      'Studio 1': {x: 4, y: 7, w: 39, h: 45}, 'Studio 2': {x: 50, y: 7, w: 39, h: 45},
      'Lobby / Reception': {x: 8, y: 59, w: 53, h: 27}, 'Washroom & Changing': {x: 68, y: 57, w: 23, h: 30},
    },
  },
  courtside: {
    src: '/radar/courtside-floorplan.png', width: 1672, height: 941,
    rooms: {
      'Main Studio Floor': {x: 4, y: 7, w: 58, h: 47}, 'Reception / Lobby': {x: 6, y: 61, w: 33, h: 24},
      'Member Lounge': {x: 48, y: 60, w: 43, h: 26},
    },
  },
  copper: {
    src: '/radar/copper-floorplan.png', width: 1672, height: 941,
    rooms: {
      'Main Studio Floor': {x: 4, y: 7, w: 61, h: 48}, Reception: {x: 7, y: 61, w: 38, h: 25},
      'Changing Area': {x: 68, y: 55, w: 24, h: 32},
    },
  },
};
