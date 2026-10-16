import {
  headFromSpatialPin,
  normalizeSpatialPinUrl,
  SpatialPinSchema,
  type LocationHint,
  type ResolvedSpatialPin,
  type SpatialPin,
  type SpatialPinHead,
} from "../contracts/spatial-pin.js";
import { resolveSpatialPinList } from "../services/spatial-pin-service.js";
import { cloneJson } from "../utils/json.js";

interface ProjectPins {
  pins: Map<string, SpatialPin>;
}

const pinsByProject = new Map<string, ProjectPins>();

function getStore(projectId: string): ProjectPins {
  let store = pinsByProject.get(projectId);
  if (!store) {
    store = { pins: new Map() };
    pinsByProject.set(projectId, store);
  }
  return store;
}

export function mockClearSpatialPins(): void {
  pinsByProject.clear();
}

export function mockListSpatialPins(projectId: string): SpatialPinHead[] {
  return [...getStore(projectId).pins.values()]
    .map(headFromSpatialPin)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function mockGetSpatialPin(
  projectId: string,
  pinId: string,
): SpatialPin | null {
  const pin = getStore(projectId).pins.get(pinId);
  return pin ? cloneJson(pin) : null;
}

export function mockUpsertSpatialPin(
  projectId: string,
  pin: SpatialPin,
): SpatialPin {
  const parsed = SpatialPinSchema.parse({
    ...pin,
    projectId,
    location: {
      ...pin.location,
      url: normalizeSpatialPinUrl(pin.location.url),
    },
  });
  getStore(projectId).pins.set(parsed.id, cloneJson(parsed));
  return cloneJson(parsed);
}

export function mockDeleteSpatialPin(projectId: string, pinId: string): boolean {
  return getStore(projectId).pins.delete(pinId);
}

export function mockResolveSpatialPins(
  projectId: string,
  hint: LocationHint,
): ResolvedSpatialPin[] {
  return resolveSpatialPinList([...getStore(projectId).pins.values()], hint);
}
